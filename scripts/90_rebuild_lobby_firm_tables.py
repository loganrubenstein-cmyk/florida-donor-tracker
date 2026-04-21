"""
Script 90: Rebuild lobbying_firms + lobbying_firm_quarters from full comp history.

The existing tables only cover 2024-2026 (8 quarters, script 70).
This rebuilds them using lobbyist_comp_detail (2007-2026, 155 quarters).

Also rebuilds lobbying_firm_clients with full history.

Usage:
    .venv/bin/python scripts/90_rebuild_lobby_firm_tables.py
"""

import os
import re
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")

DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set in .env.local")

QUARTER_LABELS = {1: "Jan–Mar", 2: "Apr–Jun", 3: "Jul–Sep", 4: "Oct–Dec"}

# Legal-suffix suffixes stripped before slug comparison so punctuation
# variants ("Colodny Fass" vs "Colodny Fass, P.A.") share the same slug.
_LEGAL_SUFFIXES = r'\s*,?\s*(P\.?A\.?|P\.?L\.?|P\.?L\.?L\.?C\.?|L\.?L\.?C\.?|Inc\.?|Incorporated|Corp\.?|Corporation)\s*$'

# SQL expression: normalizes firm_name → comparable slug
# 1. strip trailing legal suffixes (case-insensitive)
# 2. strip all dots
# 3. replace non-alphanum runs with '-'
# 4. trim leading/trailing '-'
_FIRM_SLUG_EXPR = (
    "TRIM('-' FROM LOWER(REGEXP_REPLACE("
    "REGEXP_REPLACE("
    "REGEXP_REPLACE(TRIM({col}), '{suf}', '', 'gi'),"
    "'\\.', '', 'g'),"
    "'[^a-zA-Z0-9]+', '-', 'g')))"
).format(col="{col}", suf=_LEGAL_SUFFIXES.replace("'", "''"))


def _slug_expr(col: str) -> str:
    """Return a SQL slug expression for the given column reference."""
    return _FIRM_SLUG_EXPR.replace("{col}", col)


def slugify(s: str) -> str:
    s = s.strip()
    s = re.sub(_LEGAL_SUFFIXES, '', s, flags=re.IGNORECASE)
    s = re.sub(r'\.', '', s)
    s = re.sub(r'[^a-z0-9]+', '-', s.lower())
    return s.strip('-')[:120]


