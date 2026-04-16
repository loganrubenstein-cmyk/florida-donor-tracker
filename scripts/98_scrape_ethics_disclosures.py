"""
Script 98: Scrape FL Commission on Ethics financial disclosures.

Source: https://disclosure.floridaethics.gov/PublicSearch/Filings
  - Form 1: legislators and most state/local officials (income, real estate,
             investments, liabilities, positions held)
  - Form 6: constitutional officers (fuller net-worth disclosure)

Pipeline:
  Phase 1 — Playwright browser automation
    For each legislator in Supabase `legislators` table:
      1. Search by last name + first name
      2. Collect filing rows (year, form type, PDF download URL)
      3. Download the most recent Form 1 or Form 6 PDF
      4. Cache raw search results + PDFs in data/raw/ethics/

  Phase 2 — PDF parsing (pdfplumber)
    Extract structured fields from cached PDFs:
      income_sources, real_estate, business_interests, liabilities
    NOTE: Form 1/6 PDF layouts vary by year. The parsers below are scaffolded
    with clear TODO markers for each section. Run the script once, inspect the
    PDF text output logged to data/raw/ethics/pdf_text_debug/, then fill in
    the regex/table extraction logic.

  Phase 3 — Supabase upsert
    Create official_disclosures table (if not exists), upsert records, then
    fuzzy-match filer_name → legislators.people_id.

SITE TECH NOTE:
  disclosure.floridaethics.gov is a JavaScript-rendered ASP.NET SPA. Simple
  HTTP GET/POST requests return 404s — all search interactions require a real
  browser session with cookie + anti-forgery token. Playwright is the only
  reliable approach. The --requests-only flag attempts a form-POST fallback but
  will likely fail; it exists for CI environments without Playwright.

Dependencies (add to .venv):
  playwright  — pip install playwright && playwright install chromium
  pdfplumber  — pip install pdfplumber
  rapidfuzz   — pip install rapidfuzz      (already used in script 96)
  psycopg2    — already in pipeline
  python-dotenv — already in pipeline

Usage:
  .venv/bin/python scripts/98_scrape_ethics_disclosures.py
  .venv/bin/python scripts/98_scrape_ethics_disclosures.py --force
  .venv/bin/python scripts/98_scrape_ethics_disclosures.py --legislator "Smith, John"
  .venv/bin/python scripts/98_scrape_ethics_disclosures.py --requests-only  # fallback
  .venv/bin/python scripts/98_scrape_ethics_disclosures.py --parse-only     # re-parse PDFs
  .venv/bin/python scripts/98_scrape_ethics_disclosures.py --load-only      # upsert cached JSON
"""

import json
import os
import re
import sys
import time
from pathlib import Path

import psycopg2
import requests
from dotenv import load_dotenv
from psycopg2.extras import execute_values

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env.local")

# ── Paths ──────────────────────────────────────────────────────────────────────
ETHICS_DIR   = PROJECT_ROOT / "data" / "raw" / "ethics"
SEARCH_CACHE = ETHICS_DIR / "search_results.json"   # {slug: {filings: [...], scraped_at}}
PDF_DIR      = ETHICS_DIR / "pdfs"
PDF_DEBUG    = ETHICS_DIR / "pdf_text_debug"         # raw text dumps for parser development
PARSED_JSON  = ETHICS_DIR / "parsed_disclosures.json"

ETHICS_BASE  = "https://disclosure.floridaethics.gov"
SEARCH_URL   = f"{ETHICS_BASE}/PublicSearch/Filings"

REQUEST_DELAY = 2.0   # seconds between requests (per spec)
MATCH_THRESHOLD = 85  # rapidfuzz token_sort_ratio minimum for name matching

# Form type codes used in FL Ethics site (observed from network traffic)
# If these differ from what you see in DevTools, update here.
FORM_TYPE_CODES = {
    "Form 1": "1",
    "Form 6": "6",
}


# ── Supabase schema ────────────────────────────────────────────────────────────

