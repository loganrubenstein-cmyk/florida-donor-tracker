"""
Script 81: Recompute soft_money_total and total_combined.

Soft money is a per-politician lifetime figure (sum of total_received for
candidate-specific PACs). To avoid duplication across election cycle rows,
the total is written ONLY to the most recent acct_num for each politician.
All other cycle rows get soft_money_total = 0 and total_combined = hard only.

Replaces script 61. Run after script 80.

Usage:
    python scripts/81_update_soft_money_totals.py
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


# Person-level dedup approach:
#
# Each politician may have multiple acct_nums (one per election cycle). Because
# candidate_pc_edges links PACs to every cycle acct_num for a given person,
# naively summing per acct_num multiplies the same PAC's total_received N times.
#
# Fix: group all cycle acct_nums by UPPER(TRIM(candidate_name)), find the
# LATEST acct_num (highest election_year, then highest acct_num as tiebreaker),
# collect all candidate-specific publishable PC acct_nums across ALL of the
# person's cycle rows (deduplicated), sum total_received once, and write the
# result only to the latest acct_num row.
UPDATE_SQL = """
WITH person_groups AS (
  SELECT acct_num, UPPER(TRIM(candidate_name)) AS name_key, election_year
  FROM candidates
  WHERE candidate_name IS NOT NULL
),
person_latest AS (
  SELECT DISTINCT ON (name_key) acct_num AS latest_acct_num, name_key
  FROM person_groups
  ORDER BY name_key, election_year DESC NULLS LAST, acct_num DESC
),
person_pcs AS (
  SELECT DISTINCT pl.latest_acct_num, e.pc_acct_num
  FROM person_groups pg
  JOIN person_latest pl ON pl.name_key = pg.name_key
  JOIN candidate_pc_edges e
    ON e.candidate_acct_num = pg.acct_num
   AND e.is_publishable = true
   AND e.is_candidate_specific = true
   AND e.pc_acct_num IS NOT NULL
),
person_soft AS (
  SELECT pp.latest_acct_num, COALESCE(SUM(com.total_received), 0) AS soft_total
  FROM person_pcs pp
  JOIN committees com ON com.acct_num = pp.pc_acct_num
  GROUP BY pp.latest_acct_num
)
UPDATE candidates c
SET
  soft_money_total = ps.soft_total,
  total_combined   = COALESCE(c.hard_money_total, 0) + ps.soft_total
FROM person_soft ps
WHERE c.acct_num = ps.latest_acct_num;
"""

# Zero out all rows that are NOT the latest acct_num for a person who has
# any candidate-specific publishable PC links. This clears stale soft money
# from older cycle rows and from candidates with no linked PACs.
ZERO_SQL = """
WITH person_groups AS (
  SELECT acct_num, UPPER(TRIM(candidate_name)) AS name_key, election_year
  FROM candidates
  WHERE candidate_name IS NOT NULL
),
person_latest AS (
  SELECT DISTINCT ON (name_key) acct_num AS latest_acct_num, name_key
  FROM person_groups
  ORDER BY name_key, election_year DESC NULLS LAST, acct_num DESC
),
latest_with_soft AS (
  SELECT pl.latest_acct_num
  FROM person_latest pl
  WHERE EXISTS (
    SELECT 1
    FROM person_groups pg2
    JOIN candidate_pc_edges e ON e.candidate_acct_num = pg2.acct_num
    WHERE pg2.name_key = pl.name_key
      AND e.is_publishable = true
      AND e.is_candidate_specific = true
      AND e.pc_acct_num IS NOT NULL
  )
)
UPDATE candidates
SET
  soft_money_total = 0,
  total_combined   = COALESCE(hard_money_total, 0)
WHERE acct_num NOT IN (SELECT latest_acct_num FROM latest_with_soft)
  AND (soft_money_total IS NULL OR soft_money_total != 0);
"""

NUM_LINKED_SQL = """
UPDATE candidates c
SET num_linked_pcs = counts.n
FROM (
  SELECT candidate_acct_num, COUNT(DISTINCT pc_acct_num) AS n
  FROM candidate_pc_edges
  WHERE is_publishable = true AND pc_acct_num IS NOT NULL
  GROUP BY candidate_acct_num
) counts
WHERE c.acct_num = counts.candidate_acct_num;
"""

NUM_LINKED_ZERO_SQL = """
UPDATE candidates
SET num_linked_pcs = 0
WHERE acct_num NOT IN (
  SELECT DISTINCT candidate_acct_num
  FROM candidate_pc_edges
  WHERE is_publishable = true AND pc_acct_num IS NOT NULL
)
  AND (num_linked_pcs IS NULL OR num_linked_pcs != 0);
"""


def main() -> int:
    print("=== Script 81: Recompute Soft Money Totals (Person-Level Dedup) ===\n")

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True

    with conn.cursor() as cur:
        cur.execute("SET statement_timeout = 0")

        print("Updating soft_money_total on latest cycle rows only...")
        cur.execute(UPDATE_SQL)
        updated = cur.rowcount
        print(f"  Updated {updated:,} rows")

        print("Zeroing soft_money_total on all other rows...")
        cur.execute(ZERO_SQL)
        zeroed = cur.rowcount
        print(f"  Zeroed {zeroed:,} rows")

        print("Updating num_linked_pcs...")
        cur.execute(NUM_LINKED_SQL)
        print(f"  Updated {cur.rowcount:,} rows")
        cur.execute(NUM_LINKED_ZERO_SQL)
        print(f"  Zeroed {cur.rowcount:,} rows")

        # Sanity check
        cur.execute("""
            SELECT
              COUNT(*) FILTER (WHERE soft_money_total > 0)          AS with_soft,
              SUM(soft_money_total)                                  AS total_soft,
              SUM(total_combined)                                    AS total_combined,
              MAX(soft_money_total)                                  AS max_soft,
              (SELECT candidate_name FROM candidates ORDER BY soft_money_total DESC NULLS LAST LIMIT 1)
                                                                     AS top_candidate
            FROM candidates
        """)
        row = cur.fetchone()
        print(f"\nSanity check:")
        print(f"  Candidates with soft money > 0: {row[0]:,}")
        print(f"  Total soft money (all cands):   ${float(row[1] or 0):>15,.0f}")
        print(f"  Total combined:                 ${float(row[2] or 0):>15,.0f}")
        print(f"  Max single candidate soft:      ${float(row[3] or 0):>15,.0f}")
        print(f"  Top candidate:                  {row[4]}")

        print("\nRefreshing politicians_canonical materialized view...")
        cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY politicians_canonical")
        print("  Refreshed.")

    conn.close()
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
