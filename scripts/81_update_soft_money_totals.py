"""
Script 74: Recompute soft_money_total and total_combined using the new
candidate_pc_edges table, with lineage-aware committee inclusion.

Replaces script 61. Key additions:
  - Uses candidate_pc_edges instead of candidate_pc_links
  - Expands soft money via committee_lineage (predecessor/successor groups)
  - Only counts publishable edges

Run after script 73.

Usage:
    python scripts/74_update_soft_money_totals.py
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


# Lineage-aware soft money using only CANDIDATE-SPECIFIC PACs.
#
# is_candidate_specific = true when the PAC is clearly for this one candidate:
#   - PAC name contains the candidate's name, OR
#   - PAC is only linked to one candidate in the entire dataset.
#
# Multi-candidate PACs (e.g. "Florida For All, Inc." linked via solicitation to
# many candidates) have is_candidate_specific = false and are NOT included in
# soft_money_total — their full fundraising should not be attributed to one candidate.
UPDATE_SQL = """
WITH specific_links AS (
  -- Candidate-specific publishable edges only
  SELECT DISTINCT candidate_acct_num, pc_acct_num
  FROM candidate_pc_edges
  WHERE is_publishable = true
    AND is_candidate_specific = true
    AND pc_acct_num IS NOT NULL
),
lineage_links AS (
  -- Expand through lineage: if candidate is specifically linked to PC A,
  -- and PC B is in the same lineage group as PC A, also attribute PC B.
  SELECT DISTINCT sl.candidate_acct_num, l2.acct_num AS pc_acct_num
  FROM specific_links sl
  JOIN committee_lineage l1 ON l1.acct_num = sl.pc_acct_num
  JOIN committee_lineage l2 ON l2.group_id = l1.group_id
                            AND l2.acct_num != sl.pc_acct_num
),
all_specific AS (
  SELECT candidate_acct_num, pc_acct_num FROM specific_links
  UNION
  SELECT candidate_acct_num, pc_acct_num FROM lineage_links
),
soft AS (
  SELECT
    al.candidate_acct_num,
    COALESCE(SUM(com.total_received), 0) AS soft_total
  FROM all_specific al
  JOIN committees com ON com.acct_num = al.pc_acct_num
  GROUP BY al.candidate_acct_num
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
  FROM candidate_pc_edges
  WHERE is_publishable = true
    AND is_candidate_specific = true
    AND pc_acct_num IS NOT NULL
)
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
    print("=== Script 74: Recompute Soft Money Totals (Lineage-Aware) ===\n")

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True

    with conn.cursor() as cur:
        cur.execute("SET statement_timeout = 0")

        print("Updating soft_money_total + total_combined (with lineage expansion)...")
        cur.execute(UPDATE_SQL)
        updated = cur.rowcount
        print(f"  Updated {updated:,} rows")

        print("Zeroing candidates with no publishable PC links...")
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

    conn.close()
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
