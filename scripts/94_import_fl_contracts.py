"""
Script 94: Download FL state contract/vendor data from FACTS (FL Accountability
Contract Tracking System) and match against donor + principal databases.

Source: Florida Accountability Contract Tracking System (FACTS)
        https://facts.fldfs.com/Search/ContractSearch.aspx
        Florida Dept of Financial Services — public, no auth required

Strategy:
  1. For each two-character vendor prefix (AA–ZZ), POST a search against FACTS
     and collect all contract records. Cache results to avoid re-fetching.
  2. Aggregate total awarded amounts per vendor name across all fiscal years.
  3. Fuzzy-match vendor names against our donors + principals databases.

Outputs
-------
  data/processed/fl_contracts.csv           — FL state vendors + award totals
  data/processed/donor_contract_matches.csv — donors/principals matched to vendors
  data/raw/contracts/facts_cache.json       — cached FACTS pages

Usage
-----
  python scripts/94_import_fl_contracts.py
  python scripts/94_import_fl_contracts.py --force     # ignore cache
  python scripts/94_import_fl_contracts.py --targeted  # only search known donor names
"""

import html as html_lib
import io
import csv as csv_mod
import json
import re
import sys
import time
import string
from pathlib import Path

import pandas as pd
import requests
from bs4 import BeautifulSoup
from rapidfuzz import fuzz

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR, RAW_DIR

# ── Paths ─────────────────────────────────────────────────────────────────────
CONTRACTS_DIR    = RAW_DIR / "contracts"
CACHE_JSON       = CONTRACTS_DIR / "facts_cache.json"
OUTPUT_CONTRACTS = PROCESSED_DIR / "fl_contracts.csv"
OUTPUT_MATCHES   = PROCESSED_DIR / "donor_contract_matches.csv"
DONORS_CSV       = PROCESSED_DIR / "donors.csv"
PRINCIPALS_CSV   = PROCESSED_DIR / "principals.csv"

# ── Config ────────────────────────────────────────────────────────────────────
FACTS_URL       = "https://facts.fldfs.com/Search/ContractSearch.aspx"
REQUEST_DELAY   = 0.5   # seconds between requests (be polite)
FUZZY_THRESHOLD = 82    # token_sort_ratio match threshold
MIN_AMOUNT      = 10_000  # ignore tiny contracts

_PUNCT = re.compile(r"[^A-Z0-9\s]")
_CORP_SUFFIXES = re.compile(
    r"\b(LLC|INC|CORP|CORPORATION|LTD|LP|LLP|CO|COMPANY|GROUP|HOLDINGS|PARTNERS"
    r"|ENTERPRISES|SERVICES|SOLUTIONS|ASSOCIATES|CONSULTING|TECHNOLOGIES|SYSTEMS"
    r"|MANAGEMENT|FOUNDATION|TRUST|FUND)\b\.?"
)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Referer": FACTS_URL,
}


# ── Name normalization ────────────────────────────────────────────────────────

def norm(s: str) -> str:
    return " ".join(_PUNCT.sub(" ", str(s).upper()).split())


def norm_strip_corp(s: str) -> str:
    n = norm(s)
    return " ".join(_CORP_SUFFIXES.sub("", n).split())


# ── Cache helpers ─────────────────────────────────────────────────────────────

def load_cache(path: Path) -> dict:
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {"searches": {}, "aggregated": {}}


