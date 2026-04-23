"""
Script 91: Rebuild lobbyist_principal_comp from full comp history.

The existing table only covers 2024-2026 (script 70).
This rebuilds it from lobbyist_comp_detail (2007-2026).

The table is used by loadPrincipal.js for quarterly comp trend charts.

Usage:
    .venv/bin/python scripts/91_rebuild_principal_comp.py
"""

import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")

DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set in .env.local")


def main() -> int:
    print("=== Script 91: Rebuild Principal Comp (Full History) ===\n")

    conn = psycopg2.connect(
        DB_URL,
        keepalives=1, keepalives_idle=30,
        keepalives_interval=10, keepalives_count=5,
    )
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("SET statement_timeout = 0")

    # Verify source
    cur.execute("SELECT COUNT(*) FROM lobbyist_comp_detail WHERE year > 0")
    total = cur.fetchone()[0]
    if total == 0:
        print("lobbyist_comp_detail is empty — run script 88 first.")
        return 1
    print(f"Source: {total:,} comp detail rows")

    # Check existing table shape
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'lobbyist_principal_comp' ORDER BY ordinal_position")
    existing_cols = [r[0] for r in cur.fetchall()]
    print(f"Existing columns: {existing_cols}")

    # Rebuild: aggregate comp_detail by principal (slug) + year + quarter + branch
    # Must match the principal_slug format used in principals table
    print("\nRebuilding lobbyist_principal_comp...")
    cur.execute("DELETE FROM lobbyist_principal_comp")
    cur.execute("""
        INSERT INTO lobbyist_principal_comp (principal_slug, principal_name, year, quarter, branch, total_comp)
        SELECT
            LOWER(REGEXP_REPLACE(TRIM(principal_name), '[^a-zA-Z0-9]+', '-', 'g')),
            principal_name,
            year,
            quarter,
            branch,
            SUM(comp_midpoint)
        FROM (
            SELECT DISTINCT ON (firm_name, principal_name, quarter, year, branch)
                firm_name, principal_name, comp_midpoint, quarter, year, branch
            FROM lobbyist_comp_detail
            WHERE year > 0 AND principal_name != ''
            ORDER BY firm_name, principal_name, quarter, year, branch
        ) deduped
        GROUP BY principal_name, year, quarter, branch
        ORDER BY principal_name, year, quarter
    """)
    cur.execute("SELECT COUNT(*) FROM lobbyist_principal_comp")
    new_count = cur.fetchone()[0]
    print(f"   {new_count:,} rows (was 45,616)")

    # Sanity checks
    cur.execute("SELECT MIN(year), MAX(year) FROM lobbyist_principal_comp")
    r = cur.fetchone()
    print(f"   Year range: {r[0]}–{r[1]}")

    cur.execute("""
        SELECT principal_name, SUM(total_comp) AS total
        FROM lobbyist_principal_comp
        GROUP BY principal_name ORDER BY total DESC LIMIT 5
    """)
    print("\nTop 5 principals by all-time comp:")
    for r in cur.fetchall():
        print(f"  {r[0][:50]:<50s} ${float(r[1]):>14,.0f}")

    cur.execute("SELECT COUNT(DISTINCT principal_slug) FROM lobbyist_principal_comp")
    print(f"\n   Unique principals: {cur.fetchone()[0]:,}")

    conn.close()
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