def main() -> int:
    print("=== Script 90: Rebuild Lobby Firm Tables (Full History) ===\n")

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("SET statement_timeout = 0")

    # Verify source
    cur.execute("SELECT COUNT(*), MIN(year), MAX(year) FROM lobbyist_comp_detail WHERE year > 0")
    total, min_y, max_y = cur.fetchone()
    if total == 0:
        print("lobbyist_comp_detail is empty — run script 88 first.")
        return 1
    print(f"Source: {total:,} comp detail rows, {min_y}–{max_y}")

    # ── 1. Rebuild lobbying_firms ─────────────────────────────────────────────
    print("\n1. Rebuilding lobbying_firms...")
    cur.execute("DROP TABLE IF EXISTS lobbying_firms CASCADE")
    cur.execute("""
        CREATE TABLE lobbying_firms (
            id SERIAL PRIMARY KEY,
            slug TEXT UNIQUE,
            firm_name TEXT,
            total_comp NUMERIC(14,2) DEFAULT 0,
            num_principals INTEGER DEFAULT 0,
            num_quarters INTEGER DEFAULT 0,
            first_year SMALLINT,
            last_year SMALLINT,
            num_years SMALLINT DEFAULT 0
        )
    """)
    cur.execute(f"""
        WITH deduped AS (
            SELECT DISTINCT ON (firm_name, principal_name, quarter, year, branch)
                firm_name, principal_name, comp_midpoint, quarter, year, branch
            FROM lobbyist_comp_detail
            WHERE firm_name != '' AND year > 0
            ORDER BY firm_name, principal_name, quarter, year, branch
        ),
        firm_agg AS (
            SELECT
                {_slug_expr('firm_name')} AS slug,
                firm_name,
                SUM(comp_midpoint) AS total_comp,
                COUNT(DISTINCT principal_name) AS num_principals,
                COUNT(DISTINCT (year * 10 + quarter)) AS num_quarters,
                MIN(year) AS first_year,
                MAX(year) AS last_year,
                COUNT(DISTINCT year) AS num_years
            FROM deduped
            GROUP BY firm_name
        ),
        slug_merged AS (
            SELECT
                slug,
                (ARRAY_AGG(firm_name ORDER BY total_comp DESC))[1] AS firm_name,
                SUM(total_comp) AS total_comp,
                SUM(num_principals) AS num_principals,
                MAX(num_quarters) AS num_quarters,
                MIN(first_year) AS first_year,
                MAX(last_year) AS last_year,
                MAX(num_years) AS num_years
            FROM firm_agg
            GROUP BY slug
        )
        INSERT INTO lobbying_firms (slug, firm_name, total_comp, num_principals, num_quarters, first_year, last_year, num_years)
        SELECT slug, firm_name, total_comp, num_principals, num_quarters, first_year, last_year, num_years
        FROM slug_merged
        ORDER BY total_comp DESC
    """)
    cur.execute("SELECT COUNT(*), SUM(total_comp) FROM lobbying_firms")
    r = cur.fetchone()
    print(f"   {r[0]:,} firms, ${float(r[1] or 0):,.0f} total comp")

    # ── 2. Rebuild lobbying_firm_quarters ─────────────────────────────────────
    print("2. Rebuilding lobbying_firm_quarters...")
    cur.execute("DROP TABLE IF EXISTS lobbying_firm_quarters CASCADE")
    cur.execute("""
        CREATE TABLE lobbying_firm_quarters (
            id SERIAL PRIMARY KEY,
            firm_slug TEXT,
            year SMALLINT,
            quarter SMALLINT,
            period TEXT,
            branch TEXT,
            total_comp NUMERIC(14,2) DEFAULT 0
        )
    """)
    cur.execute(f"""
        INSERT INTO lobbying_firm_quarters (firm_slug, year, quarter, period, branch, total_comp)
        SELECT
            {_slug_expr('firm_name')},
            year,
            quarter,
            year || ' Q' || quarter,
            branch,
            SUM(comp_midpoint)
        FROM (
            SELECT DISTINCT ON (firm_name, principal_name, quarter, year, branch)
                firm_name, principal_name, comp_midpoint, quarter, year, branch
            FROM lobbyist_comp_detail
            WHERE firm_name != '' AND year > 0
            ORDER BY firm_name, principal_name, quarter, year, branch
        ) deduped
        GROUP BY firm_name, year, quarter, branch
        ORDER BY firm_name, year DESC, quarter DESC
    """)
    cur.execute("SELECT COUNT(*) FROM lobbying_firm_quarters")
    print(f"   {cur.fetchone()[0]:,} rows")
    cur.execute("CREATE INDEX lfq_firm_slug_idx ON lobbying_firm_quarters (firm_slug)")
    cur.execute("CREATE INDEX lfq_year_q_idx ON lobbying_firm_quarters (year, quarter)")

    # ── 3. Rebuild lobbying_firm_clients ──────────────────────────────────────
    print("3. Rebuilding lobbying_firm_clients...")
    cur.execute("DROP TABLE IF EXISTS lobbying_firm_clients CASCADE")
    cur.execute("""
        CREATE TABLE lobbying_firm_clients (
            id SERIAL PRIMARY KEY,
            firm_slug TEXT,
            principal_name TEXT,
            principal_slug TEXT,
            total_comp NUMERIC(14,2) DEFAULT 0,
            first_year SMALLINT,
            last_year SMALLINT
        )
    """)
    cur.execute(f"""
        INSERT INTO lobbying_firm_clients (firm_slug, principal_name, principal_slug, total_comp, first_year, last_year)
        SELECT
            {_slug_expr('firm_name')},
            principal_name,
            {_slug_expr('principal_name')},
            SUM(comp_midpoint),
            MIN(year),
            MAX(year)
        FROM (
            SELECT DISTINCT ON (firm_name, principal_name, quarter, year, branch)
                firm_name, principal_name, comp_midpoint, quarter, year, branch
            FROM lobbyist_comp_detail
            WHERE firm_name != '' AND principal_name != '' AND year > 0
            ORDER BY firm_name, principal_name, quarter, year, branch
        ) deduped
        GROUP BY firm_name, principal_name
        ORDER BY firm_name, SUM(comp_midpoint) DESC
    """)
    cur.execute("SELECT COUNT(*) FROM lobbying_firm_clients")
    print(f"   {cur.fetchone()[0]:,} rows")
    cur.execute("CREATE INDEX lfc_firm_slug_idx ON lobbying_firm_clients (firm_slug)")
    cur.execute("CREATE INDEX lfc_principal_slug_idx ON lobbying_firm_clients (principal_slug)")

    # ── Sanity checks ─────────────────────────────────────────────────────────
    print("\n--- Sanity Checks ---")

    cur.execute("""
        SELECT firm_name, total_comp, num_principals, first_year, last_year
        FROM lobbying_firms ORDER BY total_comp DESC LIMIT 10
    """)
    print("\nTop 10 lobbying firms (all-time):")
    for r in cur.fetchall():
        print(f"  {r[0][:45]:<45s} ${float(r[1]):>14,.0f}  {r[3]:,} principals  {r[3]}–{r[4]}")

    cur.execute("""
        SELECT COUNT(*), SUM(total_comp), MIN(first_year), MAX(last_year)
        FROM lobbying_firms
    """)
    r = cur.fetchone()
    print(f"\nTotals: {r[0]:,} firms, ${float(r[1] or 0):,.0f}, {r[2]}–{r[3]}")

    conn.close()
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