# Multi-statement DDL must be split into separate cur.execute() calls.
# See data_integrity_lessons.md — psycopg2 silently ignores statements
# after the first in a single execute() call.
_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS official_disclosures (
    id                  SERIAL PRIMARY KEY,
    filer_name          TEXT,
    filer_slug          TEXT,
    position            TEXT,
    filing_year         INTEGER,
    filing_type         TEXT,
    net_worth           NUMERIC,
    income_sources      JSONB,
    real_estate         JSONB,
    business_interests  JSONB,
    liabilities         JSONB,
    source_url          TEXT,
    pdf_local_path      TEXT,
    legislator_id       INTEGER,
    raw_text_length     INTEGER,
    scraped_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
)
"""
_DDL_STEPS = [
    _CREATE_TABLE,
    "ALTER TABLE official_disclosures ADD COLUMN IF NOT EXISTS net_worth NUMERIC",
    """CREATE UNIQUE INDEX IF NOT EXISTS idx_official_disclosures_slug_year
        ON official_disclosures (filer_slug, filing_year, filing_type)
        WHERE filing_year IS NOT NULL""",
    "CREATE INDEX IF NOT EXISTS idx_official_disclosures_legislator ON official_disclosures (legislator_id)",
    "CREATE INDEX IF NOT EXISTS idx_official_disclosures_year ON official_disclosures (filing_year DESC)",
]


# ── Helpers ───────────────────────────────────────────────────────────────────

_PUNCT = re.compile(r"[^\w\s-]")

def slugify(name: str) -> str:
    s = str(name).lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"\s+", "-", s.strip())
    return re.sub(r"-+", "-", s).strip("-")[:120]

def norm(s: str) -> str:
    return " ".join(_PUNCT.sub(" ", str(s).upper()).split())

def load_cache(path: Path) -> dict:
    if path.exists():
        try:
            with open(path) as f:
                return json.load(f)
        except json.JSONDecodeError:
            print(f"  WARNING: corrupt cache at {path.name} — starting fresh")
    return {}

def save_cache(data: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str)


# ── Phase 0: Load legislators from Supabase ───────────────────────────────────

def load_legislators() -> list[dict]:
    """
    Pull name, chamber, district, people_id from the legislators table.
    Returns list of dicts: {people_id, first_name, last_name, display_name, chamber, district}
    """
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        sys.exit("ERROR: SUPABASE_DB_URL not set in .env.local")

    con = psycopg2.connect(db_url, options="-c statement_timeout=30000")
    cur = con.cursor()
    try:
        cur.execute("""
            SELECT people_id, first_name, last_name, display_name, chamber, district
            FROM legislators
            ORDER BY chamber, last_name, first_name
        """)
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, row)) for row in cur.fetchall()]
        print(f"  Loaded {len(rows):,} legislators from Supabase")
        return rows
    finally:
        cur.close()
        con.close()


# ── Name cleaning for EFDMS search ───────────────────────────────────────────
# Raw DB names contain titles (Dr, Ms), generational suffixes (Jr., III), and
# compound last names that confuse the EFDMS search form.

_LAST_SUFFIX = re.compile(
    r",?\s*\b(Jr\.?|Sr\.?|II|III|IV|V|Esq\.?)\s*$", re.IGNORECASE
)
_FIRST_TITLE = re.compile(
    r"^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Prof\.?)\s+", re.IGNORECASE
)


def _clean_last(raw: str) -> str:
    """Strip generational suffixes from last name: 'Massullo, Jr.' → 'Massullo'."""
    return _LAST_SUFFIX.sub("", raw).strip().rstrip(",").strip()


def _clean_first(raw: str) -> str:
    """Strip honorific titles from first name: 'Dr' → '' (search by last only),
    'Ms Dee' → 'Dee', 'Dr Anna' → 'Anna'."""
    cleaned = _FIRST_TITLE.sub("", raw).strip()
    # If the entire first_name was a title (e.g. field = "Dr"), return empty so
    # the search falls back to last-name-only, which EFDMS supports.
    if re.fullmatch(r"(Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Prof\.?)", raw.strip(), re.IGNORECASE):
        return ""
    return cleaned


def _is_vacant(leg: dict) -> bool:
    """True for placeholder rows with no real legislator (display_name='Vacant')."""
    name = (leg.get("display_name") or leg.get("last_name") or "").strip().lower()
    return name in ("vacant", "")


# ── Phase 1a: Playwright scraper ───────────────────────────────────────────────

def scrape_with_playwright(legislators: list[dict], cache: dict, force: bool,
                           single_name: str | None = None) -> dict:
    """
    Use Playwright to search the ethics site for each legislator.
    Populates cache[slug] = {filings: [...], display_name, scraped_at}

    Each filing dict: {year, form_type, filer_name, position, pdf_url, filing_id}

    HOW THE SITE WORKS (observed via DevTools — update if the site changes):
      1. Navigate to /PublicSearch/Filings
      2. Fill "Last Name" input, "First Name" input, set "Form Year" to desired year
      3. Click "Search" button — results appear in a table below the form
      4. Each result row has: Filer Name, Position, Year, Form Type, a "View" link
      5. "View" link opens the filing detail page which has a PDF download link
         URL pattern: /PublicSearch/ViewFiling?filingId=XXXXXX
         PDF pattern: /PublicSearch/DownloadFiling?filingId=XXXXXX

    If the site structure differs, check DevTools Network tab on:
      https://disclosure.floridaethics.gov/PublicSearch/Filings
    and update the selectors below accordingly.
    """
    try:
        from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
    except ImportError:
        print("\nERROR: playwright not installed.")
        print("  Run: .venv/bin/pip install playwright && .venv/bin/playwright install chromium")
        return cache

    PDF_DIR.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
            accept_downloads=True,
        )
        # Fresh page per legislator: reusing a page after a Playwright timeout leaves
        # it in a bad state where subsequent calls also timeout. Opening + closing
        # a page per legislator is a tiny overhead vs. the AJAX wait per search.
        print(f"  Starting legislator search ...")

        for i, leg in enumerate(legislators):
            if _is_vacant(leg):
                print(f"  [{i+1:3d}] SKIP  (vacant seat)")
                continue

            last  = _clean_last((leg.get("last_name") or "").strip())
            first = _clean_first((leg.get("first_name") or "").strip())
            slug  = slugify(f"{last} {first}")

            if single_name and single_name.lower() not in f"{last} {first}".lower():
                continue

            if not force and slug in cache:
                print(f"  [{i+1:3d}] CACHED  {last}, {first}")
                continue

            print(f"  [{i+1:3d}] Searching  {last}, {first} ...", flush=True)

            page = context.new_page()
            try:
                filings = _search_one_legislator(page, first, last, leg)
                # Compound last name fallback: "Gonzalez Pittman" → try "Gonzalez" if 0 results
                if not filings and " " in last:
                    first_part = last.split()[0]
                    print(f"         → 0 results; retrying with last={first_part!r} ...", flush=True)
                    filings = _search_one_legislator(page, first, first_part, leg)
                # Nickname fallback: "Mike" → last-name-only search to catch "Michael" etc.
                # EFDMS stores legal names; legislators DB has informal/nickname first names.
                if not filings and first:
                    print(f"         → 0 results; retrying last-name-only ({last!r}) ...", flush=True)
                    filings = _search_one_legislator(page, "", last, leg)
                cache[slug] = {
                    "people_id":    leg["people_id"],
                    "display_name": leg.get("display_name", f"{first} {last}"),
                    "first_name":   first,
                    "last_name":    last,
                    "filings":      filings,
                    "scraped_at":   time.strftime("%Y-%m-%dT%H:%M:%S"),
                }
                n = len(filings)
                print(f"         → {n} filing{'s' if n != 1 else ''} found")

            except PWTimeout:
                print(f"         → TIMEOUT — skipping")
                cache[slug] = {"people_id": leg["people_id"], "filings": [], "error": "timeout"}
            except Exception as e:
                print(f"         → ERROR: {e}")
                cache[slug] = {"people_id": leg["people_id"], "filings": [], "error": str(e)}
            finally:
                page.close()

            time.sleep(REQUEST_DELAY)

            # Autosave every 20 legislators
            if (i + 1) % 20 == 0:
                save_cache(cache, SEARCH_CACHE)
                print(f"  --- autosaved cache ({i+1}/{len(legislators)}) ---")

        browser.close()

    return cache


def _search_one_legislator(page, first: str, last: str, leg: dict) -> list[dict]:
    """
    Navigate directly to FilingsResults URL and collect filings for one legislator.

    The site (Knockout.js SPA) submits the search form to:
      /PublicSearch/FilingsResults?FirstName={first}&LastName={last}
    Navigating there directly is more reliable than filling the form.
    """
    from playwright.sync_api import TimeoutError as PWTimeout
    from urllib.parse import quote

    # No FormYear filter — returns all years so we don't miss recently-due filings
    results_url = (
        f"{ETHICS_BASE}/PublicSearch/FilingsResults"
        f"?FirstName={quote(first)}&LastName={quote(last)}"
    )

    try:
        # domcontentloaded is immediate. The ethics site has persistent background XHR
        # polling that prevents networkidle from ever completing.
        page.goto(results_url, wait_until="domcontentloaded", timeout=30_000)
    except PWTimeout:
        _debug_page_inputs(page, f"nav_timeout_{slugify(last)}")
        return []

    # KO creates empty table skeleton at domcontentloaded, then populates via AJAX
    # ~5s later. Confirmed by debug: after time.sleep(5), td count=9, NAME cols=1.
    # wait_for_function / wait_for_selector based approaches cause Playwright state
    # corruption; plain sleep is the reliable path.
    time.sleep(7)

    # "No records to display" check — use is_visible() since the element exists but
    # is hidden (display:none) when there ARE records
    no_rec = page.locator('td:has-text("No records to display")')
    if no_rec.count() > 0 and no_rec.first.is_visible():
        return []

    # No NAME cells means KO hasn't rendered data rows yet or no results
    if page.locator('td[data-column="NAME"]').count() == 0:
        return []

    # ── Parse result rows ──
    filings = _parse_search_results(page, last, first)

    # PDF downloads deferred to a second pass (--pdf-only flag) after metadata is
    # confirmed. FilingHistory is also a KO SPA needing ~7s AJAX wait; resolving
    # stale locators from .all() causes Locator.get_attribute timeouts.

    return filings


def _parse_search_results(page, last: str, first: str) -> list[dict]:
    """
    Parse the /PublicSearch/FilingsResults table.

    Observed columns (via data-column attributes):
      FILER NAME | ORGANIZATION | FORM TYPE | FILLINGS | (View Filings link)

    Each row links to /PublicSearch/FilingHistory/{id} for the full filing list.
    """
    filings = []

    rows = page.locator("table tbody tr").all()
    for row in rows:
        if not row.is_visible():
            continue
        filer_el    = row.locator('td[data-column="NAME"]')
        formtype_el = row.locator('td[data-column="FORM TYPE"]')
        link_el     = row.locator('a[href*="FilingHistory"]')

        if filer_el.count() == 0 or link_el.count() == 0:
            continue

        filer_name  = filer_el.inner_text().strip()
        form_type   = formtype_el.inner_text().strip() if formtype_el.count() > 0 else ""
        history_href = link_el.get_attribute("href")
        history_url  = (
            f"{ETHICS_BASE}{history_href}"
            if history_href and history_href.startswith("/")
            else history_href
        )

        filings.append({
            "filer_name":  filer_name,
            "form_type":   _normalize_form_type(form_type),
            "history_url": history_url,
        })

    return filings


def _normalize_form_type(raw: str) -> str:
    r = raw.strip().upper()
    if "6" in r:
        return "Form 6"
    if "1" in r:
        return "Form 1"
    return raw.strip()


def _extract_filing_id(href: str) -> str | None:
    m = re.search(r"filingId=(\d+)", href, re.IGNORECASE)
    return m.group(1) if m else None


def _download_pdf(page, filing: dict) -> Path | None:
    """
    Navigate to the filing detail page and download the PDF.
    Returns local Path if successful, None otherwise.

    The download URL pattern observed from the site:
      /PublicSearch/DownloadFiling?filingId=XXXXXX
    If filingId is available, try that first. Otherwise visit pdf_url and
    look for a PDF link or download button.
    """
    filing_id = filing.get("filing_id")
    year      = filing.get("year", "unknown")
    form_type = filing.get("form_type", "form").replace(" ", "").lower()
    filer_slug = slugify(filing.get("filer_name", "unknown"))

    filename = f"{filer_slug}_{year}_{form_type}.pdf"
    dest = PDF_DIR / filename

    if dest.exists():
        return dest

    # Try direct download URL
    download_url = (
        f"{ETHICS_BASE}/PublicSearch/DownloadFiling?filingId={filing_id}"
        if filing_id else filing.get("pdf_url")
    )
    if not download_url:
        return None

    try:
        with page.expect_download(timeout=20_000) as dl_info:
            page.goto(download_url)
        download = dl_info.value
        download.save_as(dest)
        return dest
    except Exception:
        # Fallback: try visiting the filing page and clicking the PDF link
        try:
            view_url = filing.get("pdf_url", "")
            if view_url:
                page.goto(view_url, wait_until="domcontentloaded", timeout=15_000)
                pdf_link = page.locator('a[href*=".pdf"], a:has-text("Download"), a:has-text("PDF")').first
                if pdf_link.count() > 0:
                    with page.expect_download(timeout=20_000) as dl_info:
                        pdf_link.click()
                    dl_info.value.save_as(dest)
                    return dest
        except Exception as e2:
            print(f"           PDF download failed: {e2}")
    return None


def _download_pdf_via_history(page, filing: dict) -> Path | None:
    """
    Visit the FilingHistory page for a filer, find the most recent Form 1/6 PDF,
    and download it.

    FilingHistory is also a KO SPA: domcontentloaded + sleep(7) required.
    Use page.evaluate() to extract hrefs rather than .all() locators, which
    return stale references before AJAX renders and cause 30s timeouts.
    """
    from playwright.sync_api import TimeoutError as PWTimeout

    history_url = filing.get("history_url")
    if not history_url:
        return None

    form_type = filing.get("form_type", "form").replace(" ", "").lower()
    filer_slug = slugify(filing.get("filer_name", "unknown"))

    try:
        page.goto(history_url, wait_until="domcontentloaded", timeout=30_000)
    except PWTimeout:
        return None

    # KO SPA — AJAX populates the table ~5-7s after domcontentloaded
    time.sleep(7)

    # Extract filing links. The FilingHistory page has two link patterns:
    #   Report/PrintForm/?filingId=NNN   (electronic forms — view/print page)
    #   DownloadScannedForm/NNN          (older scanned PDFs — direct download)
    hrefs = page.evaluate("""() => {
        const links = document.querySelectorAll(
            'a[href*="PrintForm"], a[href*="DownloadScannedForm"]'
        );
        return Array.from(links).map(a => a.getAttribute('href')).filter(Boolean);
    }""")

    if not hrefs:
        _debug_page_inputs(page, f"history_{filer_slug}")
        return None

    for href in hrefs:
        abs_href = f"{ETHICS_BASE}{href}" if href.startswith("/") else href
        filing_id = _extract_filing_id(href)

        # Electronic forms: PrintForm page links to GetFormContent for PDF download.
        # Scanned forms: DownloadScannedForm/{id} directly serves the PDF.
        if "PrintForm" in href and filing_id:
            download_url = f"{ETHICS_BASE}/Report/GetFormContent?filingId={filing_id}"
        else:
            download_url = abs_href

        filename = f"{filer_slug}_{filing_id or 'unknown'}_{form_type}.pdf"
        dest = PDF_DIR / filename
        if dest.exists():
            return dest

        try:
            # GetFormContent and DownloadScannedForm both send Content-Disposition: attachment.
            # page.goto() throws "Download is starting" for download URLs;
            # use window.location.href instead to trigger the download event properly.
            with page.expect_download(timeout=30_000) as dl_info:
                page.evaluate(f"window.location.href = '{download_url}'")
            dl_info.value.save_as(dest)
            filing["source_url"] = download_url  # persist for upsert
            return dest
        except Exception:
            continue

    return None


def download_pdfs_phase(cache: dict) -> dict:
    """
    Phase 1b: Download PDFs for all cached filings that don't yet have pdf_local.

    Uses Playwright with a fresh page per filing (same approach as Phase 1).
    Updates cache in-place with pdf_local paths and returns updated cache.
    """
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

    # Pre-build index of existing PDFs by filer slug for fast skip check
    existing = {}  # filer_slug → Path
    for p in PDF_DIR.glob("*.pdf"):
        parts = p.stem.split("_")
        if parts:
            existing[parts[0]] = p

    # Collect filings that need PDFs
    todo = []
    for slug, entry in cache.items():
        for filing in entry.get("filings", []):
            if filing.get("form_type") not in ("Form 1", "Form 6"):
                continue
            pdf_local = filing.get("pdf_local")
            if pdf_local and Path(pdf_local).exists():
                continue  # already downloaded in a previous run (cache is fresh)
            # Check disk for slug-based match (cache may have been cleared)
            filer_slug = slugify(filing.get("filer_name", slug))
            if filer_slug in existing:
                filing["pdf_local"] = str(existing[filer_slug])
                continue  # found on disk without navigating
            todo.append((slug, filing))

    if not todo:
        print("  All PDFs already downloaded.")
        return cache

    print(f"  Downloading PDFs for {len(todo):,} filings ...")
    downloaded = 0
    errors = 0

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(accept_downloads=True)

        for i, (slug, filing) in enumerate(todo):
            filer_name = filing.get("filer_name", slug)
            print(f"  [{i+1}/{len(todo)}] {filer_name} ...", end=" ", flush=True)

            page = context.new_page()
            try:
                local_path = _download_pdf_via_history(page, filing)
                if local_path:
                    filing["pdf_local"] = str(local_path)
                    downloaded += 1
                    print(f"saved → {local_path.name}")
                else:
                    errors += 1
                    print("no PDF found")
            except Exception as e:
                errors += 1
                print(f"ERROR: {e}")
            finally:
                page.close()

            time.sleep(REQUEST_DELAY)

        context.close()
        browser.close()

    print(f"\n  Downloaded: {downloaded:,}, errors: {errors:,}")
    return cache


def _debug_page_inputs(page, label: str) -> None:
    """Dump page HTML to a debug file when selectors fail."""
    PDF_DEBUG.mkdir(parents=True, exist_ok=True)
    debug_path = PDF_DEBUG / f"debug_{label}.html"
    try:
        debug_path.write_text(page.content(), encoding="utf-8")
        print(f"  DEBUG: page HTML saved → {debug_path.name}")
    except Exception:
        pass


# ── Phase 1b: Requests fallback (likely to fail — see header note) ─────────────

def scrape_with_requests(legislators: list[dict], cache: dict, force: bool) -> dict:
    """
    Attempt form-POST fallback using requests + BeautifulSoup.

    This will likely return 404s or empty results because the site requires
    JavaScript execution and a valid ASP.NET anti-forgery session token.

    It exists as a CI/CD fallback and to document what was tried.
    If it starts returning real data, the POST parameters below need updating
    based on DevTools Network inspection of the actual form submission.
    """
    from bs4 import BeautifulSoup

    session = requests.Session()
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        )
    })

    print("  Attempting requests-based fallback (likely to fail on JS-rendered site) ...")

    # Step 1: GET the search page to capture cookies + anti-forgery token
    try:
        r = session.get(SEARCH_URL, timeout=30)
        r.raise_for_status()
    except Exception as e:
        print(f"  ERROR: Cannot reach {SEARCH_URL}: {e}")
        return cache

    soup = BeautifulSoup(r.text, "lxml")

    # Extract RequestVerificationToken (ASP.NET anti-forgery)
    # TODO: Confirm token field name — inspect the actual form in DevTools
    token_input = soup.find("input", {"name": "__RequestVerificationToken"})
    token = token_input["value"] if token_input else ""
    if not token:
        print("  WARNING: No anti-forgery token found — POST will likely be rejected")

    for i, leg in enumerate(legislators):
        if _is_vacant(leg):
            continue

        last  = _clean_last((leg.get("last_name") or "").strip())
        first = _clean_first((leg.get("first_name") or "").strip())
        slug  = slugify(f"{last} {first}")

        if not force and slug in cache:
            continue

        # TODO: Inspect actual POST parameters from DevTools Network tab.
        # The parameter names below are guesses for ASP.NET MVC forms.
        # Look for the form's action URL and each input's name= attribute.
        post_data = {
            "__RequestVerificationToken": token,
            "SearchModel.LastName":  last,
            "SearchModel.FirstName": first,
            "SearchModel.FormYear":  "",   # blank = all years
            # Add additional fields as needed
        }

        try:
            r = session.post(SEARCH_URL, data=post_data, timeout=30)
            if r.status_code != 200:
                print(f"  [{i+1:3d}] {last}, {first}: HTTP {r.status_code} — skipping")
                time.sleep(REQUEST_DELAY)
                continue

            soup = BeautifulSoup(r.text, "lxml")
            filings = _parse_html_results(soup, last, first)

            cache[slug] = {
                "people_id":  leg["people_id"],
                "filings":    filings,
                "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "method":     "requests",
            }
            print(f"  [{i+1:3d}] {last}, {first}: {len(filings)} filings")

        except Exception as e:
            print(f"  [{i+1:3d}] {last}, {first}: ERROR {e}")

        time.sleep(REQUEST_DELAY)

    return cache


def _parse_html_results(soup, last: str, first: str) -> list[dict]:
    """
    Parse BeautifulSoup results table.
    TODO: Same as _parse_search_results — update selectors after inspecting
    actual response HTML.
    """
    filings = []
    table = soup.find("table")
    if not table:
        return filings

    for tr in table.find_all("tr")[1:]:  # skip header
        tds = tr.find_all("td")
        if len(tds) < 4:
            continue
        texts = [td.get_text(strip=True) for td in tds]
        link  = tr.find("a")
        href  = link["href"] if link else None
        full_url = f"{ETHICS_BASE}{href}" if href and href.startswith("/") else href

        year_str = texts[2] if len(texts) > 2 else ""
        if not year_str.isdigit():
            continue

        filings.append({
            "filer_name": texts[0],
            "position":   texts[1],
            "year":       int(year_str),
            "form_type":  _normalize_form_type(texts[3] if len(texts) > 3 else ""),
            "pdf_url":    full_url,
            "filing_id":  _extract_filing_id(href or ""),
        })

    filings.sort(key=lambda f: f.get("year", 0), reverse=True)
    return filings


# ── Phase 2: PDF parsing ───────────────────────────────────────────────────────

def parse_pdfs(cache: dict) -> list[dict]:
    """
    For each cached legislator, find their most recent Form 1 or Form 6 PDF
    and extract structured disclosure data.

    Returns list of record dicts ready for Supabase upsert.
    """
    try:
        import pdfplumber
    except ImportError:
        print("ERROR: pdfplumber not installed. Run: .venv/bin/pip install pdfplumber")
        return []

    records = []
    pdf_debug_dir = PDF_DEBUG
    pdf_debug_dir.mkdir(parents=True, exist_ok=True)

    for slug, entry in cache.items():
        if not entry.get("filings"):
            continue

        # Pick most recent Form 1 or Form 6
        target_filing = None
        for filing in entry["filings"]:
            if filing.get("form_type") in ("Form 1", "Form 6"):
                target_filing = filing
                break

        if not target_filing:
            continue

        pdf_local = target_filing.get("pdf_local")
        if not pdf_local or not Path(pdf_local).exists():
            # PDF not downloaded — still write a metadata-only record
            records.append(_build_record(entry, target_filing, {}, pdf_local=None))
            continue

        # Extract text from PDF
        raw_text = ""
        try:
            with pdfplumber.open(pdf_local) as pdf:
                raw_text = "\n".join(
                    page.extract_text() or "" for page in pdf.pages
                )
        except Exception as e:
            print(f"  WARNING: Could not read PDF {Path(pdf_local).name}: {e}")

        # Save debug text dump (only on first parse; skip if already exists)
        debug_path = pdf_debug_dir / f"{slug}.txt"
        if not debug_path.exists() and raw_text:
            debug_path.write_text(raw_text, encoding="utf-8")

        # Extract filing year from PDF text: "2024 Form 6 - Full and Public..."
        year_m = re.search(r"^(\d{4})\s+Form\s+[16]", raw_text, re.MULTILINE)
        if year_m:
            target_filing["year"] = int(year_m.group(1))

        # Parse structured fields from raw text
        form_type = target_filing.get("form_type", "Form 1")
        if form_type == "Form 6":
            parsed = _parse_form6(raw_text, slug)
        else:
            parsed = _parse_form1(raw_text, slug)

        record = _build_record(entry, target_filing, parsed, pdf_local=pdf_local,
                               raw_text_len=len(raw_text))
        records.append(record)

    print(f"  Parsed {len(records):,} disclosure records")
    return records


def _build_record(entry: dict, filing: dict, parsed: dict, pdf_local=None,
                  raw_text_len: int = 0) -> dict:
    filer_name = (filing.get("filer_name") or entry.get("display_name") or "").strip()
    # net_worth comes from _parse_form6 as a dict {year, net_worth}; extract the value
    nw_data = parsed.get("net_worth", {}) or {}
    net_worth_val = nw_data.get("net_worth") if isinstance(nw_data, dict) else None

    # Derive source_url from pdf_local filename if not saved during download
    # (filename pattern: filer-slug_filingId_formtype.pdf)
    source_url = filing.get("source_url") or filing.get("history_url", "")
    if not source_url and pdf_local:
        fid_m = re.search(r"_(\d+)_", Path(str(pdf_local)).name)
        if fid_m:
            source_url = f"{ETHICS_BASE}/Report/GetFormContent?filingId={fid_m.group(1)}"

    return {
        "filer_name":         filer_name,
        "filer_slug":         slugify(filer_name),
        "position":           filing.get("position", ""),
        "filing_year":        filing.get("year"),
        "filing_type":        filing.get("form_type", ""),
        "net_worth":          net_worth_val,
        "income_sources":     parsed.get("income_sources", []),
        "real_estate":        parsed.get("real_estate", []),
        "business_interests": parsed.get("business_interests", []),
        "liabilities":        parsed.get("liabilities", []),
        "source_url":         source_url,
        "pdf_local_path":     str(pdf_local) if pdf_local else None,
        "legislator_id":      None,  # filled in Phase 3
        "raw_text_length":    raw_text_len,
        "_people_id":         entry.get("people_id"),  # used for matching, not inserted
    }


def _parse_form1(raw_text: str, slug: str) -> dict:
    """
    Parse Form 1 (EFDMS electronic) PDF text into structured fields.

    Actual section headers in the EFDMS-generated PDFs (observed from real filings):
      "PRIMARY SOURCE OF INCOME (Over $2,500)"
      "SECONDARY SOURCES OF INCOME ..."
      "REAL PROPERTY ..."
      "INTANGIBLE PERSONAL PROPERTY ..."
      "LIABILITIES (Major debts valued over $10,000):"
      "INTERESTS IN SPECIFIED BUSINESSES ..."
      "Training"
    """
    if not raw_text:
        return {}

    return {
        "income_sources":     _extract_form1_income(raw_text),
        "real_estate":        _extract_form1_real_property(raw_text),
        "business_interests": _extract_form1_businesses(raw_text),
        "liabilities":        _extract_form1_liabilities(raw_text),
    }


def _parse_form6(raw_text: str, slug: str) -> dict:
    """
    Parse Form 6 (EFDMS electronic form) PDF text into structured fields.

    Form 6 layout observed from actual PDFs:
      - Net Worth: "My Net Worth as of December 31, YYYY was $ X.00"
      - Assets:    Section "ASSETS INDIVIDUALLY VALUED OVER $1,000:" with
                   description / value pairs (descriptions may span lines)
      - Liabilities: "LIABILITIES IN EXCESS OF $1,000:" with name/address/amount
      - Income:    "PRIMARY SOURCES OF INCOME:" with name/address/amount lines
    """
    if not raw_text:
        return {}

    return {
        "net_worth":          _extract_form6_net_worth(raw_text),
        "income_sources":     _extract_form6_income(raw_text),
        "real_estate":        [],  # assets parsing deferred — complex multi-line layout
        "business_interests": _extract_form6_business_interests(raw_text),
        "liabilities":        _extract_form6_liabilities(raw_text),
    }


def _extract_form6_net_worth(raw_text: str) -> dict:
    """Extract net worth figure from Form 6 text."""
    m = re.search(
        r"My Net Worth as of December 31,\s*(\d{4})\s+was\s+\$\s*([\d,]+\.?\d*)",
        raw_text, re.IGNORECASE
    )
    if not m:
        return {}
    return {
        "year":      int(m.group(1)),
        "net_worth": _parse_dollar(m.group(2)),
    }


def _extract_form6_income(raw_text: str) -> list[dict]:
    """
    Extract primary income sources from Form 6.

    The income section runs from "PRIMARY SOURCES OF INCOME:" to
    "SECONDARY SOURCES" or "Printed from".  Each income entry occupies
    one line ending with a dollar amount:
      <Source Name>   <Address>   $ NN,NNN.00
    The source name and address are tab/space separated; the dollar amount
    is at line end.
    """
    # Find the primary income section
    m = re.search(
        r"PRIMARY SOURCES OF INCOME:\s*\n"
        r"(?:Name of Source.*?\n)?"          # optional header row
        r"(.*?)"
        r"(?:SECONDARY SOURCES|Printed from|$)",
        raw_text, re.IGNORECASE | re.DOTALL
    )
    if not m:
        return []

    section = m.group(1)
    entries = []

    for line in section.split("\n"):
        line = line.strip()
        if not line or line.startswith("Name of Source") or line.startswith("none"):
            continue
        # Lines with income end with "$  NN,NNN.00"
        dollar_match = re.search(r"\$\s*([\d,]+\.?\d*)\s*$", line)
        if not dollar_match:
            continue
        amount = _parse_dollar(dollar_match.group(1))
        # Everything before the dollar sign is "name   address"
        rest = line[:dollar_match.start()].strip()
        # Heuristic: address starts at a 5-digit zip pattern or last long token
        addr_m = re.search(r"\s{2,}(.+?(?:,\s*FL|,\s*\d{5}).*?)$", rest, re.IGNORECASE)
        if addr_m:
            source_name = rest[:addr_m.start()].strip()
            address = addr_m.group(1).strip()
        else:
            source_name = rest
            address = ""
        if source_name and amount is not None:
            entries.append({"source": source_name, "address": address, "amount": amount})

    return entries


def _extract_form6_liabilities(raw_text: str) -> list[dict]:
    """
    Extract liabilities from Form 6.

    Section: "LIABILITIES IN EXCESS OF $1,000:" to "JOINT AND SEVERAL".
    Each liability line: <Creditor Name>   <Address>   <Amount>
    """
    m = re.search(
        r"LIABILITIES IN EXCESS OF \$1,000:\s*\n"
        r"(?:Name of Creditor.*?\n)?"
        r"(.*?)"
        r"(?:JOINT AND SEVERAL|Printed from|$)",
        raw_text, re.IGNORECASE | re.DOTALL
    )
    if not m:
        return []

    section = m.group(1)
    entries = []

    for line in section.split("\n"):
        line = line.strip()
        if not line or line.startswith("Name of Creditor") or line.upper() == "N/A":
            continue
        dollar_match = re.search(r"\$\s*([\d,]+\.?\d*)\s*$", line)
        if not dollar_match:
            continue
        amount = _parse_dollar(dollar_match.group(1))
        rest = line[:dollar_match.start()].strip()
        if rest and amount is not None:
            entries.append({"creditor": rest, "amount": amount})

    return entries


def _extract_form6_business_interests(raw_text: str) -> list[dict]:
    """
    Extract non-traded business interests from Form 6 assets section.

    Look for lines mentioning "non-traded business ownership" in assets.
    """
    entries = []
    # Match lines like: "Prescription Place - DeFuniak (non-traded business"
    # followed (possibly next line) by amount "$ 2,119,750.00"
    pattern = re.compile(
        r"((?:\w[^\n]+?)\s*\(non-traded business\s*\n?(?:ownership\))?\s*)\n\s*\$\s*([\d,]+\.?\d*)",
        re.IGNORECASE
    )
    for m in pattern.finditer(raw_text):
        name = m.group(1).replace("\n", " ").strip().rstrip("(")
        value = _parse_dollar(m.group(2))
        if name and value:
            entries.append({"name": name, "value": value})
    return entries


def _split_sections(raw_text: str) -> dict[str, str]:
    """
    Split PDF text into named sections by PART header.

    TODO: Adjust the regex if the actual PDF uses different header formatting.
    Common variants:
      "PART A – PRIMARY SOURCES OF INCOME"
      "Part A - Primary Sources of Income"
      "PART A:"
    """
    # Match "PART X" or "PART X –" or "PART X:" at start of line
    pattern = re.compile(
        r"^(PART\s+[A-Z])\s*[–\-:]?\s*(.+)?$",
        re.MULTILINE | re.IGNORECASE,
    )
    sections = {}
    matches  = list(pattern.finditer(raw_text))
    for i, m in enumerate(matches):
        part_key = m.group(1).upper().replace(" ", "")  # e.g. "PARTA"
        start    = m.end()
        end      = matches[i + 1].start() if i + 1 < len(matches) else len(raw_text)
        sections[part_key] = raw_text[start:end].strip()
    return sections


def _form1_lines_in_section(raw_text: str, section_title: str, next_titles: list[str]) -> list[str]:
    """
    Extract meaningful data lines from a Form 1 section.

    Form 1 PDFs have a consistent structure per section:
      1. Title-case heading (e.g., "Primary Sources of Income")
      2. ALL-CAPS heading with details
      3. Column headers (skip)
      4. Boilerplate "(If you have nothing to report...)" (skip)
      5. Data lines  OR  "N/A"
      6. Next title-case heading marks the boundary

    We split on title-case headings to isolate sections, then strip boilerplate.
    """
    # Build boundary pattern from next-section titles
    boundary = "|".join(re.escape(t) for t in next_titles)
    # Find start of this section (title-case heading)
    m = re.search(rf"^{re.escape(section_title)}\s*$", raw_text, re.MULTILINE | re.IGNORECASE)
    if not m:
        return []
    body = raw_text[m.end():]
    # Cut at next section title
    m_end = re.search(rf"^(?:{boundary})\s*$", body, re.MULTILINE | re.IGNORECASE)
    if m_end:
        body = body[:m_end.start()]

    # Lines to skip — either exact matches OR lines that start with these prefixes
    _SKIP_PREFIXES = re.compile(
        r"^\s*(?:"
        r"PRIMARY SOURCE OF INCOME|SECONDARY SOURCES OF INCOME|"
        r"REAL PROPERTY\s*\(|INTANGIBLE PERSONAL PROPERTY|"
        r"LIABILITIES\s*\(|INTERESTS IN SPECIFIED BUSINESSES|"
        r"Name of Source|Source'?s Address|Description of the Source|"
        r"Principal Business|Name of Business|Name of Major|"
        r"Address of Source|Business' Income|Location/Description|"
        r"Type of Intangible|Business Entity to Which|"
        r"Name of Creditor|Address of Creditor|"
        r"Printed from the Florida|Filed with COE:|"
        r"THIS STATEMENT REFLECTS|DISCLOSURE PERIOD|AGENCY INFORMATION|"
        r"General Information|"
        r"\(If you have nothing|\(Major sources|\(Major customers|"
        r"person\)\s*\(If|owned by the reporting"
        r")",
        re.IGNORECASE,
    )
    _SKIP_EXACT = re.compile(
        r"^\s*(?:N/A|none|n/a|\d{4}\s+Form\s+[16].*|Page \d+ of \d+)\s*$",
        re.IGNORECASE,
    )

    def _skip(line):
        return bool(_SKIP_PREFIXES.match(line) or _SKIP_EXACT.match(line))
    lines = []
    for line in body.split("\n"):
        line = line.strip()
        if line and not _skip(line):
            lines.append(line)
    return lines


# Section titles used in EFDMS Form 1 PDFs (title-case, exact)
_F1_SECTIONS = [
    "Primary Sources of Income",
    "Secondary Sources of Income",
    "Real Property",
    "Intangible Personal Property",
    "Liabilities",
    "Interests in Specified Businesses",
    "Training",
    "Signature of Filer",
]


def _extract_form1_income(raw_text: str) -> list[dict]:
    """
    Extract primary income sources from Form 1.
    Columns (merged onto one line by pdfplumber): Source Name | Address | Description
    No dollar amounts on Form 1.
    """
    lines = _form1_lines_in_section(
        raw_text, "Primary Sources of Income",
        ["Secondary Sources of Income", "Real Property"],
    )
    entries = []
    pending = None  # accumulate continuation lines (address wraps to next line)
    for line in lines:
        # A new entry starts if the line doesn't look like a bare zip/continuation
        if re.match(r"^\d{5}$", line):
            # Bare zip — append to previous entry's address
            if pending:
                pending["address"] = (pending["address"] + " " + line).strip()
            continue
        # Flush pending
        if pending:
            entries.append(pending)
        pending = {"source": line, "address": "", "description": ""}
    if pending:
        entries.append(pending)
    return entries


def _extract_form1_real_property(raw_text: str) -> list[dict]:
    """Extract real property entries from Form 1 (location/description strings)."""
    lines = _form1_lines_in_section(
        raw_text, "Real Property",
        ["Intangible Personal Property", "Liabilities"],
    )
    return [{"description": line} for line in lines]


def _extract_form1_liabilities(raw_text: str) -> list[dict]:
    """Extract liability entries from Form 1 (creditor name + address, merged line)."""
    lines = _form1_lines_in_section(
        raw_text, "Liabilities",
        ["Interests in Specified Businesses", "Training", "Signature of Filer"],
    )
    entries = []
    for line in lines:
        # Columns merged: creditor name then address — try 3+ space split
        parts = re.split(r"\s{3,}", line)
        entries.append({
            "creditor": parts[0].strip(),
            "address":  parts[1].strip() if len(parts) > 1 else "",
        })
    return entries


def _extract_form1_businesses(raw_text: str) -> list[dict]:
    """Extract interests in specified businesses from Form 1."""
    lines = _form1_lines_in_section(
        raw_text, "Interests in Specified Businesses",
        ["Training", "Signature of Filer"],
    )
    # Each business block starts with "Business Entity # N" (filtered by skip above)
    # Remaining lines are key: value pairs or freeform text
    entries = []
    current: dict = {}
    for line in lines:
        if re.match(r"^Business Entity", line, re.IGNORECASE):
            if current:
                entries.append(current)
            current = {}
        elif ":" in line:
            k, _, v = line.partition(":")
            current[k.strip().lower().replace(" ", "_")] = v.strip()
        else:
            current.setdefault("name", line)
    if current:
        entries.append(current)
    non_empty = [
        e for e in entries
        if any(v and str(v).lower() not in ("n/a", "none", "") for v in e.values())
    ]
    return non_empty


def _extract_part_a(raw_text: str) -> list[dict]:
    """
    PART A — Primary sources of income ($1,000+ threshold).
    Expected fields per entry: employer/source name, address, amount.

    TODO: After inspecting PDF text, implement extraction. Example pattern
    if PDF text looks like:
      "Acme Corp, 123 Main St, Tallahassee FL   $75,000"
    you might use:
      re.findall(r"(.+?)\\s+\\$(\\d[\\d,]+)", section_text)

    For now returns empty list.
    """
    sections = _split_sections(raw_text)
    section  = sections.get("PARTA", "")
    if not section:
        return []

    # TODO: parse section text into [{employer, address, amount}] entries
    # Stub implementation — prints section for debugging on first pass
    entries = []
    # Example placeholder parser (replace with real logic):
    # for line in section.split("\n"):
    #     m = re.match(r"^(.+?)\s+\$([\d,]+)", line.strip())
    #     if m:
    #         entries.append({"employer": m.group(1).strip(),
    #                          "amount": _parse_dollar(m.group(2))})
    return entries


def _extract_part_c(raw_text: str) -> list[dict]:
    """
    PART C — Real property (description, value).

    TODO: Parse into [{description, value, address}] entries.
    """
    sections = _split_sections(raw_text)
    section  = sections.get("PARTC", "")
    if not section:
        return []

    entries = []
    # TODO: implement
    return entries


def _extract_part_e(raw_text: str) -> list[dict]:
    """
    PART E — Liabilities ($10,000+ threshold).

    TODO: Parse into [{creditor, amount, type}] entries.
    """
    sections = _split_sections(raw_text)
    section  = sections.get("PARTE", "")
    if not section:
        return []

    entries = []
    # TODO: implement
    return entries


def _extract_part_f(raw_text: str) -> list[dict]:
    """
    PART F — Interests in specified businesses.

    TODO: Parse into [{business_name, nature_of_interest, value}] entries.
    """
    sections = _split_sections(raw_text)
    section  = sections.get("PARTF", "")
    if not section:
        return []

    entries = []
    # TODO: implement
    return entries


def _extract_net_worth(raw_text: str) -> dict:
    """Form 6 only — delegates to _extract_form6_net_worth."""
    return _extract_form6_net_worth(raw_text)


def _parse_dollar(s: str) -> float | None:
    """Convert "$1,234,567" → 1234567.0."""
    try:
        return float(re.sub(r"[^\d.]", "", s))
    except (ValueError, TypeError):
        return None


# ── Phase 3: Match to legislators + Supabase upsert ──────────────────────────

def match_to_legislators(records: list[dict], legislators: list[dict]) -> list[dict]:
    """
    Fuzzy-match filer_name against legislators.display_name.
    Sets legislator_id (people_id) on matched records.

    Priority:
      1. Use _people_id already stored in cache (exact match from search)
      2. Fuzzy match filer_name against display_name as fallback
    """
    try:
        from rapidfuzz import fuzz
    except ImportError:
        print("  WARNING: rapidfuzz not installed — skipping legislator matching")
        return records

    # Build lookup: people_id → legislator dict
    leg_by_id = {leg["people_id"]: leg for leg in legislators}

    # Build normalized name → people_id for fuzzy fallback
    leg_names = [(norm(leg.get("display_name", "")), leg["people_id"])
                 for leg in legislators]

    matched = 0
    for rec in records:
        # Use direct people_id from cache if available
        cached_id = rec.pop("_people_id", None)
        if cached_id and cached_id in leg_by_id:
            rec["legislator_id"] = cached_id
            matched += 1
            continue

        # Fuzzy fallback
        filer_n = norm(rec.get("filer_name", ""))
        if not filer_n:
            continue

        best_score = 0
        best_id    = None
        for leg_n, leg_id in leg_names:
            score = fuzz.token_sort_ratio(filer_n, leg_n)  # type: ignore[attr-defined]
            if score > best_score:
                best_score = score
                best_id    = leg_id

        if best_score >= MATCH_THRESHOLD:
            rec["legislator_id"] = best_id
            matched += 1

    print(f"  Matched {matched:,}/{len(records):,} records to legislators")
    return records


def upsert_to_supabase(records: list[dict]) -> None:
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        print("  WARNING: SUPABASE_DB_URL not set — skipping Supabase upsert")
        return

    con = psycopg2.connect(db_url, options="-c statement_timeout=60000")
    con.autocommit = False
    cur = con.cursor()
    try:
        for _ddl in _DDL_STEPS:
            cur.execute(_ddl)
        con.commit()   # commit schema before touching data
        # Remove stub rows from prior runs that had no filing_year (NULL rows
        # can't be matched by the partial unique index, so they accumulate)
        cur.execute("DELETE FROM official_disclosures WHERE filing_year IS NULL")

        def _jdump(v):
            if not v:
                return json.dumps([])
            return json.dumps(v, default=str)

        tuples = []
        for r in records:
            tuples.append((
                r.get("filer_name"),
                r.get("filer_slug"),
                r.get("position"),
                r.get("filing_year"),
                r.get("filing_type"),
                r.get("net_worth"),
                _jdump(r.get("income_sources")),
                _jdump(r.get("real_estate")),
                _jdump(r.get("business_interests")),
                _jdump(r.get("liabilities")),
                r.get("source_url"),
                r.get("pdf_local_path"),
                r.get("legislator_id"),
                r.get("raw_text_length", 0),
            ))

        execute_values(
            cur,
            """
            INSERT INTO official_disclosures (
                filer_name, filer_slug, position, filing_year, filing_type,
                net_worth, income_sources, real_estate, business_interests, liabilities,
                source_url, pdf_local_path, legislator_id, raw_text_length
            ) VALUES %s
            ON CONFLICT (filer_slug, filing_year, filing_type)
            WHERE filing_year IS NOT NULL
            DO UPDATE SET
                filer_name          = EXCLUDED.filer_name,
                position            = EXCLUDED.position,
                net_worth           = EXCLUDED.net_worth,
                income_sources      = EXCLUDED.income_sources,
                real_estate         = EXCLUDED.real_estate,
                business_interests  = EXCLUDED.business_interests,
                liabilities         = EXCLUDED.liabilities,
                source_url          = EXCLUDED.source_url,
                pdf_local_path      = EXCLUDED.pdf_local_path,
                legislator_id       = EXCLUDED.legislator_id,
                raw_text_length     = EXCLUDED.raw_text_length,
                updated_at          = NOW()
            """,
            tuples,
        )
        con.commit()
        print(f"  Upserted {len(tuples):,} rows → official_disclosures")
    except Exception as e:
        con.rollback()
        raise
    finally:
        cur.close()
        con.close()


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> int:
    import argparse

    ap = argparse.ArgumentParser(description="Scrape FL Ethics financial disclosures")
    ap.add_argument("--force",         action="store_true",
                    help="Re-scrape even if cached")
    ap.add_argument("--requests-only", action="store_true",
                    help="Use requests+BS4 fallback instead of Playwright")
    ap.add_argument("--parse-only",    action="store_true",
                    help="Skip scraping; re-parse cached PDFs and reload Supabase")
    ap.add_argument("--load-only",     action="store_true",
                    help="Skip scraping and parsing; just upsert parsed_disclosures.json")
    ap.add_argument("--pdf-only",      action="store_true",
                    help="Skip Phase 1 scraping; only download PDFs for cached filings")
    ap.add_argument("--legislator",    metavar="NAME",
                    help='Scrape one legislator only, e.g. "Smith, John"')
    args = ap.parse_args()

    ETHICS_DIR.mkdir(parents=True, exist_ok=True)
    PDF_DIR.mkdir(parents=True, exist_ok=True)

    print("=== Script 98: FL Ethics Disclosure Scraper ===\n")

    # ── Phase 0: Load legislators ──
    if not args.load_only:
        print("Phase 0: Loading legislators from Supabase ...")
        legislators = load_legislators()
        print()
    else:
        legislators = []

    # ── Phase 1: Scrape ──
    if not args.parse_only and not args.load_only and not args.pdf_only:
        cache = load_cache(SEARCH_CACHE)
        print(f"Phase 1: Scraping ethics disclosures ({len(cache)} cached) ...")

        if args.requests_only:
            print("  Using requests fallback (likely to fail on JS-rendered site)\n")
            cache = scrape_with_requests(legislators, cache, args.force)
        else:
            print("  Using Playwright (headless Chromium)\n")
            cache = scrape_with_playwright(legislators, cache, args.force,
                                           single_name=args.legislator)

        save_cache(cache, SEARCH_CACHE)
        total_filings = sum(len(e.get("filings", [])) for e in cache.values())
        print(f"\n  Cached: {len(cache):,} legislators, {total_filings:,} total filings")
        print(f"  Cache saved → {SEARCH_CACHE}")
        print()
    else:
        cache = load_cache(SEARCH_CACHE)

    # ── Phase 1b: Download PDFs ──
    if not args.load_only and not args.parse_only:
        print("Phase 1b: Downloading PDFs ...")
        cache = download_pdfs_phase(cache)
        save_cache(cache, SEARCH_CACHE)
        print(f"  Cache updated → {SEARCH_CACHE}\n")

    # ── Phase 2: Parse PDFs ──
    if not args.load_only:
        print("Phase 2: Parsing PDFs ...")
        records = parse_pdfs(cache)

        # Save parsed output
        save_cache({"records": records}, PARSED_JSON)
        print(f"  Parsed JSON saved → {PARSED_JSON}")

        # Match to legislators
        if legislators:
            print("\nPhase 2b: Matching filer names to legislators ...")
            records = match_to_legislators(records, legislators)
        print()
    else:
        data = load_cache(PARSED_JSON)
        records = data.get("records", [])
        print(f"  Loaded {len(records):,} records from {PARSED_JSON.name}")

    # ── Phase 3: Upsert to Supabase ──
    if records:
        print("Phase 3: Upserting to Supabase ...")
        upsert_to_supabase(records)
    else:
        print("Phase 3: No records to upsert")

    # ── Summary ──
    matched   = sum(1 for r in records if r.get("legislator_id"))
    with_data = sum(1 for r in records if r.get("income_sources") or r.get("real_estate"))

    print("\n=== DONE ===")
    print(f"  Total records:             {len(records):,}")
    print(f"  Matched to legislators:    {matched:,}")
    print(f"  Records with parsed data:  {with_data:,}")
    print(f"\n  Cache dir:  {ETHICS_DIR}")
    print(f"  PDF debug:  {PDF_DEBUG}")
    print(f"\n  NEXT STEPS (if with_data == 0):")
    print(f"    1. Check {PDF_DEBUG}/ — open any .txt file to see raw PDF text")
    print(f"    2. Update _extract_part_a(), _extract_part_c(), etc. to parse that format")
    print(f"    3. Re-run with --parse-only --load-only to reload without re-scraping")
    print(f"\n  NEXT STEPS (if scrape returned 0 filings):")
    print(f"    1. Open {PDF_DEBUG}/debug_*.html in a browser to see what the site returned")
    print(f"    2. Adjust selectors in _search_one_legislator() and _parse_search_results()")
    print(f"    3. Check DevTools Network tab on {SEARCH_URL} for actual API calls")

    return 0


if __name__ == "__main__":
    sys.exit(main())
