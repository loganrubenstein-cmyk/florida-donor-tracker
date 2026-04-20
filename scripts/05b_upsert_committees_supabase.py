"""
Script 05b: Upsert registry committees into Supabase.

Reads data/processed/committees.csv (written by 05_import_registry.py) and
performs an ON CONFLICT upsert into the committees table. Designed for the
daily-new-committees workflow to discover newly-registered or newly-closed
committees without requiring the full public/data/ JSON cache that script 40
depends on.

Only touches (acct_num, committee_name) — financial totals are maintained by
scripts 09 / 25 / 40 during the full quarterly rebuild.

Usage:
    .venv/bin/python scripts/05b_upsert_committees_supabase.py
"""

import csv
import os
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")

DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set")

CSV_PATH = ROOT / "data" / "processed" / "committees.csv"


def main() -> int:
    if not CSV_PATH.exists():
        print(f"ERROR: {CSV_PATH} not found. Run 05_import_registry.py first.", file=sys.stderr)
        return 1

    rows = []
    with open(CSV_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            acct = (r.get("acct_num") or "").strip()
            name = (r.get("committee_name") or "").strip()
            if acct and name:
                rows.append((acct, name))

    print(f"=== Script 05b: Upsert {len(rows):,} committees from registry ===")

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    before = {}
    cur.execute("SELECT COUNT(*) FROM committees")
    before["total"] = cur.fetchone()[0]

    execute_values(cur, """
        INSERT INTO committees (acct_num, committee_name)
        VALUES %s
        ON CONFLICT (acct_num) DO UPDATE
          SET committee_name = EXCLUDED.committee_name,
              updated_at     = now()
          WHERE committees.committee_name IS DISTINCT FROM EXCLUDED.committee_name
    """, rows, page_size=1000)

    conn.commit()

    cur.execute("SELECT COUNT(*) FROM committees")
    after = cur.fetchone()[0]

    print(f"  Before: {before['total']:>7,}  After: {after:>7,}  Δ {after - before['total']:+,}")
    print("  (Name changes detected via WHERE IS DISTINCT — rowcount not shown)")

    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
