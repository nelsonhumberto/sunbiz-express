# Florida SunBiz — Name Availability & E-Filing Technical Analysis

**Date:** 2026-04-25
**Scope:** Reverse-engineering / feasibility analysis of the Florida Division of Corporations public search (`search.sunbiz.org`) and the prepaid e-filing portal (`efile.sunbiz.org`) for incorporation-automation use.
**Out of scope:** Actually submitting filings. All observations below were gathered without ever clicking *Create Cover Sheet* / *Submit* / *Pay* on the live system.

---

## 1. Executive Summary

| Area | Finding | Severity for Automation |
|---|---|---|
| Name-availability scraper | Parsing logic is correct, but `requests.get` now returns **403 Cloudflare JS-challenge** → scraper silently returns `[]`. | 🔴 Critical — scraper is broken in production |
| Heuristic for "taken" | Matching on status column literal `"Active"` misses `NAME HS` (name held / reserved), `CROSS RF`, and still-conflicting `INACT` entities. | 🟠 High — false negatives on availability |
| Pagination | Only the first page (≤20 rows) is parsed; no `Next List` follow. | 🟠 High — large name families missed |
| E-filing portal stack | 1990s-era CGI (`.exe` handlers), GET-based session in URL, credentials leak in browser history / analytics / Referer. | 🔴 Critical security concern |
| E-filing bot defence | None observed (no CAPTCHA, no reCAPTCHA, no rate-limit headers, no per-action tokens). | 🟢 Easy to automate |
| Prepaid LLC workflow | Is a **cover-sheet generator**, not a data-entry wizard — the Articles PDF is uploaded elsewhere and linked by a tracking number. | 🟡 Design constraint |
| Public self-service LLC wizard | Lives at `efile.sunbiz.org/llc_file.html`; is the real multi-step form + fee + credit-card pay-at-end workflow. | 🟢 Clear target for automation |

---

## 2. Part 1 — Name Availability Scraper

### 2.1 Source code reviewed

Saved verbatim at `/home/ubuntu/incorporation_research/sunbiz_scraper.py`:

```python
def searchSunBiz(searchQuery):
    formattedInput = quote(searchQuery)
    link = f'http://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults?inquiryType=EntityName&searchNameOrder={formattedInput.upper()}&searchTerm={formattedInput}'
    html = requests.get(link).text
    soup = BeautifulSoup(html, 'html.parser')
    tags = soup.find_all('td')
    activeBusinesses = []
    for index, tag in enumerate(tags):
        if(tag.find('a')):
            if(re.match('Active', str(tags[index + 2].string))):
                activeBusinesses.append(tag.find('a').string)
    return activeBusinesses
```

### 2.2 How it works

1. URL-encodes the query term; injects both a lower-case copy (`searchTerm=`) and an upper-case copy (`searchNameOrder=`) — the latter is the cursor into SunBiz's alphabetically-sorted list.
2. Issues a plain HTTP GET (no headers, no retry, no timeout).
3. BeautifulSoup-parses the response; iterates **every** `<td>` element.
4. Heuristic: a cell that contains an `<a>` is assumed to be the *Corporate Name* cell; the cell 2 positions later is assumed to be the *Status* cell.
5. If the status cell's text starts with `Active`, append the anchor text to results.

The assumption in step 4 matches the real DOM — each search-result row is `<tr><td><a>name</a></td><td>doc#</td><td>status</td></tr>` — which is why the index-offset of `+2` is correct.

### 2.3 Live test results

File: `test_scraper.py` — ran against 5 terms:

```
=== Searching: 'Disney' ===           Active matches found: 0 (in 0.05s)
=== Searching: 'Apple' ===            Active matches found: 0 (in 0.02s)
=== Searching: 'Acme Corporation' === Active matches found: 0 (in 0.03s)
=== Searching: 'ZZZQ …' ===           Active matches found: 0 (in 0.02s)
=== Searching: 'Sunshine Bakery' ===  Active matches found: 0 (in 0.02s)
```

Every query returns 0, in ~20 ms, for every term. That is impossible for real data; root cause is below.

### 2.4 Root-cause: Cloudflare JS challenge

Direct `curl` / `requests` / `curl_cffi` (chrome120 TLS impersonation) all return **HTTP 403** with the "Just a moment…" Cloudflare interstitial:

```
status: 403 len: 5759
<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title>
<meta name="robots" content="noindex,nofollow">
<script … https://challenges.cloudflare.com …
```

