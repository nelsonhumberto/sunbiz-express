"""
Sunbiz Cloudflare-bypass scraper microservice.

Runs locally alongside Next.js so that search.sunbiz.org can be reached
from a residential/desktop IP with a real browser TLS fingerprint.

Usage:
    cd scripts/sunbiz-scraper
    pip install -r requirements.txt    # or: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
    python app.py                      # listens on http://localhost:3334

Next.js will call:
    GET http://localhost:3334/entity?doc=L15000063512
and receive JSON matching FloridaEntityDetail from lib/sunbiz.ts.
"""
from __future__ import annotations

import logging
import re
import sys
from typing import Any

import cloudscraper
from bs4 import BeautifulSoup, Tag
from flask import Flask, jsonify, request

# ── Constants ──────────────────────────────────────────────────────────────

SUNBIZ_BASE = "https://search.sunbiz.org"
SUNBIZ_BY_DOC = f"{SUNBIZ_BASE}/Inquiry/CorporationSearch/ByDocumentNumber"
PORT = 3334

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [sunbiz-scraper] %(levelname)s %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger(__name__)

# ── Shared scraper session ─────────────────────────────────────────────────

_scraper = cloudscraper.create_scraper(
    browser={"browser": "chrome", "platform": "windows", "mobile": False},
    delay=3,
)

# ── Flask app ──────────────────────────────────────────────────────────────

app = Flask(__name__)


# ── Address parser ─────────────────────────────────────────────────────────

def _parse_address_text(text: str) -> dict[str, str]:
    """
    Parse Sunbiz address strings like:
        "5710 W 20th Ct. HIALEAH, FL 33016"
        "16826 NW 83rd Ct Miami Lakes, FL 33016"
    into {address_1, city, state, zip, country}.
    """
    addr: dict[str, str] = {"country": "US"}
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s*Changed:\s*\d{2}/\d{2}/\d{4}", "", text).strip()

    if not text:
        return addr

    # Pattern: "STREET CITY, STATE ZIP"  (city may be multiple words)
    m = re.match(
        r"^(.*?)\s+([A-Za-z][A-Za-z ]*?),\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$",
        text,
    )
    if m:
        addr["address_1"] = m.group(1).strip()
        addr["city"] = m.group(2).strip().title()
        addr["state"] = m.group(3)
        addr["zip"] = m.group(4)
    else:
        # Fallback: just store whole thing as street
        addr["address_1"] = text

    return addr


def _extract_address_from_section(section: Tag) -> dict[str, str] | None:
    """
    Pull the address out of a <div class='detailSection'> that contains
    address info after the heading span.
    """
    # Collect all text spans (label spans have class, value spans usually don't)
    lines: list[str] = []
    for child in section.children:
        if isinstance(child, Tag):
            if child.name in ("span", "p", "br"):
                t = child.get_text(" ", strip=True)
                if t:
                    lines.append(t)
        else:
            t = str(child).strip()
            if t:
                lines.append(t)

    # Filter out the heading line and "Changed:" lines
    cleaned = []
    for ln in lines:
        ln_stripped = ln.strip()
        if not ln_stripped:
            continue
        if re.match(r"Changed:\s*\d", ln_stripped):
            continue
        # Skip heading lines (usually contain "Address" or "Registered Agent")
        if re.match(r"(Principal|Mailing|Registered|Address|Name\s*&)", ln_stripped, re.I):
            continue
        cleaned.append(ln_stripped)

    if not cleaned:
        return None

    full = " ".join(cleaned)
    parsed = _parse_address_text(full)
    return parsed if parsed.get("address_1") or parsed.get("city") else None


# ── Main parser ────────────────────────────────────────────────────────────