def save_cache(cache: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(cache, f)


# ── FACTS ASP.NET form handler ────────────────────────────────────────────────

def get_form_state(session: requests.Session) -> dict:
    """
    GET the FACTS search page and extract all hidden ASP.NET form fields.
    Returns dict of field_name → value for use in subsequent POSTs.
    """
    r = session.get(FACTS_URL, headers=HEADERS, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    state = {}
    # Grab all hidden inputs
    for inp in soup.find_all("input", type="hidden"):
        name = inp.get("name", "")
        val  = inp.get("value", "")
        if name:
            state[name] = val

    # Detect the vendor name input field name dynamically
    # FACTS uses ContentPlaceHolder, so IDs like ctl00$MainContent$txtVendorName
    vendor_input = soup.find("input", attrs={"type": "text", "id": re.compile(r"txt.*[Vv]endor", re.I)})
    if vendor_input:
        state["_vendor_field"] = vendor_input.get("name", "")
    else:
        # Fallback: try common FACTS field name patterns
        state["_vendor_field"] = "ctl00$MainContent$txtVendorName"

    # Detect submit button name
    submit_btn = soup.find("input", attrs={"type": "submit", "id": re.compile(r"btn.*[Ss]earch", re.I)})
    if submit_btn:
        state["_submit_field"] = submit_btn.get("name", "")
        state["_submit_value"] = submit_btn.get("value", "Search")
    else:
        state["_submit_field"] = "ctl00$MainContent$btnSearch"
        state["_submit_value"] = "Search"

    return state


def parse_results_table(html: str) -> list[dict]:
    """
    Parse the FACTS results table from an HTML response.
    Returns list of contract record dicts.
    """
    soup = BeautifulSoup(html, "html.parser")
    records = []

    # Find the results grid (ASP.NET GridView — usually a table with class or id containing "Grid")
    table = None
    for t in soup.find_all("table"):
        tid = t.get("id", "")
        if "Grid" in tid or "grid" in tid or "Result" in tid or "result" in tid:
            table = t
            break

    # Fallback: find any table with 4+ columns
    if not table:
        for t in soup.find_all("table"):
            headers = t.find_all("th")
            if len(headers) >= 4:
                table = t
                break

    if not table:
        return records

    rows = table.find_all("tr")
    if not rows:
        return records

    # Parse header row
    header_cells = rows[0].find_all(["th", "td"])
    headers = [h.get_text(strip=True).lower() for h in header_cells]

    # Map common FACTS column names
    col_map = {}
    for i, h in enumerate(headers):
        if "vendor" in h and "name" in h:
            col_map["vendor_name"] = i
        elif "vendor" in h:
            col_map["vendor_name"] = i
        elif "agency" in h:
            col_map["agency"] = i
        elif "amount" in h or "value" in h or "dollar" in h:
            col_map["amount"] = i
        elif "begin" in h or "start" in h:
            col_map["begin_date"] = i
        elif "end" in h or "expir" in h:
            col_map["end_date"] = i
        elif "contract" in h and "id" in h:
            col_map["contract_id"] = i
        elif "type" in h or "commodity" in h:
            col_map["contract_type"] = i

    # Parse data rows
    for row in rows[1:]:
        cells = row.find_all("td")
        if not cells or len(cells) < 2:
            continue

        def cell(key):
            idx = col_map.get(key)
            if idx is not None and idx < len(cells):
                return cells[idx].get_text(strip=True)
            return ""

        vendor = cell("vendor_name")
        if not vendor:
            continue

        # Parse amount — strip $, commas, handle parentheses for negative
        amount_str = cell("amount").replace("$", "").replace(",", "").replace("(", "-").replace(")", "")
        try:
            amount = float(amount_str) if amount_str else 0.0
        except ValueError:
            amount = 0.0

        records.append({
            "vendor_name":   vendor,
            "agency":        cell("agency"),
            "amount":        amount,
            "begin_date":    cell("begin_date"),
            "end_date":      cell("end_date"),
            "contract_id":   cell("contract_id"),
            "contract_type": cell("contract_type"),
        })

    return records


def find_download_event(html: str) -> tuple[str, str] | None:
    """
    Return the (__doPostBack event_target, event_argument) for the CSV export.
    Uses known FACTS event target first; falls back to dynamic scan.
    Known target: ctl00$PC$hlkExport with empty argument.
    """
    # Known FACTS export event target (confirmed from page source)
    if "hlkExport" in html or "Download Results" in html:
        return ("ctl00$PC$hlkExport", "")

    # Dynamic fallback: scan for any download/export link
    # Decode HTML entities so &#39; becomes ' before regex matching
    decoded = html_lib.unescape(html)
    m = re.search(
        r"__doPostBack\([\"']([^\"']*(?:[Ee]xport|[Dd]ownload)[^\"']*)[\"'],[\"']([^\"']*)[\"']",
        decoded
    )
    if m:
        return (m.group(1), m.group(2))

    return None


def trigger_csv_download(
    session: requests.Session,
    search_html: str,
    form_state: dict,
    vendor_prefix: str,
) -> list[dict] | None:
    """
    After a successful search POST, attempt to trigger the CSV download.
    Returns parsed records if successful, None if download not available.

    Strategy:
    1. Find the download button's __doPostBack target in the search results HTML.
    2. POST the download event (with refreshed ViewState from search response).
    3. If the response is CSV content, parse it. If it's a redirect, follow it.
    4. Return None if no download button found (caller will fall back to HTML parsing).
    """
    download_event = find_download_event(search_html)
    if not download_event:
        return None

    event_target, event_argument = download_event

    # Rebuild POST data from search response's updated ViewState
    soup = BeautifulSoup(search_html, "html.parser")
    post_data = {}
    for inp in soup.find_all("input", type="hidden"):
        name = inp.get("name", "")
        val  = inp.get("value", "")
        if name:
            post_data[name] = val

    post_data["__EVENTTARGET"]   = event_target
    post_data["__EVENTARGUMENT"] = event_argument

    try:
        r = session.post(FACTS_URL, data=post_data, headers=HEADERS, timeout=60,
                         allow_redirects=True)
        r.raise_for_status()
    except Exception as e:
        print(f"    Download POST failed for '{vendor_prefix}': {e}", flush=True)
        return None

    content = r.content

    # Detect CSV: starts with a letter/quote (not <html) and has commas
    decoded = content[:500].decode("utf-8", errors="replace").lstrip("\ufeff")
    if decoded.strip().startswith("<"):
        # Might be a redirect HTML page — check for meta refresh or form resubmit
        # Try a plain GET (some ASP.NET apps set a session flag, then GET returns CSV)
        try:
            r2 = session.get(FACTS_URL, headers=HEADERS, timeout=60)
            r2.raise_for_status()
            decoded2 = r2.content[:500].decode("utf-8", errors="replace").lstrip("\ufeff")
            if not decoded2.strip().startswith("<"):
                content = r2.content
                decoded = decoded2
            else:
                return None
        except Exception:
            return None

    # Parse CSV
    try:
        text = content.decode("utf-8", errors="replace").lstrip("\ufeff")
        reader = csv_mod.DictReader(io.StringIO(text))
        records = []
        for row in reader:
            records.append(dict(row))
        return records if records else None
    except Exception as e:
        print(f"    CSV parse error for '{vendor_prefix}': {e}", flush=True)
        return None


def parse_csv_records(raw_records: list[dict]) -> list[dict]:
    """
    Normalize raw CSV rows from FACTS into our standard contract record format.
    FACTS has ~52 columns — we pick the key ones by scanning header names.
    """
    if not raw_records:
        return []

    # Build a flexible column map by scanning first record's keys
    sample = raw_records[0]
    keys = list(sample.keys())

    def find_col(*patterns):
        for p in patterns:
            for k in keys:
                if re.search(p, k, re.I):
                    return k
        return None

    vendor_col  = find_col(r"vendor.*name", r"grantor.*name", r"vendor")
    agency_col  = find_col(r"agency.*name", r"department.*name", r"agency")
    amount_col  = find_col(r"total.*amount", r"contract.*amount", r"amount", r"dollar")
    begin_col   = find_col(r"begin.*date", r"start.*date", r"effective")
    end_col     = find_col(r"end.*date", r"expir.*date", r"terminat")
    id_col      = find_col(r"contract.*id", r"award.*id", r"contract.*number")
    type_col    = find_col(r"contract.*type", r"type", r"commodity")

    normalized = []
    for row in raw_records:
        vendor = (row.get(vendor_col, "") if vendor_col else "").strip()
        if not vendor:
            continue

        raw_amount = row.get(amount_col, "0") if amount_col else "0"
        amount_str = str(raw_amount).replace("$", "").replace(",", "").replace("(", "-").replace(")", "").strip()
        try:
            amount = float(amount_str) if amount_str else 0.0
        except ValueError:
            amount = 0.0

        begin_date = row.get(begin_col, "") if begin_col else ""
        end_date   = row.get(end_col, "") if end_col else ""
        year = ""
        for d in (begin_date, end_date):
            m = re.search(r"(20\d{2}|19\d{2})", str(d))
            if m:
                year = m.group(1)
                break

        normalized.append({
            "vendor_name":   vendor,
            "agency":        (row.get(agency_col, "") if agency_col else "").strip(),
            "amount":        amount,
            "begin_date":    begin_date,
            "end_date":      end_date,
            "contract_id":   (row.get(id_col, "") if id_col else "").strip(),
            "contract_type": (row.get(type_col, "") if type_col else "").strip(),
            "year":          year,
        })

    return normalized


def search_facts_vendor(session: requests.Session, vendor_prefix: str, form_state: dict) -> list[dict]:
    """
    Search FACTS for vendors matching a prefix.
    Tries CSV download first; falls back to HTML table pagination.
    """
    records = []
    vendor_field  = form_state.get("_vendor_field", "ctl00$MainContent$txtVendorName")
    submit_field  = form_state.get("_submit_field", "ctl00$MainContent$btnSearch")
    submit_value  = form_state.get("_submit_value", "Search")

    # Build POST data — include all hidden fields + vendor search
    post_data = {k: v for k, v in form_state.items() if not k.startswith("_")}
    post_data[vendor_field] = vendor_prefix
    post_data[submit_field] = submit_value

    # ── Initial search POST ───────────────────────────────────────────────────
    try:
        r = session.post(FACTS_URL, data=post_data, headers=HEADERS, timeout=30)
        r.raise_for_status()
    except Exception as e:
        print(f"    Search error for '{vendor_prefix}': {e}", flush=True)
        return []

    search_html = r.text

    # ── Try CSV download first ────────────────────────────────────────────────
    csv_records = trigger_csv_download(session, search_html, form_state, vendor_prefix)
    if csv_records is not None:
        return parse_csv_records(csv_records)

    # ── Fallback: paginate HTML table (10 rows/page) ─────────────────────────
    # FACTS pagination: __doPostBack("ctl00$PC$pcContract","next")
    page_num = 1
    current_html = search_html

    while True:
        page_records = parse_results_table(current_html)
        records.extend(page_records)

        if not page_records:
            break

        # Check for "Next Page" link
        decoded_html = html_lib.unescape(current_html)
        if "Next Page" not in decoded_html and '"next"' not in decoded_html:
            break

        if page_num >= 50:  # safety cap (500 rows max via HTML fallback)
            break

        # Build next-page POST from current page's ViewState
        soup = BeautifulSoup(current_html, "html.parser")
        next_post = {}
        for inp in soup.find_all("input", type="hidden"):
            name = inp.get("name", "")
            if name:
                next_post[name] = inp.get("value", "")
        next_post["__EVENTTARGET"]   = "ctl00$PC$pcContract"
        next_post["__EVENTARGUMENT"] = "next"

        try:
            rp = session.post(FACTS_URL, data=next_post, headers=HEADERS, timeout=30)
            rp.raise_for_status()
            current_html = rp.text
        except Exception as e:
            print(f"    Page {page_num+1} error for '{vendor_prefix}': {e}", flush=True)
            break

        page_num += 1
        time.sleep(REQUEST_DELAY)

    return records


# ── Step 1: Scrape FACTS ──────────────────────────────────────────────────────

def fetch_fl_state_contracts(force: bool = False, targeted_names: list = None) -> dict:
    """
    Fetches FL state contracts from FACTS.
    - If targeted_names provided: search those specific names only.
    - Otherwise: sweep all 2-char alphabetical prefixes.

    Returns dict: vendor_name → {total_amount, num_contracts, agencies, years}
    """
    CONTRACTS_DIR.mkdir(parents=True, exist_ok=True)
    cache = load_cache(CACHE_JSON) if not force else {"searches": {}, "aggregated": {}}
    aggregated = cache.get("aggregated", {})

    session = requests.Session()

    # Get initial form state
    print("  Fetching FACTS form state ...", flush=True)
    try:
        form_state = get_form_state(session)
    except Exception as e:
        print(f"  ERROR: Could not load FACTS page: {e}", flush=True)
        return {}

    print(f"  Form state loaded (vendor field: {form_state.get('_vendor_field')})", flush=True)

    # Determine search prefixes
    if targeted_names:
        # Use first 3 chars of each name as search prefix
        prefixes = sorted(set(norm(n)[:3] for n in targeted_names if len(norm(n)) >= 2))
        print(f"  Targeted mode: {len(prefixes)} unique prefixes from {len(targeted_names)} names", flush=True)
    else:
        # Full alphabetical sweep — 2-char prefixes
        chars = string.ascii_uppercase + string.digits
        prefixes = [a + b for a in chars for b in chars]
        print(f"  Full sweep mode: {len(prefixes)} prefixes (AA–ZZ + 00–99)", flush=True)

    total_prefixes = len(prefixes)

    for i, prefix in enumerate(prefixes):
        cache_key = prefix

        if cache_key in cache.get("searches", {}):
            continue  # already fetched

        if i % 50 == 0:
            print(f"  [{i}/{total_prefixes}] prefix '{prefix}' ...", flush=True)

        records = search_facts_vendor(session, prefix, form_state)

        # Refresh form state periodically (ViewState can expire)
        if i > 0 and i % 100 == 0:
            try:
                form_state = get_form_state(session)
            except Exception:
                pass

        # Aggregate results
        for rec in records:
            name = rec["vendor_name"].strip()
            amount = rec["amount"]
            agency = rec.get("agency", "")

            # Use pre-parsed year if available, otherwise extract from dates
            year = rec.get("year", "")
            if not year:
                for d in (rec.get("begin_date", ""), rec.get("end_date", "")):
                    m = re.search(r"(20\d{2}|19\d{2})", str(d))
                    if m:
                        year = m.group(1)
                        break

            if not name or amount < MIN_AMOUNT:
                continue

            if name not in aggregated:
                aggregated[name] = {
                    "total_amount": 0,
                    "num_contracts": 0,
                    "agencies": [],
                    "years": [],
                }

            aggregated[name]["total_amount"] += amount
            aggregated[name]["num_contracts"] += 1
            if agency and agency not in aggregated[name]["agencies"]:
                aggregated[name]["agencies"].append(agency)
            if year and year not in aggregated[name]["years"]:
                aggregated[name]["years"].append(year)

        # Mark prefix as done and save cache
        cache.setdefault("searches", {})[cache_key] = {"count": len(records)}
        cache["aggregated"] = aggregated
        if i % 20 == 0:
            save_cache(cache, CACHE_JSON)

        time.sleep(REQUEST_DELAY)

    save_cache(cache, CACHE_JSON)
    print(f"  Done. {len(aggregated):,} unique vendors in aggregated data.", flush=True)
    return aggregated


# ── Step 2: Write contracts CSV ───────────────────────────────────────────────

def write_contracts_csv(aggregated: dict, output: Path) -> pd.DataFrame:
    rows = []
    for name, data in aggregated.items():
        agencies = data.get("agencies", [])
        years    = data.get("years", [])
        rows.append({
            "vendor_name":   name,
            "total_amount":  data["total_amount"],
            "num_contracts": data["num_contracts"],
            "top_agency":    agencies[0] if agencies else "",
            "all_agencies":  "|".join(agencies),
            "year_range":    f"{min(years)}-{max(years)}" if years else "",
        })
    df = pd.DataFrame(rows).sort_values("total_amount", ascending=False)
    output.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output, index=False)
    print(f"  {len(df):,} unique FL state vendors → {output.name}")
    return df


# ── Step 3: Load donor + principal names ──────────────────────────────────────

def load_entity_names() -> list[dict]:
    """Returns list of {slug, name, entity_type, total} for corporate donors + principals."""
    entities = []

    if DONORS_CSV.exists():
        d_df = pd.read_csv(DONORS_CSV, dtype=str, usecols=lambda c: c in (
            "slug", "name", "total_combined", "is_corporate"
        )).fillna("")
        for _, row in d_df.iterrows():
            name = row.get("name", "").strip()
            is_corp = str(row.get("is_corporate", "")).lower() in ("true", "1", "yes")
            if name and is_corp:
                entities.append({
                    "slug":                row.get("slug", ""),
                    "name":                name,
                    "entity_type":         "donor_corporate",
                    "total_contributions": float(row.get("total_combined", 0) or 0),
                })
        print(f"  Loaded {len(entities):,} corporate donors")
    else:
        print(f"  WARNING: {DONORS_CSV.name} not found — skipping donor match")

    if PRINCIPALS_CSV.exists():
        p_df = pd.read_csv(PRINCIPALS_CSV, dtype=str).fillna("")
        for _, row in p_df.iterrows():
            name = row.get("principal_name", "").strip()
            if name:
                entities.append({
                    "slug":                row.get("slug", ""),
                    "name":                name,
                    "entity_type":         "principal",
                    "total_contributions": 0,
                })
        n_principals = sum(1 for e in entities if e["entity_type"] == "principal")
        print(f"  Loaded {n_principals:,} principals")
    else:
        print(f"  WARNING: {PRINCIPALS_CSV.name} not found — skipping principal match")

    return entities


# ── Step 4: Fuzzy match entities to vendors ───────────────────────────────────

def match_entities_to_contracts(entities: list[dict], contracts_df: pd.DataFrame) -> pd.DataFrame:
    vendor_records = []
    for _, row in contracts_df.iterrows():
        n  = norm(row["vendor_name"])
        ns = norm_strip_corp(row["vendor_name"])
        vendor_records.append({
            "norm":         n,
            "norm_stripped": ns,
            "vendor_name":  row["vendor_name"],
            "total_amount": row["total_amount"],
            "num_contracts": row["num_contracts"],
            "top_agency":   row["top_agency"],
            "year_range":   row["year_range"],
        })

    print(f"  Matching {len(entities):,} entities against {len(vendor_records):,} vendors ...", flush=True)
    matches = []

    for entity in entities:
        e_n  = norm(entity["name"])
        e_ns = norm_strip_corp(entity["name"])

        best_score = 0
        best_rec   = None

        for rec in vendor_records:
            if e_ns == rec["norm_stripped"] or e_n == rec["norm"]:
                best_score = 100
                best_rec   = rec
                break

            score = fuzz.token_sort_ratio(e_ns, rec["norm_stripped"])
            if score > best_score and score >= FUZZY_THRESHOLD:
                best_score = score
                best_rec   = rec

        if best_rec:
            matches.append({
                "entity_slug":           entity["slug"],
                "entity_name":           entity["name"],
                "entity_type":           entity["entity_type"],
                "total_contributions":   entity["total_contributions"],
                "vendor_name":           best_rec["vendor_name"],
                "total_contract_amount": best_rec["total_amount"],
                "num_contracts":         best_rec["num_contracts"],
                "top_agency":            best_rec["top_agency"],
                "year_range":            best_rec["year_range"],
                "match_score":           best_score,
                "match_method":          "exact" if best_score == 100 else "fuzzy",
            })

    print(f"  Matched: {len(matches):,} entities have FL state contracts")
    df = pd.DataFrame(matches).sort_values("total_contract_amount", ascending=False)
    return df


# ── Main ──────────────────────────────────────────────────────────────────────

def main(force: bool = False, targeted: bool = False) -> int:
    print("=== Script 94: FL State Contracts via FACTS (FL DFS) ===\n")

    # Step 1: Load entities first (used for targeted mode)
    targeted_names = None
    if targeted:
        print("Step 1a: Loading entity names for targeted search ...", flush=True)
        entities_pre = load_entity_names()
        targeted_names = [e["name"] for e in entities_pre]
        print(f"  {len(targeted_names):,} names loaded for targeted search\n")

    # Step 1: Download / load from cache
    print("Step 1: Fetching FL state contracts from FACTS ...", flush=True)
    aggregated = fetch_fl_state_contracts(force=force, targeted_names=targeted_names)

    if not aggregated:
        print("\nFACTS scrape returned no data. Possible causes:")
        print("  - Site blocked the request (check manually at https://facts.fldfs.com)")
        print("  - ASP.NET form field names changed")
        print("  - Run with --debug to see raw HTML response")
        return 1

    total_amount = sum(d["total_amount"] for d in aggregated.values())
    print(f"  {len(aggregated):,} unique vendors, ${total_amount/1e9:.1f}B total\n")

    # Step 2: Write contracts CSV
    print("Step 2: Writing contracts CSV ...", flush=True)
    contracts_df = write_contracts_csv(aggregated, OUTPUT_CONTRACTS)
    print(f"\n  Top 10 FL state vendors by contract amount:")
    for _, r in contracts_df.head(10).iterrows():
        print(f"    {r['vendor_name'][:45]:45s}  ${r['total_amount']/1e6:8.1f}M  ({r['num_contracts']} contracts)")
    print()

    # Step 3: Load entities
    if not targeted:
        print("Step 3: Loading donor + principal names ...", flush=True)
        entities = load_entity_names()
    else:
        entities = entities_pre
    print(f"  Total entities: {len(entities):,}\n")

    if not entities:
        print("WARNING: No entities to match. Skipping match step.")
        return 0

    # Step 4: Match
    print("Step 4: Matching entities to vendors ...", flush=True)
    matches_df = match_entities_to_contracts(entities, contracts_df)
    matches_df.to_csv(OUTPUT_MATCHES, index=False)
    print(f"\n  {len(matches_df):,} matches → {OUTPUT_MATCHES.name}")

    if not matches_df.empty:
        print("\n  Top 15 'pay to play' matches (highest contract amount):")
        for _, r in matches_df.head(15).iterrows():
            contrib = f"${r['total_contributions']/1e6:.1f}M" if r["total_contributions"] > 0 else "n/a"
            print(
                f"    {r['entity_name'][:38]:38s}  "
                f"contrib={contrib:10s}  "
                f"contracts=${r['total_contract_amount']/1e6:7.1f}M  "
                f"[{r['match_method']}:{r['match_score']}]"
            )

        print(f"\n  By entity type:")
        for t, grp in matches_df.groupby("entity_type"):
            print(f"    {t}: {len(grp)} matches, ${grp['total_contract_amount'].sum()/1e9:.2f}B in contracts")

    print("\n=== DONE ===")
    print(f"Contracts: {OUTPUT_CONTRACTS}")
    print(f"Matches:   {OUTPUT_MATCHES}")
    print("\nNext: Run 95_load_contracts_supabase.py to load to Supabase.")
    return 0


if __name__ == "__main__":
    force   = "--force" in sys.argv
    targeted = "--targeted" in sys.argv
    sys.exit(main(force=force, targeted=targeted))
