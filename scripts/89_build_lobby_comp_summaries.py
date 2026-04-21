"""
Script 89: Build lobbying compensation summary tables from lobbyist_comp_detail.

Creates pre-aggregated tables for frontend pages:
  lobby_firm_annual       — per firm per year: total comp, principals, lobbyists
  lobby_principal_annual  — per principal per year: total comp both branches, firms
  lobby_firm_top_lobbyists — per firm: top lobbyists ranked by comp
  lobby_lobbyist_annual   — per lobbyist per year: total comp, principals, firms

Depends on: lobbyist_comp_detail (script 88)

Usage:
    .venv/bin/python scripts/89_build_lobby_comp_summaries.py
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
    print("=== Script 89: Build Lobby Comp Summaries ===\n")

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("SET statement_timeout = 0")

    # Verify source table exists and has data
    cur.execute("SELECT COUNT(*) FROM lobbyist_comp_detail")
    total = cur.fetchone()[0]
    if total == 0:
        print("lobbyist_comp_detail is empty — run script 88 first.")
        return 1
    print(f"Source: lobbyist_comp_detail has {total:,} rows")

    # ── 1. lobby_firm_annual ──────────────────────────────────────────────────
    # Deduplicate to one row per (firm, principal, quarter, branch) before summing
    # so that multiple lobbyists at the same firm don't multiply the firm-level amount.
    print("\n1. Building lobby_firm_annual...")
    cur.execute("DROP TABLE IF EXISTS lobby_firm_annual")
    cur.execute("""
        CREATE TABLE lobby_firm_annual AS
        WITH deduped AS (
            SELECT DISTINCT ON (firm_name, principal_name, quarter, year, branch)
                firm_name, principal_name, lobbyist_name, comp_midpoint, quarter, year, branch
            FROM lobbyist_comp_detail
            WHERE year > 0
            ORDER BY firm_name, principal_name, quarter, year, branch
        )
        SELECT
            firm_name,
            year,
            SUM(comp_midpoint) AS total_comp,
            COUNT(DISTINCT principal_name) AS num_principals,
            COUNT(DISTINCT lobbyist_name) FILTER (WHERE lobbyist_name != '') AS num_lobbyists,
            COUNT(*) AS num_records
        FROM deduped
        GROUP BY firm_name, year
        ORDER BY firm_name, year
    """)
    cur.execute("SELECT COUNT(*) FROM lobby_firm_annual")
    print(f"   {cur.fetchone()[0]:,} rows")
    cur.execute("CREATE INDEX lfa_firm_idx ON lobby_firm_annual (firm_name)")
    cur.execute("CREATE INDEX lfa_year_idx ON lobby_firm_annual (year)")

    # ── 2. lobby_principal_annual ─────────────────────────────────────────────
    print("2. Building lobby_principal_annual...")
    cur.execute("DROP TABLE IF EXISTS lobby_principal_annual")
    cur.execute("""
        CREATE TABLE lobby_principal_annual AS
        WITH deduped AS (
            SELECT DISTINCT ON (firm_name, principal_name, quarter, year, branch)
                firm_name, principal_name, lobbyist_name, comp_midpoint, quarter, year, branch
            FROM lobbyist_comp_detail
            WHERE year > 0
            ORDER BY firm_name, principal_name, quarter, year, branch
        )
        SELECT
            principal_name,
            year,
            SUM(comp_midpoint) AS total_comp,
            SUM(comp_midpoint) FILTER (WHERE branch = 'legislative') AS leg_comp,
            SUM(comp_midpoint) FILTER (WHERE branch = 'executive') AS exec_comp,
            COUNT(DISTINCT firm_name) AS num_firms,
            COUNT(DISTINCT lobbyist_name) FILTER (WHERE lobbyist_name != '') AS num_lobbyists,
            COUNT(*) AS num_records
        FROM deduped
        GROUP BY principal_name, year
        ORDER BY principal_name, year
    """)
    cur.execute("SELECT COUNT(*) FROM lobby_principal_annual")
    print(f"   {cur.fetchone()[0]:,} rows")
    cur.execute("CREATE INDEX lpa_principal_idx ON lobby_principal_annual (principal_name)")
    cur.execute("CREATE INDEX lpa_year_idx ON lobby_principal_annual (year)")

    # ── 3. lobby_firm_top_lobbyists ───────────────────────────────────────────
    print("3. Building lobby_firm_top_lobbyists...")
    cur.execute("DROP TABLE IF EXISTS lobby_firm_top_lobbyists")
    cur.execute("""
        CREATE TABLE lobby_firm_top_lobbyists AS
        SELECT
            firm_name,
            lobbyist_name,
            SUM(comp_midpoint) AS total_comp,
            COUNT(DISTINCT principal_name) AS num_principals,
            MIN(year) AS first_year,
            MAX(year) AS last_year,
            COUNT(DISTINCT year) AS num_years
        FROM lobbyist_comp_detail
        WHERE lobbyist_name != '' AND year > 0
        GROUP BY firm_name, lobbyist_name
        ORDER BY firm_name, total_comp DESC
    """)
    cur.execute("SELECT COUNT(*) FROM lobby_firm_top_lobbyists")
    print(f"   {cur.fetchone()[0]:,} rows")
    cur.execute("CREATE INDEX lftl_firm_idx ON lobby_firm_top_lobbyists (firm_name)")

    # ── 4. lobby_lobbyist_annual ──────────────────────────────────────────────
    print("4. Building lobby_lobbyist_annual...")
    cur.execute("DROP TABLE IF EXISTS lobby_lobbyist_annual")
    cur.execute("""
        CREATE TABLE lobby_lobbyist_annual AS
        SELECT
            lobbyist_name,
            firm_name,
            year,
            SUM(comp_midpoint) AS total_comp,
            COUNT(DISTINCT principal_name) AS num_principals,
            COUNT(*) AS num_records
        FROM lobbyist_comp_detail
        WHERE lobbyist_name != '' AND year > 0
        GROUP BY lobbyist_name, firm_name, year
        ORDER BY lobbyist_name, firm_name, year
    """)
    cur.execute("SELECT COUNT(*) FROM lobby_lobbyist_annual")
    print(f"   {cur.fetchone()[0]:,} rows")
    cur.execute("CREATE INDEX lla_lobbyist_idx ON lobby_lobbyist_annual (lobbyist_name)")
    cur.execute("CREATE INDEX lla_firm_idx ON lobby_lobbyist_annual (firm_name)")
    cur.execute("CREATE INDEX lla_year_idx ON lobby_lobbyist_annual (year)")

    # ── Sanity checks ─────────────────────────────────────────────────────────
    print("\n--- Sanity Checks ---")

    cur.execute("""
        SELECT firm_name, SUM(total_comp) AS total
        FROM lobby_firm_annual
        GROUP BY firm_name ORDER BY total DESC LIMIT 5
    """)
    print("\nTop 5 firms by all-time comp:")
    for r in cur.fetchall():
        print(f"  {r[0][:50]:<50s} ${float(r[1]):>14,.0f}")

    cur.execute("""
        SELECT principal_name, SUM(total_comp) AS total
        FROM lobby_principal_annual
        GROUP BY principal_name ORDER BY total DESC LIMIT 5
    """)
    print("\nTop 5 principals by all-time comp:")
    for r in cur.fetchall():
        print(f"  {r[0][:50]:<50s} ${float(r[1]):>14,.0f}")

    cur.execute("""
        SELECT lobbyist_name, SUM(total_comp) AS total
        FROM lobby_lobbyist_annual
        GROUP BY lobbyist_name ORDER BY total DESC LIMIT 5
    """)
    print("\nTop 5 lobbyists by all-time comp:")
    for r in cur.fetchall():
        print(f"  {r[0][:50]:<50s} ${float(r[1]):>14,.0f}")

    cur.execute("SELECT MIN(year), MAX(year) FROM lobby_firm_annual")
    r = cur.fetchone()
    print(f"\nYear range: {r[0]}–{r[1]}")

    conn.close()
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
