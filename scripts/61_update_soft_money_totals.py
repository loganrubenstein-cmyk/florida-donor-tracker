"""
Script 61: Recompute soft_money_total and total_combined in the candidates table.

Reads from candidate_pc_links + committees in Supabase to compute the correct
soft money total per candidate, then updates candidates.soft_money_total and
candidates.total_combined (hard_money_total + soft_money_total).

Only counts non-stub link types (solicitation_stub / historical_stub have no
usable financial data).

Usage:
    python scripts/61_update_soft_money_totals.py
"""

import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set in .env.local")


UPDATE_SQL = """
WITH distinct_links AS (
  -- one row per (candidate_acct_num, pc_acct_num) — prevents double-counting
  -- when the same PC is linked via multiple link types (e.g. chair + solicitation)
  SELECT DISTINCT candidate_acct_num, pc_acct_num
  FROM candidate_pc_links
  WHERE link_type NOT IN ('solicitation_stub', 'historical_stub')
    AND pc_acct_num IS NOT NULL
),
soft AS (
  SELECT
    dl.candidate_acct_num,
    COALESCE(SUM(com.total_received), 0) AS soft_total
  FROM distinct_links dl
  JOIN committees com ON com.acct_num = dl.pc_acct_num
  GROUP BY dl.candidate_acct_num
)
UPDATE candidates c
SET
  soft_money_total = soft.soft_total,
  total_combined   = COALESCE(c.hard_money_total, 0) + soft.soft_total
FROM soft
WHERE c.acct_num = soft.candidate_acct_num;
"""

ZERO_SQL = """
UPDATE candidates
SET
  soft_money_total = 0,
  total_combined   = COALESCE(hard_money_total, 0)
WHERE acct_num NOT IN (
  SELECT DISTINCT candidate_acct_num
  FROM candidate_pc_links
  WHERE link_type NOT IN ('solicitation_stub', 'historical_stub')
    AND pc_acct_num IS NOT NULL
)
  AND (soft_money_total IS NULL OR soft_money_total != 0);
"""


def main() -> int:
    print("=== Script 61: Recompute soft_money_total in candidates table ===\n")

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True

    with conn.cursor() as cur:
        cur.execute("SET statement_timeout = 0")

        print("Updating soft_money_total + total_combined for candidates with linked PCs...")
        cur.execute(UPDATE_SQL)
        updated = cur.rowcount
        print(f"  Updated {updated:,} rows with PC-linked soft money")

        print("Zeroing out candidates with no active PC links...")
        cur.execute(ZERO_SQL)
        zeroed = cur.rowcount
        print(f"  Zeroed {zeroed:,} rows")

        # Quick sanity check
        cur.execute("""
            SELECT
              COUNT(*) FILTER (WHERE soft_money_total > 0) AS with_soft,
              SUM(soft_money_total) AS total_soft,
              SUM(total_combined)   AS total_combined
            FROM candidates
        """)
        row = cur.fetchone()
        print(f"\nSanity check:")
        print(f"  Candidates with soft money > 0: {row[0]:,}")
        print(f"  Total soft money:               ${float(row[1] or 0):,.0f}")
        print(f"  Total combined:                 ${float(row[2] or 0):,.0f}")

    conn.close()
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
