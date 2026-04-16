#!/usr/bin/env python3
"""
pre_truncate_40.py

Truncates all tables that script 40_load_supabase.py will reload, one at a time.
Must be run before 40_load_supabase.py.

pgbouncer times out on the single multi-table TRUNCATE in script 40. This script
issues individual TRUNCATEs in separate transactions, each within the timeout window.

Usage:
    .venv/bin/python scripts/pre_truncate_40.py
"""

import sys
from pathlib import Path
import psycopg2

ROOT   = Path(__file__).resolve().parent.parent
DOTENV = ROOT / ".env.local"

def load_db_url() -> str:
    for line in DOTENV.read_text().splitlines():
        if line.startswith("SUPABASE_DB_URL="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError("SUPABASE_DB_URL not found in .env.local")

TABLES = [
    "donors",
    "donor_committees",
    "donor_candidates",
    "donor_by_year",
    "candidates",
    "candidate_quarterly",
    "candidate_top_donors",
    "committees",
    "committee_top_donors",
    "lobbyists",
    "lobbyist_principals",
    "principals",
    "principal_lobbyists",
    "principal_donation_matches",
    "industry_buckets",
    "industry_by_committee",
    "industry_trends",
    "entity_connections",
    "candidate_pc_links",
    "cycle_donors",
]

def main() -> int:
    db_url = load_db_url()
    conn = psycopg2.connect(db_url, connect_timeout=15)
    conn.autocommit = True

    print("Truncating tables one at a time (pgbouncer-safe)...")
    for table in TABLES:
        try:
            with conn.cursor() as cur:
                cur.execute(f"TRUNCATE TABLE {table} RESTART IDENTITY")
            print(f"  ✓ {table}")
        except Exception as e:
            print(f"  ✗ {table}: {e}")

    conn.close()
    print("\nDone. Now run: .venv/bin/python -u scripts/40_load_supabase.py")
    return 0

if __name__ == "__main__":
    sys.exit(main())