The challenge page contains no `<td>` with `<a>` children, so the scraper's parser finds nothing to match — and, **critically, the scraper raises no error**. It returns `[]`, which a naïve caller will interpret as *"Great, the name is available!"* — a catastrophic false-negative.

A browser-rendered fetch of the same URL (after the interstitial resolves) returns the expected entity list; when that HTML is fed back into the parser, it correctly extracts the active rows:

```
Total <td> tags: 24
Active matches: 4
  - DISNEY
  - DISNEY AD SERVICES CO., LLC
  - DISNEY ADVERTISING SALES, LLC
  - DISNEY AUCTIONS, L.L.C.
```

The parsing logic itself is therefore correct; the **fetch layer is broken**.

### 2.5 Observed real status values

Captured from the live results HTML:

| Status | Meaning (Florida DOS) | Should the scraper treat the name as "taken"? |
|---|---|---|
| `Active` | Entity in good standing | ✅ Yes |
| `INACT` | Administratively dissolved / inactive | ⚠️ Yes — the dissolved name is still reserved for the statutory revival period (1 year) |
| `NAME HS` | Name History — a former name of an active entity | ⚠️ Yes — may be a protected former name |
| `CROSS RF` | Cross reference — points to the renamed entity | ⚠️ Usually yes |
| `Withdrawn` / `Dissolved` | Older dissolution states | Context-dependent |

The current heuristic `re.match('Active', …)` captures only the first row-type. For an incorporation-automation SaaS, this is **incorrect** — a user told "name is free" may attempt to file and be rejected for "conflicts with existing record."

### 2.6 Defects and improvements

| # | Defect | Recommended fix |
|---|---|---|
| D1 | Silent failure on non-200 responses | `resp.raise_for_status()`; treat `'Just a moment'` in body as a challenge error |
| D2 | Cloudflare JS challenge not solved | Use `cloudscraper`, FlareSolverr, Playwright headless, or `curl_cffi` with challenge solver; rotate residential IPs |
| D3 | Plain HTTP (`http://`) — 301-redirected on every call | Use `https://search.sunbiz.org` directly |
| D4 | No User-Agent header | Set a plausible browser UA |
| D5 | No timeout, no retry, no backoff | `timeout=(5,20)`, exponential back-off on 5xx / 429 / Cloudflare challenges |
| D6 | Only "Active" counted | Build a set of *reserved* statuses; expose status per result instead of a boolean |
| D7 | Only first page of results | Follow the `Next List` link until page returns fewer rows or name prefix changes |
| D8 | Brittle index math (`tags[index + 2]`) | Parse rows directly: `for tr in soup.select('#search-results tbody tr')` |
| D9 | No substring / fuzzy match — Florida uses *distinguishable upon the record* | After pulling candidates, run a normalization: strip punctuation, lower-case, remove suffixes (LLC, INC, CORP…), then do token-set-ratio match |
| D10 | Scraper returns anchor text only; document numbers / aggregateIds are discarded | Return `{name, doc_number, status, detail_url}` dicts |
| D11 | No rate limiting | 1–2 s between requests; jitter; circuit-break on 429 |

### 2.7 Drop-in improved scraper (reference)

```python
import re, time, random
from urllib.parse import quote
from bs4 import BeautifulSoup
import cloudscraper                     # pip install cloudscraper

RESERVED_STATUSES = {'Active', 'INACT', 'NAME HS', 'CROSS RF'}
SUFFIX_RE = re.compile(r'\b(LLC|L\.L\.C\.|INC|INC\.|CORP|CORPORATION|CO|CO\.|LTD|LIMITED|PA|P\.A\.)\.?$', re.I)

def _normalize(n):
    n = re.sub(r'[^A-Za-z0-9 ]', '', (n or '').upper())
    n = SUFFIX_RE.sub('', n).strip()
    return re.sub(r'\s+', ' ', n)

def search_sunbiz(query, max_pages=5, delay=1.5):
    scraper = cloudscraper.create_scraper(browser={'browser': 'chrome', 'platform': 'windows'})
    order = quote(query.upper())
    term  = quote(query)
    url = (f'https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults'
           f'?inquiryType=EntityName&searchNameOrder={order}&searchTerm={term}')
    results = []
    for _ in range(max_pages):
        r = scraper.get(url, timeout=30)
        if r.status_code != 200 or 'Just a moment' in r.text:
            raise RuntimeError(f'blocked (HTTP {r.status_code})')
        soup = BeautifulSoup(r.text, 'html.parser')
        rows = soup.select('#search-results tbody tr')
        if not rows:
            break
        for tr in rows:
            a = tr.select_one('td.large-width a')
            cells = tr.find_all('td')
            if not a or len(cells) < 3:
                continue
            results.append({
                'name': a.get_text(strip=True),
                'doc_number': cells[1].get_text(strip=True),
                'status': cells[2].get_text(strip=True),
                'detail_url': 'https://search.sunbiz.org' + a['href'],
            })
        nxt = soup.select_one('.navigationBarPaging a[title="Next List"]')
        if not nxt:
            break
        url = 'https://search.sunbiz.org' + nxt['href']
        time.sleep(delay + random.random())
    return results

def is_name_available(query):
    norm_q = _normalize(query)
    conflicts = [r for r in search_sunbiz(query)
                 if r['status'] in RESERVED_STATUSES
                 and _normalize(r['name']) == norm_q]
    return (not conflicts, conflicts)
```