def _parse_detail_page(html: str, doc_number: str) -> dict[str, Any]:
    """
    Parse a Sunbiz SearchResultDetail page into a FloridaEntityDetail-compatible dict.

    The page uses <div class="detailSection TYPENAME"> sections:
      corporationName   → name + filing type display
      filingInformation → doc#, FEI, date, state, status
      (unlabelled)      → principal, mailing, registered agent, officers
    """
    soup = BeautifulSoup(html, "lxml")
    result: dict[str, Any] = {"corporation_number": doc_number}

    # ── Corporation name + filing type ─────────────────────────────────────
    corp_div = soup.find("div", class_="corporationName")
    if corp_div:
        full_text = corp_div.get_text(" ", strip=True)
        # "Florida Limited Liability Company USA CORPORATE SERVICES GROUP, LLC"
        filing_types = [
            "Florida Limited Liability Company",
            "Florida Profit Corporation",
            "Foreign Profit Corporation",
            "Florida Non Profit Corporation",
            "Foreign Limited Liability",
        ]
        filing_display = ""
        remaining = full_text
        for ft in filing_types:
            if ft.lower() in full_text.lower():
                filing_display = ft
                remaining = re.sub(re.escape(ft), "", full_text, flags=re.I).strip()
                break
        result["corporation_name"] = remaining or full_text
        if filing_display:
            result["filing_type_display"] = filing_display
            if "limited liability" in filing_display.lower():
                result["filing_type"] = "FLAL"
            else:
                result["filing_type"] = "DOMP"

    # ── Filing information ─────────────────────────────────────────────────
    filing_div = soup.find("div", class_="filingInformation")
    if filing_div:
        text = filing_div.get_text(" ", strip=True)

        m = re.search(r"Document Number\s+([A-Z]\d{8,12})", text)
        if m:
            result["corporation_number"] = m.group(1)

        m = re.search(r"FEI/EIN Number\s+([\d-]+)", text)
        if m:
            result["fei_number"] = m.group(1)

        m = re.search(r"Date Filed\s+(\d{2}/\d{2}/\d{4})", text)
        if m:
            parts = m.group(1).split("/")
            result["file_date"] = f"{parts[2]}-{parts[0]}-{parts[1]}"

        m = re.search(r"Status\s+(\w+)", text)
        if m:
            result["status"] = m.group(1)

    # ── Address / agent / officer sections (unlabelled detailSection divs) ──
    unlabelled = soup.find_all("div", class_=lambda c: c and "detailSection" in c.split() and c.strip() == "detailSection")

    section_labels = {
        "principal": None,
        "mailing": None,
        "agent": None,
        "officers": [],
    }

    for sec in unlabelled:
        heading = sec.find(["span", "h3", "h4"])
        heading_text = (heading.get_text(strip=True) if heading else "").lower()

        if "principal" in heading_text:
            section_labels["principal"] = sec
        elif "mailing" in heading_text:
            section_labels["mailing"] = sec
        elif "registered agent" in heading_text:
            section_labels["agent"] = sec
        elif "authorized person" in heading_text or "officer" in heading_text or "member" in heading_text:
            section_labels["officers"].append(sec)

    # ── Principal address ──────────────────────────────────────────────────
    if section_labels["principal"]:
        sec = section_labels["principal"]
        full_text = sec.get_text(" ", strip=True)
        # Remove heading
        full_text = re.sub(r"Principal Address\s*", "", full_text).strip()
        full_text = re.sub(r"Changed:\s*\d{2}/\d{2}/\d{4}", "", full_text).strip()
        if full_text:
            result["principal_address"] = _parse_address_text(full_text)

    # ── Mailing address ────────────────────────────────────────────────────
    if section_labels["mailing"]:
        sec = section_labels["mailing"]
        full_text = sec.get_text(" ", strip=True)
        full_text = re.sub(r"Mailing Address\s*", "", full_text).strip()
        full_text = re.sub(r"Changed:\s*\d{2}/\d{2}/\d{4}", "", full_text).strip()
        if full_text:
            result["mailing_address"] = _parse_address_text(full_text)

    # ── Registered agent ───────────────────────────────────────────────────
    if section_labels["agent"]:
        sec = section_labels["agent"]
        full_text = sec.get_text(" ", strip=True)
        # Remove "Registered Agent Name & Address"
        full_text = re.sub(r"Registered Agent Name\s*&?\s*Address\s*", "", full_text).strip()
        full_text = re.sub(r"(Name|Address) Changed:\s*\d{2}/\d{2}/\d{4}", "", full_text).strip()
        full_text = re.sub(r"\s+", " ", full_text).strip()

        # First token(s) up to the address are the name
        # Detect city+state+zip to split name from address
        addr_match = re.search(r"(.+?)\s+(.+,\s*[A-Z]{2}\s+\d{5}.*)", full_text)
        ra_name = ""
        ra_addr_text = ""
        if addr_match:
            ra_name = addr_match.group(1).strip()
            ra_addr_text = addr_match.group(2).strip()
        else:
            ra_name = full_text

        # Agent name is everything before the first digit (street number)
        digit_match = re.search(r"\d", full_text)
        if digit_match:
            ra_name = full_text[: digit_match.start()].strip().rstrip(",").strip()
            ra_addr_text = full_text[digit_match.start() :].strip()
        result["registered_agent"] = {
            "name": ra_name,
            "address": _parse_address_text(ra_addr_text) if ra_addr_text else None,
        }

    # ── Officers / members ─────────────────────────────────────────────────
    officers: list[dict[str, str]] = []
    for sec in section_labels["officers"]:
        full_text = sec.get_text(" ", strip=True)
        # Remove heading
        full_text = re.sub(r"Authorized Person\(s\) Detail.*?(Name\s*&\s*Address\s*)?", "", full_text, flags=re.I).strip()
        full_text = re.sub(r"Title\s+", "", full_text).strip()

        # Each officer: "Title NAME ADDRESS"
        # Titles: MGR, MGRM, AMBR, DIRECTOR, OFFICER, VP, PRES, SEC, CEO, CFO
        title_pattern = r"\b(MGR|MGRM|AMBR|DIRECTOR|OFFICER|VP|PRES|SEC|CEO|CFO|TREAS|REGISTERED AGENT)\b"
        chunks = re.split(title_pattern, full_text, flags=re.I)

        i = 1
        while i < len(chunks) - 1:
            title = chunks[i].strip().upper()
            content = chunks[i + 1].strip() if i + 1 < len(chunks) else ""
            # content = "NAME ADDRESS..." — name is typically first line/word group before street
            # Heuristic: name ends before a digit (start of address)
            name_match = re.match(r"^([A-Z ,.''-]+?)(?=\s+\d|\s*$)", content, re.I)
            name = name_match.group(1).strip().rstrip(",") if name_match else content[:50]
            if name:
                officers.append({"title": title, "name": name})
            i += 2

        if not officers and full_text:
            # Fallback: just store the raw text as one officer
            officers.append({"title": "MGR", "name": full_text[:100]})

    if officers:
        result["officers"] = officers

    # ── Fallbacks ──────────────────────────────────────────────────────────
    if not result.get("corporation_name"):
        result["corporation_name"] = f"Entity {doc_number}"
    if "principal_address" not in result:
        result["principal_address"] = None
    if "mailing_address" not in result:
        result["mailing_address"] = None
    if "registered_agent" not in result:
        result["registered_agent"] = None
    if "officers" not in result:
        result["officers"] = []

    return result


