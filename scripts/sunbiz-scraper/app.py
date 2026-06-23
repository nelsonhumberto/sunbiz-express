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
import os
import re
import sys
from typing import Any

import cloudscraper
from bs4 import BeautifulSoup, Tag
from flask import Flask, jsonify, request

# ── Constants / configuration ───────────────────────────────────────────────

SUNBIZ_BASE = "https://search.sunbiz.org"
SUNBIZ_BY_DOC = f"{SUNBIZ_BASE}/Inquiry/CorporationSearch/ByDocumentNumber"

# Hosting platforms (Render/Railway/Fly/Heroku/Cloud Run) inject the port to
# bind to via $PORT. Default to 3334 for local dev.
PORT = int(os.environ.get("PORT", "3334"))

# Optional shared-secret. When set, every /entity request must send a matching
# `X-Proxy-Token` header. This keeps the public deployment from being an open
# scraping relay. Leave unset for local dev.
PROXY_TOKEN = os.environ.get("SUNBIZ_PROXY_TOKEN", "").strip()

# Optional upstream proxy (residential / CF-bypass). Datacenter IPs are often
# hard-blocked by Cloudflare; routing cloudscraper through a residential proxy
# (e.g. http://user:pass@gateway:port) restores reliability in production.
UPSTREAM_PROXY = os.environ.get("SUNBIZ_UPSTREAM_PROXY", "").strip()

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
if UPSTREAM_PROXY:
    _scraper.proxies = {"http": UPSTREAM_PROXY, "https": UPSTREAM_PROXY}
    log.info("Routing Sunbiz requests through upstream proxy.")

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


# City/State/Zip pattern, e.g. "Miami Lakes, FL 33016" or "HIALEAH, FL 33016-1234"
_CSZ_RE = re.compile(r"^(.*?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$")

# Common US street-type suffixes used to split a flattened "street city" string
# when Sunbiz collapses the street and city onto a single line (no <br>).
_STREET_SUFFIXES = {
    "st", "street", "ave", "avenue", "blvd", "boulevard", "dr", "drive", "ln",
    "lane", "ct", "court", "cir", "circle", "way", "ter", "terrace", "pl",
    "place", "rd", "road", "hwy", "highway", "pkwy", "parkway", "trl", "trail",
    "sq", "square", "loop", "pass", "run", "row", "walk", "path", "pike", "plz",
    "plaza", "ext", "expy", "expressway", "byp", "cres", "crossing", "xing",
}


def _split_street_city(text: str) -> tuple[str, str]:
    """Split a flattened "street ... city ..." string (no state/zip) into
    (street, city) using the LAST street-type suffix token as the boundary.
    Falls back to treating the whole string as the street when no suffix is
    found (caller decides what to do with an empty city)."""
    tokens = text.split()
    last_suffix_idx = -1
    for i, tok in enumerate(tokens):
        if tok.strip(".,").lower() in _STREET_SUFFIXES:
            last_suffix_idx = i
    if 0 <= last_suffix_idx < len(tokens) - 1:
        street = " ".join(tokens[: last_suffix_idx + 1])
        city = " ".join(tokens[last_suffix_idx + 1 :])
        return street, city
    return text, ""