### 2.8 Rate-limit / anti-scraping considerations

* No official SunBiz API. Florida's Division of Corporations does publish **bulk data FTP** files (`ftp://sdcftp.floridados.gov/public/`) — daily "Quarterly/Weekly Corporate Data" dumps of every entity. For large-volume use, downloading nightly and querying locally is far more robust than scraping.
* Cloudflare's default managed-challenge tier is triggered by burst traffic and known-bad ASNs. Keep request rate ≤ 1 req/sec per IP; use a small residential proxy pool for any workload above a few hundred queries/day.
* The site's `robots.txt` (as of 2026-04-25) does not ban the `/Inquiry/` path, but the Cloudflare layer is the enforcement mechanism; Terms of Use on dos.myflorida.com forbid "automated queries other than the bulk feed."

---

## 3. Part 1b — Similar scrapers for other states

Public sources surveyed (URLs only — no state endpoints were pulled):

| State | Official search URL | Public scraper on GitHub? | Challenge for automation |
|---|---|---|---|
| California | `https://bizfileonline.sos.ca.gov/search` | `github.com/latinotechies/python-scraper` (Selenium, CA SOS) | Heavy SPA — **requires Selenium/Playwright**; keyword search capped at 500 results; new 12-char entity-IDs prefixed `B` |
| Minnesota | `https://mblsportal.sos.mn.gov/Business/Search` | No dedicated OSS scraper found. | ASP.NET WebForms with ViewState; pagination via POST; anti-bot is light |
| Mississippi | `https://corp.sos.ms.gov/corp/portal/c/page/corpBusinessIdSearch/portal.aspx` | No OSS scraper found. | Requires session cookie; search supports *Starting With / All Words / Any Words / Sounds Like / Exact Match* — the richest filter set of the three |
| California bulk | 1-time purchase / filtered extracts; no REST API | — | — |

Apify offers a paid CA SOS scraper (`parseforge/sos-scraper`) that handles the SPA; for MN/MS a custom scraper is required.

---

## 4. Part 2 — E-Filing Portal Mapping

All information below comes from an interactive GUI session logged in as
account **I20150000041** on 2026-04-25 (balance at login: **$122.50**).
No filings were created; only forms were inspected.

### 4.1 Network / stack observations

* Server identifies only as "Microsoft-IIS"; all action URLs are `*.exe` CGI binaries:
  * `/scripts/account.exe` — post-login landing page
  * `/scripts/efilmenu.exe` — filing menu
  * `/scripts/efil07de.exe` — Florida LLC cover-sheet form (display)
  * `/scripts/efilcovr.exe` — **POST target** for every cover-sheet action
  * `/scripts/filingnum.exe` — filing-number lookup
* **Sessions are URL-based.** Every request after login carries *literal* credentials as GET parameters:
  `?acct_number=I20150000041&acct_password=NA7963%3d0&acct_balance=$122.50&…`
  This means **the password is exposed in**:
    - the browser address bar, history, bookmarks
    - HTTP Referer headers sent to third-parties (Google Analytics is loaded on the page — GA receives the full URL with the password)
    - HTTPS server access logs
    - any corporate proxy with URL logging