# ── Lookup pipeline ────────────────────────────────────────────────────────

def lookup_entity(doc_number: str) -> dict[str, Any]:
    doc_number = doc_number.strip().upper()
    log.info("Looking up document number: %s", doc_number)

    try:
        resp = _scraper.post(
            SUNBIZ_BY_DOC,
            data={
                "SearchTerm": doc_number,
                "InquiryType": "DocumentNumber",
                "SearchNameOrder": "",
            },
            timeout=25,
        )
    except Exception as exc:
        raise RuntimeError(f"Sunbiz request failed: {exc}") from exc

    if resp.status_code not in (200,):
        raise RuntimeError(f"Sunbiz returned HTTP {resp.status_code}")

    body = resp.text
    if "Just a moment" in body or "cf-browser-verification" in body:
        raise RuntimeError("Cloudflare challenge — restart the scraper and try again")

    # If we were redirected to a detail page, the URL contains aggregateId
    if "SearchResultDetail" in resp.url and doc_number.upper() in body.upper():
        log.info("Direct detail redirect to: %s", resp.url)
        result = _parse_detail_page(body, doc_number)
        log.info("Parsed: %s", result.get("corporation_name"))
        return result

    # Otherwise we may be on a results list — try to find the exact doc number row
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(body, "lxml")
    for td in soup.find_all("td"):
        if td.get_text(strip=True).upper() == doc_number:
            prev = td.find_previous_sibling("td")
            if prev:
                a = prev.find("a")
                if a and a.get("href"):
                    href = a["href"]
                    detail_url = href if href.startswith("http") else f"{SUNBIZ_BASE}{href}"
                    log.info("Following detail link: %s", detail_url)
                    try:
                        dr = _scraper.get(detail_url, timeout=20)
                        return _parse_detail_page(dr.text, doc_number)
                    except Exception as exc:
                        raise RuntimeError(f"Detail page fetch failed: {exc}") from exc

    raise LookupError(
        f"Document number {doc_number!r} not found on search.sunbiz.org. "
        "Confirm at https://search.sunbiz.org/Inquiry/CorporationSearch/ByDocumentNumber"
    )


# ── Routes ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return jsonify({"ok": True})


@app.get("/entity")
def entity():
    doc = request.args.get("doc", "").strip().upper()
    if not doc or len(doc) < 5:
        return jsonify({"error": "doc parameter required (e.g. ?doc=L15000063512)"}), 400

    try:
        data = lookup_entity(doc)
        return jsonify(data)
    except LookupError as exc:
        return jsonify({"error": str(exc), "code": "not_found"}), 404
    except RuntimeError as exc:
        return jsonify({"error": str(exc), "code": "scrape_error"}), 502
    except Exception as exc:
        log.exception("Unexpected error for doc=%s", doc)
        return jsonify({"error": str(exc), "code": "unknown"}), 500


# ── Entry point ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    log.info("Starting Sunbiz scraper on http://localhost:%d", PORT)
    app.run(host="127.0.0.1", port=PORT, debug=False)
