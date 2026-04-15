"""
scripts/66_backfill_date_ranges.py
-----------------------------------
Adds date_start / date_end columns to `committees` and `candidates` tables,
then backfills them from the contributions table.

recipient_type = 'committee' → committees.acct_num via recipient_acct
recipient_type = 'candidate' → candidates.acct_num via recipient_acct

Safe to re-run (ALTER TABLE IF NOT EXISTS, UPDATE sets overwrite).
"""

import os, time
from pathlib import Path
import psycopg2

ROOT = Path(__file__).parent.parent
dotenv = ROOT / '.env.local'
for line in dotenv.read_text().split('\n'):
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1)
        os.environ.setdefault(k.strip(), v.strip())

DB_URL = os.environ['SUPABASE_DB_URL']

conn = psycopg2.connect(DB_URL)
conn.autocommit = True
cur = conn.cursor()

print("── Step 1: Add date_start / date_end columns ─────────────────────────")

cur.execute("""
    ALTER TABLE committees
      ADD COLUMN IF NOT EXISTS date_start DATE,
      ADD COLUMN IF NOT EXISTS date_end   DATE
""")
print("  committees: columns added (or already existed)")

cur.execute("""
    ALTER TABLE candidates
      ADD COLUMN IF NOT EXISTS date_start DATE,
      ADD COLUMN IF NOT EXISTS date_end   DATE
""")
print("  candidates: columns added (or already existed)")

print("\n── Step 2: Backfill committees date ranges ───────────────────────────")
t0 = time.time()
cur.execute("""
    UPDATE committees c
    SET
      date_start = sub.min_date,
      date_end   = sub.max_date
    FROM (
      SELECT
        recipient_acct,
        MIN(contribution_date) AS min_date,
        MAX(contribution_date) AS max_date
      FROM contributions
      WHERE recipient_type = 'committee'
        AND contribution_date IS NOT NULL
        AND EXTRACT(YEAR FROM contribution_date) BETWEEN 1990 AND 2099
      GROUP BY recipient_acct
    ) sub
    WHERE c.acct_num = sub.recipient_acct
""")
committees_updated = cur.rowcount
print(f"  Updated {committees_updated:,} committee rows in {time.time()-t0:.1f}s")

print("\n── Step 3: Backfill candidates date ranges ───────────────────────────")
t0 = time.time()
cur.execute("""
    UPDATE candidates c
    SET
      date_start = sub.min_date,
      date_end   = sub.max_date
    FROM (
      SELECT
        recipient_acct,
        MIN(contribution_date) AS min_date,
        MAX(contribution_date) AS max_date
      FROM contributions
      WHERE recipient_type = 'candidate'
        AND contribution_date IS NOT NULL
        AND EXTRACT(YEAR FROM contribution_date) BETWEEN 1990 AND 2099
      GROUP BY recipient_acct
    ) sub
    WHERE c.acct_num = sub.recipient_acct
""")
candidates_updated = cur.rowcount
print(f"  Updated {candidates_updated:,} candidate rows in {time.time()-t0:.1f}s")

print("\n── Spot check ────────────────────────────────────────────────────────")
cur.execute("SELECT acct_num, committee_name, date_start, date_end FROM committees WHERE date_start IS NOT NULL ORDER BY total_received DESC NULLS LAST LIMIT 5")
for row in cur.fetchall():
    print(f"  Committee {row[0]}: {row[1][:40]} | {row[2]} → {row[3]}")

cur.execute("SELECT acct_num, candidate_name, date_start, date_end FROM candidates WHERE date_start IS NOT NULL ORDER BY hard_money_total DESC NULLS LAST LIMIT 5")
for row in cur.fetchall():
    print(f"  Candidate {row[0]}: {row[1][:30]} | {row[2]} → {row[3]}")

print("\n✓ Done")
conn.close()