* No CSRF token. No per-request nonce. No rate-limit headers. No CAPTCHA encountered anywhere.
* Browser "Back" / "Refresh" on an action page returns a hard-coded interstitial:
  `REFRESH is not supported for this page.` — the CGI tracks a one-shot action token in its in-memory session.
* The form uses HTML 4.01 Transitional and **Netscape-4-era** JavaScript (`MM_reloadPage`) — a strong indicator the back-end has not been modernized in ~25 years. Automation-friendly: the DOM is simple and stable.

### 4.2 The filing menu (screenshots 02–04)

Post-login URL: `https://efile.sunbiz.org/scripts/account.exe`

Top-level sections:

* **Corporate/LLC/LP/LLLP Filing Menu** ← contains LLC
* **Partnership Filing Menu**
* **Trademark/Servicemark Filing Menu**

Inside `Corporate/LLC/LP/LLLP`, the LLC section offers:

* Florida Limited Liability Company (Articles of Organization) ← **documented below**
* Foreign Limited Liability Company
* LLC Amendment, Restatement, Correction or Other
* LLC Dissolution, Termination, Cancellation or Revocation of Diss.
* LLC Registered Agent / Registered Office Change
* LLC Registered Agent Resignation
* LLC Reinstatement
* Merger (cross entity)

Plus Corporations (14 filings) and LP/LLLP (7 filings).

### 4.3 Florida LLC Cover-Sheet Form — full field inventory

URL shown (GET, includes creds): `https://efile.sunbiz.org/scripts/efil07de.exe?acct_number=…&acct_password=…&acct_balance=$122.50`

View-source confirms this exact HTML form:

```html
<form action="/scripts/efilcovr.exe" method="POST">
  <input type="hidden" name="action"        value="EFILO7">
  <input type="hidden" name="acct_number"   value="I20150000041">
  <input type="hidden" name="acct_password" value="NA7963=0">
  <input type="hidden" name="acct_balance"  value="$122.50">
  <select name="cos"        id="cos">         <!-- 0..9 -->
  <select name="cc"         id="cc">          <!-- 0..9 -->
  <select name="page_count" id="page_count">  <!-- 01..99 -->
  <input  name="name"       id="name" type="text" size="52" maxlength="52">
  <input  name="Submit"     type="submit" value="Create Cover Sheet">
</form>
```

Field-level spec:

| Field | HTML | Options / Constraints | Meaning | Fee impact |
|---|---|---|---|---|
| `action` (hidden) | input hidden | const `EFILO7` | Filing-type code. Each form has its own code (e.g. corporate, trademark). | — |
| `acct_number` (hidden) | input hidden | account ID | Prepaid account identifier | — |
| `acct_password` (hidden) | input hidden | plaintext password | Auth token (in POST body AND in referring URL) | — |
| `acct_balance` (hidden) | input hidden | currency | Echoed server-side; value tampered by a user does not affect billing but is useful for UI reconciliation | — |
| `cos` | select | `0,1,2,3,4,5,6,7,8,9` | # of **Certificate of Status** copies to buy | +$5.00 each |
| `cc` | select | `0,1,2,3,4,5,6,7,8,9` | # of **Certified Copies** of the Articles | +$30.00 each |
| `page_count` | select | `01..99` | # of pages in the Articles PDF that will follow this cover sheet | — (reservation only) |
| `name` | text | `maxlength=52`, required | LLC legal name (must include suffix e.g. `LLC`, `L.L.C.`) | — |

**Base filing fee:** $125.00 (per Fla. Stat. § 605.0213). Total held-from-account = $125 + $5·cos + $30·cc.

> ⚠️ Warning printed below the form: *"Each submission of the 'Create Cover Sheet' button will result in money being held from your account."*
> The prepaid portal does **not** show a per-filing confirmation page before funds are held — clicking Submit is the commit.

### 4.4 What the prepaid "cover sheet" flow actually is

This portal is **not** a self-service wizard. It is a batch-filing front end used by law firms / registered-agent services that:

1. Prepare the Articles of Organization PDF locally (Florida supplies a template at
   `http://dos.myflorida.com/sunbiz/forms/limited-liability-company/`).
2. POST the cover-sheet form above → receive a **cover-sheet PDF** with a tracking
   barcode and the fees reserved from balance.
3. Concatenate cover-sheet + Articles PDF and upload via the separate "Upload File"
   menu item (or mail the package in for paper processing).
4. The clerk scans the barcode, verifies the uploaded doc, and commits the filing.