def _parse_address_smart(text: str) -> dict[str, str] | None:
    """Robustly parse an address block into {address_1, address_2?, city,
    state, zip, country}. Prefers the line structure (street on its own
    line(s), then "CITY, ST ZIP"); falls back to a street-suffix split when
    the whole address is collapsed onto one line."""
    addr: dict[str, str] = {"country": "US"}

    lines: list[str] = []
    for ln in text.split("\n"):
        ln = re.sub(r"\s+", " ", ln).strip()
        if not ln:
            continue
        if re.match(r"(Name|Address)?\s*Changed:\s*\d", ln, re.I):
            continue
        lines.append(ln)
    if not lines:
        return None

    # Preferred path: a standalone "CITY, ST ZIP" line — everything above it
    # is the street, which removes all street/city ambiguity.
    for i, ln in enumerate(lines):
        m = _CSZ_RE.match(ln)
        if m:
            street_lines = lines[:i]
            addr["city"] = m.group(1).strip().title()
            addr["state"] = m.group(2)
            addr["zip"] = m.group(3)
            if street_lines:
                addr["address_1"] = street_lines[0]
                if len(street_lines) > 1:
                    addr["address_2"] = " ".join(street_lines[1:])
            return addr if (addr.get("address_1") or addr.get("city")) else None

    # Fallback: single flattened line like "16826 NW 83rd Ct Miami Lakes, FL 33016".
    full = " ".join(lines)
    m = re.search(r"^(.*?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b", full)
    if m:
        addr["state"] = m.group(2)
        addr["zip"] = m.group(3)
        street_city = m.group(1).strip()
        street, city = _split_street_city(street_city)
        addr["address_1"] = street or street_city
        if city:
            addr["city"] = city.title()
        return addr

    addr["address_1"] = full
    return addr


def _section_address(section: Tag, *heading_res: str) -> dict[str, str] | None:
    """Extract + parse an address from a detailSection, dropping the heading
    line(s) and any 'Changed:' annotations, preserving line breaks so the
    street/city boundary is unambiguous."""
    txt = section.get_text("\n", strip=True)
    kept: list[str] = []
    for ln in txt.split("\n"):
        ln = re.sub(r"\s+", " ", ln).strip()
        if not ln:
            continue
        if any(re.match(h, ln, re.I) for h in heading_res):
            continue
        if re.match(r"(Name|Address)?\s*Changed:\s*\d", ln, re.I):
            continue
        kept.append(ln)
    return _parse_address_smart("\n".join(kept))


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
        parsed = _section_address(section_labels["principal"], r"Principal Address$")
        if parsed:
            result["principal_address"] = parsed

    # ── Mailing address ────────────────────────────────────────────────────
    if section_labels["mailing"]:
        parsed = _section_address(section_labels["mailing"], r"Mailing Address$")
        if parsed:
            result["mailing_address"] = parsed

    # ── Registered agent ───────────────────────────────────────────────────
    if section_labels["agent"]:
        sec = section_labels["agent"]
        lines: list[str] = []
        for ln in sec.get_text("\n", strip=True).split("\n"):
            ln = re.sub(r"\s+", " ", ln).strip()
            if not ln:
                continue
            if re.match(r"Registered Agent Name\s*&?\s*Address$", ln, re.I):
                continue
            if re.match(r"(Name|Address)?\s*Changed:\s*\d", ln, re.I):
                continue
            lines.append(ln)

        ra_name = ""
        addr_lines = lines
        # The agent name is the first line, unless it already looks like the
        # start of an address (begins with a street number or is a CITY,ST ZIP).
        if lines and not re.match(r"^\d", lines[0]) and not _CSZ_RE.match(lines[0]):
            ra_name = lines[0].rstrip(",").strip()
            addr_lines = lines[1:]

        result["registered_agent"] = {
            "name": ra_name or None,
            "address": _parse_address_smart("\n".join(addr_lines)) if addr_lines else None,
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
    # Shared-secret gate (only enforced when SUNBIZ_PROXY_TOKEN is set).
    if PROXY_TOKEN:
        supplied = request.headers.get("X-Proxy-Token", "")
        if supplied != PROXY_TOKEN:
            return jsonify({"error": "Unauthorized", "code": "unauthorized"}), 401

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
    # Local dev entry point. In production run under gunicorn (see Dockerfile):
    #   gunicorn --bind 0.0.0.0:$PORT --workers 2 --timeout 60 app:app
    host = "0.0.0.0" if os.environ.get("SUNBIZ_BIND_ALL") == "true" else "127.0.0.1"
    log.info("Starting Sunbiz scraper on http://%s:%d", host, PORT)
    app.run(host=host, port=PORT, debug=False)
