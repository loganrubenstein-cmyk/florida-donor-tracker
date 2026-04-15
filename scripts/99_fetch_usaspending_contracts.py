"""
Script 99: Fetch FL federal contracts from USASpending.gov, load to Supabase,
and cross-reference against state vendor and donor data.

Source: https://api.usaspending.gov/ (free, no key required)
  POST /api/v2/search/spending_by_award/
    — place_of_performance_scope: "domestic"
    — place_of_performance_state: "FL"
    — award_type_codes: ["A","B","C","D"]  (contracts only)
    — filters: date range (last 4 years), total_obligation > $10,000

Supabase tables created/upserted:
  federal_contracts       — one row per award
  federal_contract_links  — cross-reference edges (state vendor or donor)

Cache: data/raw/usaspending/<page_NNN>.json
  Resume-friendly: pages already cached are skipped.
  --force re-fetches everything.

Usage:
  python scripts/99_fetch_usaspending_contracts.py
  python scripts/99_fetch_usaspending_contracts.py --force
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

import psycopg2
import requests
from dotenv import load_dotenv
from psycopg2.extras import execute_values
from rapidfuzz import fuzz

# ── Paths & config ────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env.local")

DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set in .env.local")

CACHE_DIR   = PROJECT_ROOT / "data" / "raw" / "usaspending"
BATCH_SIZE  = 2000

# API
USA_BASE        = "https://api.usaspending.gov"
SEARCH_ENDPOINT = f"{USA_BASE}/api/v2/search/spending_by_award/"
PAGE_LIMIT      = 100      # USASpending max is 100 per request
REQUEST_DELAY   = 1.0      # polite throttle
MIN_OBLIGATION  = 10_000   # skip micro-awards
FUZZY_THRESHOLD = 80       # rapidfuzz token_sort_ratio cutoff

# Award type codes: A=BPA Call, B=Purchase Order, C=Delivery Order, D=Definitive Contract
AWARD_TYPE_CODES = ["A", "B", "C", "D"]

FIELDS = [
    "Award ID",
    "Recipient Name",
    "Recipient UEI",
    "Award Amount",
    "Awarding Agency",
    "Awarding Sub Agency",
    "Start Date",
    "End Date",
    "Contract Award Type",
    "naics_code",
    "naics_description",
    "Description",
    "Place of Performance State Code",
]

# ── Regex helpers ─────────────────────────────────────────────────────────────

_PUNCT  = re.compile(r"[^\w\s]")
_WS     = re.compile(r"\s+")
_SUFFIX = re.compile(
    r"[,\.]?\s*(INC|LLC|CO|CORP|CORPORATION|LTD|LP|LLP|PA|PLLC|PC|DBA|THE)\.?$",
    re.IGNORECASE,
)
_SLUG_STRIP = re.compile(r"[^\w\s-]")


def normalize(name: str) -> str:
    """Uppercase, strip punctuation and common suffixes for fuzzy matching."""
    s = str(name).upper().strip()
    for _ in range(3):
        n = _SUFFIX.sub("", s).strip().rstrip(",").strip()
        if n == s:
            break
        s = n
    s = _PUNCT.sub(" ", s)
    return _WS.sub(" ", s).strip()


def slugify(name: str) -> str:
    s = str(name).lower()
    s = _SLUG_STRIP.sub("", s)
    s = _WS.sub("-", s.strip())
    return re.sub(r"-+", "-", s).strip("-")[:120]


# ── Schema ────────────────────────────────────────────────────────────────────

CREATE_FEDERAL_CONTRACTS = """
CREATE TABLE IF NOT EXISTS federal_contracts (
    id               SERIAL PRIMARY KEY,
    award_id         TEXT UNIQUE,
    recipient_name   TEXT,
    recipient_slug   TEXT,
    recipient_uei    TEXT,
    total_obligation NUMERIC(18,2),
    awarding_agency  TEXT,
    naics_code       TEXT,
    naics_description TEXT,
    period_start     DATE,
    period_end       DATE,
    description      TEXT,
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_federal_contracts_slug
    ON federal_contracts(recipient_slug);
CREATE INDEX IF NOT EXISTS idx_federal_contracts_uei
    ON federal_contracts(recipient_uei);
CREATE INDEX IF NOT EXISTS idx_federal_contracts_obligation
    ON federal_contracts(total_obligation DESC);
CREATE INDEX IF NOT EXISTS idx_federal_contracts_naics
    ON federal_contracts(naics_code);
"""

CREATE_FEDERAL_CONTRACT_LINKS = """
CREATE TABLE IF NOT EXISTS federal_contract_links (
    recipient_slug  TEXT,
    entity_slug     TEXT,
    entity_type     TEXT,          -- 'state_vendor' or 'donor'
    match_score     INTEGER,
    federal_total   NUMERIC(18,2),
    state_total     NUMERIC(18,2),
    PRIMARY KEY (recipient_slug, entity_slug)
);
CREATE INDEX IF NOT EXISTS idx_federal_contract_links_entity
    ON federal_contract_links(entity_slug);
CREATE INDEX IF NOT EXISTS idx_federal_contract_links_type
    ON federal_contract_links(entity_type);
"""


def ensure_tables(cur):
    cur.execute(CREATE_FEDERAL_CONTRACTS)
    cur.execute(CREATE_FEDERAL_CONTRACT_LINKS)


# ── USASpending fetch ─────────────────────────────────────────────────────────

def build_date_range() -> tuple[str, str]:
    end   = datetime.today()
    start = end - timedelta(days=365 * 4)
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")


def build_payload(start_date: str, end_date: str, page: int) -> dict:
    return {
        "filters": {
            "time_period": [{"start_date": start_date, "end_date": end_date}],
            "award_type_codes": AWARD_TYPE_CODES,
            "place_of_performance_scope": "domestic",
            "place_of_performance_locations": [{"country": "USA", "state": "FL"}],
        },
        "fields": FIELDS,
        "sort": "Award Amount",
        "order": "desc",
        "limit": PAGE_LIMIT,
        "page": page,
        "subawards": False,
    }


def fetch_page(session: requests.Session, page: int, start_date: str, end_date: str,
               cache_dir: Path, force: bool) -> tuple[list[dict], bool]:
    """Return (results, has_next). Uses disk cache when available."""
    cache_path = cache_dir / f"page_{page:04d}.json"

    if not force and cache_path.exists():
        data = json.loads(cache_path.read_text())
        results = data.get("results", [])
        has_next = data.get("page_metadata", {}).get("hasNext", False)
        print(f"  page {page:>4} [cached] → {len(results):,} awards", flush=True)
        return results, has_next

    payload = build_payload(start_date, end_date, page)
    for attempt in range(4):
        try:
            r = session.post(SEARCH_ENDPOINT, json=payload, timeout=60)
            if r.status_code == 429:
                wait = 30 * (attempt + 1)
                print(f"  Rate-limited — waiting {wait}s …")
                time.sleep(wait)
                continue
            r.raise_for_status()
            data = r.json()
            break
        except Exception as exc:
            print(f"  WARNING page {page} attempt {attempt+1}: {exc}")
            time.sleep(5 * (attempt + 1))
    else:
        print(f"  ERROR: page {page} failed after 4 attempts — skipping")
        return [], False

    cache_path.write_text(json.dumps(data, ensure_ascii=False))
    results = data.get("results", [])
    has_next = data.get("page_metadata", {}).get("hasNext", False)
    print(f"  page {page:>4} → {len(results):,} awards  (hasNext={has_next})",
          flush=True)
    time.sleep(REQUEST_DELAY)
    return results, has_next


def fetch_all(force: bool) -> list[dict]:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "User-Agent": "FloridaDonorTracker/1.0 (contact: public-records-tool)",
    })

    start_date, end_date = build_date_range()
    print(f"Date range: {start_date} → {end_date}")

    all_results: list[dict] = []
    page = 1
    while True:
        results, has_next = fetch_page(session, page, start_date, end_date,
                                       CACHE_DIR, force)
        all_results.extend(results)
        if not has_next:
            break
        page += 1

    return all_results


# ── Parsing ───────────────────────────────────────────────────────────────────

def parse_row(r: dict) -> dict | None:
    """Convert a raw USASpending result dict to our schema dict. Returns None to skip."""
    obligation = r.get("Award Amount") or 0
    try:
        obligation = float(obligation)
    except (TypeError, ValueError):
        obligation = 0.0

    if obligation < MIN_OBLIGATION:
        return None

    award_id   = r.get("Award ID") or ""
    recip_name = (r.get("Recipient Name") or "").strip()
    if not award_id or not recip_name:
        return None

    agency = r.get("Awarding Agency") or ""
    sub    = r.get("Awarding Sub Agency") or ""
    if sub and sub != agency:
        agency = f"{agency} / {sub}"

    return {
        "award_id":          award_id,
        "recipient_name":    recip_name,
        "recipient_slug":    slugify(recip_name),
        "recipient_uei":     (r.get("Recipient UEI") or "").strip() or None,
        "total_obligation":  obligation,
        "awarding_agency":   agency[:300] if agency else None,
        "naics_code":        (r.get("naics_code") or "").strip() or None,
        "naics_description": (r.get("naics_description") or "").strip() or None,
        "period_start":      r.get("Start Date") or None,
        "period_end":        r.get("End Date") or None,
        "description":       (r.get("Description") or "").strip()[:500] or None,
    }


# ── Load to Supabase ──────────────────────────────────────────────────────────

UPSERT_CONTRACTS = """
INSERT INTO federal_contracts
    (award_id, recipient_name, recipient_slug, recipient_uei,
     total_obligation, awarding_agency, naics_code, naics_description,
     period_start, period_end, description, updated_at)
VALUES %s
ON CONFLICT (award_id) DO UPDATE SET
    recipient_name    = EXCLUDED.recipient_name,
    recipient_slug    = EXCLUDED.recipient_slug,
    recipient_uei     = EXCLUDED.recipient_uei,
    total_obligation  = EXCLUDED.total_obligation,
    awarding_agency   = EXCLUDED.awarding_agency,
    naics_code        = EXCLUDED.naics_code,
    naics_description = EXCLUDED.naics_description,
    period_start      = EXCLUDED.period_start,
    period_end        = EXCLUDED.period_end,
    description       = EXCLUDED.description,
    updated_at        = NOW()
"""


def load_contracts(cur, rows: list[dict]) -> int:
    # Deduplicate within batch by award_id (keep highest obligation per id)
    seen: dict[str, dict] = {}
    for r in rows:
        aid = r["award_id"]
        if aid not in seen or (r["total_obligation"] or 0) > (seen[aid]["total_obligation"] or 0):
            seen[aid] = r
    deduped = list(seen.values())
    execute_values(cur, UPSERT_CONTRACTS, [
        (
            r["award_id"], r["recipient_name"], r["recipient_slug"],
            r["recipient_uei"], r["total_obligation"], r["awarding_agency"],
            r["naics_code"], r["naics_description"],
            r["period_start"], r["period_end"], r["description"],
        )
        for r in deduped
    ], page_size=BATCH_SIZE,
       template="(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())")
    return len(deduped)


# ── Cross-reference ───────────────────────────────────────────────────────────

def load_state_vendors(cur) -> list[dict]:
    """Pull vendor_name + vendor_slug + total_amount from fl_vendor_contracts."""
    try:
        cur.execute(
            "SELECT vendor_name, vendor_slug, total_amount FROM fl_vendor_contracts"
        )
        rows = cur.fetchall()
        return [
            {"name": r[0], "slug": r[1], "total": float(r[2] or 0)}
            for r in rows
        ]
    except Exception as exc:
        print(f"  WARNING: could not load fl_vendor_contracts — {exc}")
        return []


def load_donors(cur) -> list[dict]:
    """Pull corporate donors (name + slug + total_combined) from donors table."""
    try:
        cur.execute(
            "SELECT name, slug, total_combined FROM donors WHERE is_corporate = TRUE"
        )
        rows = cur.fetchall()
        return [
            {"name": r[0], "slug": r[1], "total": float(r[2] or 0)}
            for r in rows
        ]
    except Exception as exc:
        print(f"  WARNING: could not load donors — {exc}")
        return []


def build_recipient_aggregates(parsed: list[dict]) -> dict[str, dict]:
    """Aggregate total federal obligation per recipient_slug."""
    agg: dict[str, dict] = {}
    for r in parsed:
        slug = r["recipient_slug"]
        if slug not in agg:
            agg[slug] = {
                "slug": slug,
                "name": r["recipient_name"],
                "norm": normalize(r["recipient_name"]),
                "federal_total": 0.0,
            }
        agg[slug]["federal_total"] += r["total_obligation"]
    return agg


def cross_reference(recipient_agg: dict[str, dict],
                    entities: list[dict],
                    entity_type: str) -> list[dict]:
    """
    Fuzzy-match recipients against entities (state vendors or donors).
    Returns list of link dicts.
    """
    links: list[dict] = []
    seen: set[tuple[str, str]] = set()

    for ent in entities:
        ent_norm = normalize(ent["name"])
        if len(ent_norm) < 4:
            continue

        for recip_slug, recip in recipient_agg.items():
            recip_norm = recip["norm"]
            if len(recip_norm) < 4:
                continue

            score = fuzz.token_sort_ratio(ent_norm, recip_norm)
            if score < FUZZY_THRESHOLD:
                continue

            key = (recip_slug, ent["slug"])
            if key in seen:
                continue
            seen.add(key)

            links.append({
                "recipient_slug": recip_slug,
                "entity_slug":    ent["slug"],
                "entity_type":    entity_type,
                "match_score":    score,
                "federal_total":  recip["federal_total"],
                "state_total":    ent["total"],
            })

    return links


UPSERT_LINKS = """
INSERT INTO federal_contract_links
    (recipient_slug, entity_slug, entity_type, match_score, federal_total, state_total)
VALUES %s
ON CONFLICT (recipient_slug, entity_slug) DO UPDATE SET
    match_score   = EXCLUDED.match_score,
    federal_total = EXCLUDED.federal_total,
    state_total   = EXCLUDED.state_total
"""


def load_links(cur, links: list[dict]) -> int:
    if not links:
        return 0
    execute_values(cur, UPSERT_LINKS, [
        (l["recipient_slug"], l["entity_slug"], l["entity_type"],
         l["match_score"], l["federal_total"], l["state_total"])
        for l in links
    ], page_size=BATCH_SIZE)
    return len(links)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fetch FL federal contracts from USASpending.gov and load to Supabase."
    )
    parser.add_argument("--force", action="store_true",
                        help="Re-fetch all pages (ignore cache)")
    args = parser.parse_args()

    print("=== Script 99: USASpending FL Federal Contracts ===\n")

    # ── 1. Fetch from API ──────────────────────────────────────────────────────
    print("1. Fetching from USASpending.gov …")
    raw_results = fetch_all(force=args.force)
    print(f"   → {len(raw_results):,} raw awards retrieved\n")

    # ── 2. Parse + filter ─────────────────────────────────────────────────────
    print("2. Parsing and filtering …")
    parsed: list[dict] = []
    skipped = 0
    for r in raw_results:
        row = parse_row(r)
        if row:
            parsed.append(row)
        else:
            skipped += 1

    total_obligation = sum(r["total_obligation"] for r in parsed)
    print(f"   → {len(parsed):,} contracts kept  (skipped {skipped:,})")
    print(f"   → ${total_obligation:,.0f} total obligation\n")

    # ── 3. Load to Supabase ───────────────────────────────────────────────────
    print("3. Loading to Supabase …")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    ensure_tables(cur)
    conn.commit()

    # Upsert in batches
    total_upserted = 0
    for i in range(0, len(parsed), BATCH_SIZE):
        batch = parsed[i : i + BATCH_SIZE]
        total_upserted += load_contracts(cur, batch)
        conn.commit()
        print(f"   upserted {total_upserted:,}/{len(parsed):,} …", flush=True)

    print(f"   → {total_upserted:,} contracts upserted to federal_contracts\n")

    # ── 4. Cross-reference ────────────────────────────────────────────────────
    print("4. Cross-referencing recipients …")

    recipient_agg = build_recipient_aggregates(parsed)
    print(f"   {len(recipient_agg):,} unique recipients")

    state_vendors = load_state_vendors(cur)
    print(f"   {len(state_vendors):,} state vendors loaded (fl_vendor_contracts)")

    donors = load_donors(cur)
    print(f"   {len(donors):,} corporate donors loaded")

    vendor_links = cross_reference(recipient_agg, state_vendors, "state_vendor")
    donor_links  = cross_reference(recipient_agg, donors, "donor")
    all_links    = vendor_links + donor_links

    print(f"   → {len(vendor_links):,} state_vendor matches")
    print(f"   → {len(donor_links):,} donor matches")
    print(f"   → {len(all_links):,} total cross-reference edges\n")

    n_links = load_links(cur, all_links)
    conn.commit()
    print(f"   {n_links:,} edges upserted to federal_contract_links\n")

    cur.close()
    conn.close()

    # ── 5. Summary ────────────────────────────────────────────────────────────
    print("=== Summary ===")
    print(f"  Contracts fetched:        {len(parsed):,}")
    print(f"  Total obligation:         ${total_obligation:>20,.2f}")
    print(f"  Unique recipients:        {len(recipient_agg):,}")
    print(f"  State vendor matches:     {len(vendor_links):,}")
    print(f"  Donor matches:            {len(donor_links):,}")
    print(f"  Cross-reference edges:    {len(all_links):,}")
    print(f"  Cache directory:          {CACHE_DIR}")
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