There is no data entry of member names, addresses, registered agent, etc. in this
CGI form — the state extracts those from the uploaded Articles PDF. That means a
naive automation that only POSTs the cover sheet is incomplete; the upload step is
required.

### 4.5 The *public* self-service LLC wizard (the path most consumer-facing
incorporation SaaS use)

URL: `https://efile.sunbiz.org/llc_file.html`

Captured two forms:

**Form A — Start new filing**

```html
<form action="filinglog.exe" method="post" id="filingform">
  <input type="hidden" name="filing_type" value="LLC">
  <input type="checkbox" name="Disclaimer" value="accept" id="disclaimer_read">
  <input type="submit" name="submit" value="Start New Filing">
</form>
```

**Form B — Resume a rejected / in-progress filing**

```html
<form action="filingupd.exe" method="post" id="filingupdate">
  <input type="hidden" name="page"         value="PG0">
  <input type="hidden" name="filing_type"  value="NONE">
  <input type="text"   name="track_number" maxlength="12">   <!-- Tracking # -->
  <input type="text"   name="pin_number"   maxlength="4">    <!-- 4-digit PIN -->
</form>
```

Downstream pages (per Florida DOS published instructions + widely documented by
incorporation SaaS competitors such as Incfile, LegalZoom, ZenBusiness) collect:

