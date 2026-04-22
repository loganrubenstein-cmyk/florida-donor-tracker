"""
Script 99: Scrape bill titles, statuses, and sponsors for all FL bills in bill_disclosures.

Strategy: scrape flsenate.gov session-level paginated bill indexes (both chambers) rather
than individual bill pages. ~50 bills/page × ~20 pages × 2 chambers × 10 years = ~2,000
requests total vs 29,000 individual scrapes.

Creates table: bill_info (bill_slug, year, title, status, last_action, primary_sponsor)

Usage:
    .venv/bin/python scripts/99_scrape_bill_info.py
    .venv/bin/python scripts/99_scrape_bill_info.py --year 2024     # single year
    .venv/bin/python scripts/99_scrape_bill_info.py --load-only     # skip scraping, just upsert cache
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

import psycopg2
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")

DB_URL = os.getenv("SUPABASE_DB_URL")
CACHE_DIR = ROOT / "data" / "raw" / "bill_info"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

BASE_URL = "https://www.flsenate.gov/Session/Bills/{year}"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
YEARS = list(range(2017, 2027))
CHAMBERS = ["senate", "house"]
DELAY = 0.8  # seconds between requests


# ── Status normalization ───────────────────────────────────────────────────────

STATUS_MAP = [
    (re.compile(r'\bSigned by Governor\b', re.I),          'Signed'),
    (re.compile(r'\bVetoed by Governor\b', re.I),          'Vetoed'),
    (re.compile(r'\bChapter\b', re.I),                     'Signed'),
    (re.compile(r'\bEnrolled\b', re.I),                    'Enrolled'),
    (re.compile(r'\bPassed\b', re.I),                      'Passed'),
    (re.compile(r'\bAdopted\b', re.I),                     'Adopted'),
    (re.compile(r'\bDied\b', re.I),                        'Died'),
    (re.compile(r'\bWithdrawn\b', re.I),                   'Withdrawn'),
    (re.compile(r'\bIndefinitely Postponed\b', re.I),      'Died'),
    (re.compile(r'\bTabled\b', re.I),                      'Tabled'),
    (re.compile(r'\bReferred\b', re.I),                    'In Committee'),
    (re.compile(r'\bFiled\b', re.I),                       'Filed'),
]

def normalize_status(last_action: str) -> str:
    for pattern, label in STATUS_MAP:
        if pattern.search(last_action):
            return label
    return 'Unknown'


def slug_from_bill_number(bill_num: str) -> str | None:
    """'SB 370' → 'sb-370',  'HB 5001' → 'hb-5001'"""
    m = re.match(r'^(HB|SB)\s+(\d+)', bill_num.strip(), re.I)
    if not m:
        return None
    prefix = 'hb' if m.group(1).upper() == 'HB' else 'sb'
    return f"{prefix}-{int(m.group(2))}"


# ── Scraping ───────────────────────────────────────────────────────────────────

def scrape_session(year: int, chamber: str) -> list[dict]:
    """Scrape all bills for a session/chamber from flsenate.gov."""
    cache_file = CACHE_DIR / f"{year}_{chamber}.json"
    if cache_file.exists():
        bills = json.loads(cache_file.read_text())
        print(f"  {year} {chamber}: loaded {len(bills):,} bills from cache")
        return bills

    print(f"  {year} {chamber}: scraping...", end="", flush=True)
    bills = []
    page = 1

    while True:
        url = (
            f"{BASE_URL.format(year=year)}"
            f"?LegislativeSessionTitle={year}"
            f"&Chamber={chamber}"
            f"&SearchOnlyCurrentVersion=True"
            f"&IsIncludeAmendments=False"
            f"&IsFirstReference=True"
            f"&HasInputError=False"
            f"&PageNumber={page}"
            f"&ExpandedView=False"
        )
        try:
            r = requests.get(url, headers=HEADERS, timeout=20)
            r.raise_for_status()
        except Exception as e:
            print(f"\n    ERROR page {page}: {e}")
            break

        soup = BeautifulSoup(r.text, 'html.parser')
        rows = soup.find_all('tr')
        data_rows = [row for row in rows if row.find('td')]

        if not data_rows:
            break

        for row in data_rows:
            cells = row.find_all('td')
            links = row.find_all('a', href=lambda h: h and '/Session/Bill/' in str(h))
            if not links or not cells:
                continue

            bill_num = links[0].get_text(strip=True)
            slug = slug_from_bill_number(bill_num)
            if not slug:
                continue

            title       = cells[0].get_text(strip=True) if cells else ''
            sponsor     = cells[1].get_text(strip=True) if len(cells) > 1 else ''
            last_action = cells[2].get_text(strip=True) if len(cells) > 2 else ''

            # Strip "Last Action: DATE " prefix from last_action
            last_action = re.sub(r'^Last Action:\s*\d+/\d+/\d+\s+', '', last_action).strip()

            bills.append({
                'bill_slug':       slug,
                'year':            year,
                'bill_canon':      bill_num,
                'title':           title,
                'primary_sponsor': sponsor,
                'last_action':     last_action,
                'status':          normalize_status(last_action),
            })

        # Check for next page
        page_links = soup.find_all('a', href=lambda h: h and 'PageNumber=' in str(h))
        page_nums = [
            int(m.group(1))
            for a in page_links
            if (m := re.search(r'PageNumber=(\d+)', a['href']))
        ]
        if not page_nums or page >= max(page_nums, default=0):
            break

        page += 1
        time.sleep(DELAY)

    print(f" {len(bills):,} bills (pg {page})")
    cache_file.write_text(json.dumps(bills, ensure_ascii=False))
    return bills


# ── DB operations ──────────────────────────────────────────────────────────────

def ensure_table(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS bill_info (
            id               SERIAL PRIMARY KEY,
            bill_slug        TEXT NOT NULL,
            year             INTEGER NOT NULL,
            bill_canon       TEXT,
            title            TEXT,
            status           TEXT,
            last_action      TEXT,
            primary_sponsor  TEXT,
            UNIQUE(bill_slug, year)
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS bi_slug_idx ON bill_info (bill_slug)")
    cur.execute("CREATE INDEX IF NOT EXISTS bi_year_idx ON bill_info (year)")
    cur.execute("GRANT SELECT ON bill_info TO anon, authenticated")


def upsert_bills(cur, bills: list[dict]) -> int:
    if not bills:
        return 0
    from io import StringIO
    buf = StringIO()
    for b in bills:
        row = "\t".join([
            b['bill_slug'],
            str(b['year']),
            (b['bill_canon'] or '').replace('\t',' ').replace('\n',' '),
            (b['title'] or '')[:500].replace('\t',' ').replace('\n',' '),
            (b['status'] or '').replace('\t',' '),
            (b['last_action'] or '')[:500].replace('\t',' ').replace('\n',' '),
            (b['primary_sponsor'] or '').replace('\t',' ').replace('\n',' '),
        ])
        buf.write(row + "\n")
    buf.seek(0)

    cur.execute("""
        CREATE TEMP TABLE bill_info_staging (
            bill_slug TEXT, year INTEGER, bill_canon TEXT,
            title TEXT, status TEXT, last_action TEXT, primary_sponsor TEXT
        ) ON COMMIT DROP
    """)
    cur.copy_from(buf, 'bill_info_staging', columns=[
        'bill_slug','year','bill_canon','title','status','last_action','primary_sponsor'
    ])
    cur.execute("""
        INSERT INTO bill_info (bill_slug, year, bill_canon, title, status, last_action, primary_sponsor)
        SELECT bill_slug, year, bill_canon, title, status, last_action, primary_sponsor
        FROM bill_info_staging
        ON CONFLICT (bill_slug, year) DO UPDATE SET
            bill_canon       = EXCLUDED.bill_canon,
            title            = EXCLUDED.title,
            status           = EXCLUDED.status,
            last_action      = EXCLUDED.last_action,
            primary_sponsor  = EXCLUDED.primary_sponsor
    """)
    cur.execute("SELECT COUNT(*) FROM bill_info_staging")
    return cur.fetchone()[0]


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--year', type=int, help='Scrape only this year')
    parser.add_argument('--load-only', action='store_true', help='Skip scraping, upsert from cache')
    args = parser.parse_args()

    years = [args.year] if args.year else YEARS

    print("=== Script 99: Scrape Bill Info (FL Senate + House) ===\n")

    # Phase 1: Scrape / load from cache
    all_bills: list[dict] = []
    print("Phase 1: Collecting session bill indexes")
    for year in years:
        for chamber in CHAMBERS:
            if args.load_only:
                cache_file = CACHE_DIR / f"{year}_{chamber}.json"
                if cache_file.exists():
                    bills = json.loads(cache_file.read_text())
                    print(f"  {year} {chamber}: {len(bills):,} from cache")
                    all_bills.extend(bills)
                else:
                    print(f"  {year} {chamber}: no cache — skipping")
            else:
                bills = scrape_session(year, chamber)
                all_bills.extend(bills)
                time.sleep(DELAY)

    print(f"\nTotal collected: {len(all_bills):,} bill records")

    # Deduplicate (prefer senate-side entry if both chambers have same slug+year)
    seen = {}
    for b in all_bills:
        key = (b['bill_slug'], b['year'])
        if key not in seen or b['bill_slug'].startswith('sb-'):
            seen[key] = b
    deduped = list(seen.values())
    print(f"After dedup: {len(deduped):,} unique (slug, year) entries")

    # Phase 2: Load into Supabase
    print("\nPhase 2: Upserting to bill_info table")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute("SET statement_timeout = 0")

    ensure_table(cur)
    conn.commit()

    # Upsert in chunks
    CHUNK = 2000
    total_upserted = 0
    for i in range(0, len(deduped), CHUNK):
        chunk = deduped[i:i+CHUNK]
        n = upsert_bills(cur, chunk)
        conn.commit()
        total_upserted += n
        print(f"  Upserted chunk {i//CHUNK + 1}: {n:,} rows ({i+len(chunk):,}/{len(deduped):,} total)")

    # Sanity checks
    print("\n--- Sanity Checks ---")
    cur.execute("SELECT COUNT(*) FROM bill_info")
    print(f"Total bill_info rows: {cur.fetchone()[0]:,}")

    cur.execute("SELECT year, COUNT(*), SUM(CASE WHEN status='Signed' THEN 1 ELSE 0 END) FROM bill_info GROUP BY year ORDER BY year")
    print(f"\n{'Year':<6} {'Bills':>7} {'Signed':>8}")
    print("-" * 25)
    for r in cur.fetchall():
        print(f"{r[0]:<6} {r[1]:>7,} {r[2]:>8,}")

    # Coverage vs bill_disclosures
    cur.execute("""
        SELECT COUNT(DISTINCT bd.bill_slug || '__' || bd.year::text) as disc_total,
               COUNT(DISTINCT CASE WHEN bi.bill_slug IS NOT NULL
                    THEN bd.bill_slug || '__' || bd.year::text END) as have_info
        FROM bill_disclosures bd
        LEFT JOIN bill_info bi ON bi.bill_slug = bd.bill_slug AND bi.year = bd.year
    """)
    r = cur.fetchone()
    pct = r[1]/r[0]*100 if r[0] else 0
    print(f"\nbill_disclosures coverage: {r[1]:,}/{r[0]:,} ({pct:.1f}%) have title")

    cur.close()
    conn.close()
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