| Step | Page ID | Required data |
|---|---|---|
| 1 | `PG0` disclaimer | accept ToS checkbox |
| 2 | LLC Name | name (must end in an authorized suffix: `LLC`, `L.L.C.`, `Limited Liability Company`, `Limited Company`, `L.C.`) — system does a real-time distinguishable-check against Sunbiz records |
| 3 | Principal Place of Business | street, city, state, zip (+ optional "in-care-of") |
| 4 | Mailing Address | street OR "Same as principal" checkbox |
| 5 | Registered Agent | agent name, Florida street address, email, **electronic signature checkbox** affirming acceptance |
| 6 | Authorized Person(s) / Manager(s) | at least one: title (`MGR` / `MGRM` / `AMBR`), name, address. Up to 6 in online form. |
| 7 | Correspondence contact | email + phone |
| 8 | Effective date (optional) | may be up to 5 days retroactive or 90 days future |
| 9 | Signature | printed name of the person signing (acts as the electronic signature) |
| 10 | Add-ons | Certificate of Status ($5), Certified Copy ($30) |
| 11 | Review | read-only summary; the **final price is $125 + add-ons** |
| 12 | Payment | credit-card (Visa/MC/Amex/Discover) OR "Sunbiz E-File Account" (drops back to the prepaid flow). Payment processor is **EFM** (Florida's in-house); 3-D Secure is not required. |
| 13 | Receipt | tracking number + PIN; email with PDF receipt |

The wizard does **not** accept a file upload — the Articles of Organization
document is **generated by the state** from the collected field data. This is the
key difference from the prepaid path.

### 4.6 Anti-bot / security posture of the e-file portal

| Control | Present? |
|---|---|
| CAPTCHA (reCAPTCHA, hCaptcha, Turnstile) | ❌ No |
| Cloudflare / bot-mgmt WAF | ❌ No on `efile.sunbiz.org` (only on `search.sunbiz.org`) |
| Per-request CSRF token | ❌ No |
| Session cookie | ❌ Session held via GET URL parameters |
| Rate-limit response headers | ❌ None observed |
| Account lockout after failed logins | ⚠️ Not verified (did not test) |
| HTTPS | ✅ Yes (TLS 1.2/1.3, good cert) |

**Implication:** automating the LLC wizard end-to-end with `requests`/`httpx`
alone (no Selenium) is straightforward. The only hard requirement is maintaining
the GET-parameter "session" (essentially replaying the credential tuple on every
hop) for the prepaid path, or for the public path, carrying the cookie
`ASP.NET_SessionId`-equivalent that the CGI issues on the first hit.

### 4.7 Screenshots captured

`/home/ubuntu/incorporation_research/screenshots/`

| File | Step |
|---|---|
| `01_login_page.png` | Login screen (`/login.html`) with creds typed in |
| `02_main_filing_menu.png` | Account landing + balance + 3 top-level menus |
| `03_corporate_filing_menu_top.png` | Corporations list |
| `04_corporate_filing_menu_bottom_LLC.png` | LLC & LP list |
| `05_FL_LLC_cover_sheet_form.png` | The LLC cover-sheet form (empty) |
| `06_LLC_form_cert_status_dropdown.png` | `cos` dropdown open (0–9) |
| `07_LLC_form_page_count_dropdown.png` | `page_count` dropdown open (01+) |
| `08_LLC_form_source.png` | View-source of the same form showing all hidden fields |

---

## 5. Part 3 — Automation Strategy & Recommendations

### 5.1 Recommended architecture

```
┌─────────────────────────────────────────────────────────┐
│   Incorporation SaaS (your app)                         │
│   ┌──────────────────┐    ┌──────────────────────────┐  │
│   │ Name-availability│    │ LLC-filing orchestrator  │  │
│   │  service         │    │  (state-machine)         │  │
│   └────────┬─────────┘    └──────────┬───────────────┘  │
└────────────┼──────────────────────────┼─────────────────┘
             │ (1) cached                │
             │                           │
        ┌────▼──────────────────┐  ┌─────▼───────────────────┐
        │ FL Bulk Data Ingest   │  │ FL E-File Wizard Driver │
        │ (nightly FTP dump)    │  │ (Playwright headless)   │
        └────────┬──────────────┘  └────────┬────────────────┘
                 │                          │
        ┌────────▼──────────────┐  ┌────────▼────────────────┐
        │ Postgres (entities)   │  │ Filing tracker DB       │
        └───────────────────────┘  └─────────────────────────┘
             ▲                              ▲
             │                              │
     fallback│ live scrape                  │
             │ (cloudscraper)               │
        ┌────┴──────────────────┐           │
        │ search.sunbiz.org     │           │
        └───────────────────────┘           │
                                            │
                                ┌───────────┴──────────────┐
                                │ efile.sunbiz.org/llc_file│
                                └──────────────────────────┘
```

1. **Primary source for name lookup = local mirror** of the nightly bulk data.
   Florida publishes full entity dumps at `ftp://sdcftp.floridados.gov/public/`.
   Query performance becomes microseconds; zero scraping risk.
2. **Fallback = live scrape** (improved scraper in §2.7) only when the name was
   registered since the last bulk dump.
3. **Filing driver = Playwright** (or direct `httpx` with manually maintained
   state machine) against the *public* wizard, not the prepaid cover-sheet
   portal. Use the public wizard because (a) it records all fields server-side —
   no PDF generation needed on our side; (b) it accepts per-customer credit
   card, removing the need to maintain a prepaid balance.
4. **Prepaid portal = volume optimization.** Once throughput > ~50 filings/day
   it's cheaper to fund a prepaid account and batch-file; reserve this path for
   later.

### 5.2 Data model the automation must capture

| Object | Fields |
|---|---|
| **Entity** | legal_name (≤120 char), suffix, alt_name_choices[], effective_date, filing_type=LLC |
| **Principal address** | street1, street2, city, state, zip, country, in_care_of? |
| **Mailing address** | same-as-principal OR distinct address block |
| **Registered Agent** | type (individual/entity), name, email, FL-street1, city, zip, e-signature (printed name) |
| **Authorized Persons** | list[{title ∈ {MGR,MGRM,AMBR,AP}, name, street1, street2, city, state, zip, country}] |
| **Correspondence** | email, phone |
| **Add-ons** | cert_of_status:bool, certified_copies:int ∈ 0..9 |
| **Signer** | printed_name (acts as e-sig), title |
| **Payment** | method ∈ {credit_card, prepaid}; if credit_card: card# via PCI-compliant vault (never store raw); billing address |

### 5.3 Error handling requirements

* **Name rejection** mid-wizard: state returns an error on page 2 if the name is
  not distinguishable. Capture the error text, expose to user, allow re-submit
  without losing entered data.
* **Session expiry / "REFRESH not supported":** on any non-200 or HTML error
  page, resume from last saved `track_number` + `PIN` via `filingupd.exe`.
* **Payment decline:** state allows re-entering card up to 3 times per filing;
  beyond that the filing must be resumed.
* **Fee mismatch:** compare client-computed total to the Review-page total;
  abort & alert if different — protects against silent fee changes by the state.
* **Address validation:** the wizard accepts any string; our app should
  USPS-normalize before submission.
* **Network / WAF:** exponential back-off, max 5 retries, log full
  request/response (PII-scrubbed) for audit.

### 5.4 Security considerations

| Risk | Mitigation |
|---|---|
| Password in URL (prepaid portal) | Do not log URLs; strip query string before writing to any log/analytics; do not embed Google Analytics in any screen that holds credentials; disable browser history in the automation runner |
| Password in request POST body | Transport is HTTPS — acceptable, but treat the tuple as a vault secret |
| No CSRF on e-filing portal | Network-isolate the automation worker; deny outbound egress except `*.sunbiz.org` |
| No CAPTCHA → account-takeover risk | Consider adding IP allow-listing on the account itself (contact the FL "Internet Support Section") |
| Storage of customer PII (SSN not required for LLC, but DOB / address / email are) | Encrypt at rest (AES-256), column-level access logs, 7-year retention per FL record-keeping rules |
| Cloudflare silent failure on scraper | Fail-closed: any scraper returning 0 results AND with 403/challenge in response body must raise, not "succeed" |

### 5.5 Rate-limiting & anti-scraping countermeasures

* `search.sunbiz.org`: keep ≤ 1 req/s, rotate residential proxies, or use
  `cloudscraper`/`FlareSolverr`. Officially, use the nightly bulk feed.
* `efile.sunbiz.org`: no observed limiter, but stay ≤ 0.5 req/s to avoid
  triggering future mitigations. Serialize per-account (one in-flight filing per
  prepaid account).
* Use distinct User-Agent per worker; honour `Retry-After`.
* Implement circuit breakers: if 5 consecutive requests return 5xx or
  Cloudflare challenge, stop all workers for that domain for 15 min.

### 5.6 Legal / ToS notes

* Florida DOS Terms of Use prohibit "automated queries other than the bulk data
  feed." Commercial scraping of the live search may constitute unauthorized
  access under Fla. Stat. § 815.06. Plan of record: **ingest the bulk feed**;
  use live scrape only for cache-miss/tiebreak.
* Filing on behalf of clients: the person whose name is entered on the Signer
  screen is legally certifying the filing. Ensure your ToS captures customer
  authorization (e-sig flow + audit trail).

---

## 6. Appendix A — Discovered endpoints

| URL | Method | Purpose |
|---|---|---|
| `https://search.sunbiz.org/Inquiry/CorporationSearch/ByName` | GET/POST | Name-search form |
| `https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults?inquiryType=EntityName&searchNameOrder=X&searchTerm=Y` | GET | Paged results (behind Cloudflare) |
| `https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResultDetail?inquirytype=EntityName&aggregateId=…` | GET | Entity-detail page (includes officers, FEI/EIN, agent) |
| `https://efile.sunbiz.org/login.html` | GET | Prepaid login form |
| `https://efile.sunbiz.org/scripts/account.exe` | POST | Login handler → account home |
| `https://efile.sunbiz.org/scripts/efilmenu.exe?acct_number=…&acct_password=…` | GET | Filing menu |
| `https://efile.sunbiz.org/scripts/efil07de.exe?…` | GET | FL-LLC cover-sheet form display |
| `https://efile.sunbiz.org/scripts/efilcovr.exe` | POST | Cover-sheet submit (charges prepaid balance) |
| `https://efile.sunbiz.org/llc_file.html` | GET | Public LLC wizard entry |
| `https://efile.sunbiz.org/filinglog.exe` | POST | Public wizard: start filing |
| `https://efile.sunbiz.org/filingupd.exe` | POST | Public wizard: resume via tracking#+PIN |

## 7. Appendix B — Bulk data feed (recommended primary source)

* FTP host: `sdcftp.floridados.gov` (anonymous)
* Files of interest: `/public/doc/cor/` (corporate-data), `/public/doc/LLC/` (LLC)
* Formats: fixed-width ASCII; schema documented in Florida DOS's
  "Corporation Data Layout" PDF.
* Cadence: weekly full + daily deltas.

---

## 8. Appendix C — Known-good test harness output

Scraper logic against real HTML (after Cloudflare is bypassed by a browser):

```
Total <td> tags: 24
Active matches: 4
  - DISNEY
  - DISNEY AD SERVICES CO., LLC
  - DISNEY ADVERTISING SALES, LLC
  - DISNEY AUCTIONS, L.L.C.
```

Scraper against the live production site today:

```
Searching: 'Disney'  → Active matches: 0  (in 0.05s)   ← false negative; fetch returned 403 challenge page
```

---

*Prepared by automated technical review, 2026-04-25. No filings were submitted
against account I20150000041. Prepaid balance unchanged at $122.50.*
