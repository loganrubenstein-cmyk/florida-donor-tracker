"""
scripts/75_update_legislator_stats.py
---------------------------------
Reconciliation: update denormalized vote stats on legislators table
from aggregated legislator_votes data.

Run after scripts 71, 72, 73, 74.

Usage:
    .venv/bin/python scripts/75_update_legislator_stats.py
"""

import os
from pathlib import Path

import psycopg2

ROOT = Path(__file__).parent.parent
dotenv = ROOT / ".env.local"
for line in dotenv.read_text().split("\n"):
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

DB_URL = os.environ["SUPABASE_DB_URL"]


def main():
    print("=== Script 75: Update Legislator Stats ===\n")

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()

    # 1. Update vote counts from legislator_votes
    print("1. Updating vote counts...")
    cur.execute("""
        UPDATE legislators l
        SET
            votes_yea = agg.yea,
            votes_nay = agg.nay,
            votes_nv = agg.nv,
            votes_absent = agg.absent,
            participation_rate = CASE
                WHEN (agg.yea + agg.nay + agg.nv + agg.absent) > 0
                THEN ROUND(
                    (agg.yea + agg.nay)::NUMERIC /
                    (agg.yea + agg.nay + agg.nv + agg.absent),
                    3
                )
                ELSE 0
            END
        FROM (
            SELECT
                people_id,
                COUNT(*) FILTER (WHERE vote_text = 'Yea') AS yea,
                COUNT(*) FILTER (WHERE vote_text = 'Nay') AS nay,
                COUNT(*) FILTER (WHERE vote_text = 'NV')  AS nv,
                COUNT(*) FILTER (WHERE vote_text = 'Absent') AS absent
            FROM legislator_votes
            GROUP BY people_id
        ) agg
        WHERE l.people_id = agg.people_id
    """)
    updated = cur.rowcount
    print(f"   Updated {updated} legislators with vote stats")

    # 2. Verify referential integrity
    print("\n2. Verifying referential integrity...")

    cur.execute("""
        SELECT COUNT(*) FROM committee_memberships cm
        WHERE NOT EXISTS (SELECT 1 FROM legislators l WHERE l.people_id = cm.people_id)
    """)
    orphan_memberships = cur.fetchone()[0]
    if orphan_memberships > 0:
        print(f"   WARNING: {orphan_memberships} committee_memberships with no matching legislator")
    else:
        print(f"   committee_memberships: OK")

    cur.execute("""
        SELECT COUNT(*) FROM legislator_votes lv
        WHERE NOT EXISTS (SELECT 1 FROM legislators l WHERE l.people_id = lv.people_id)
    """)
    orphan_votes = cur.fetchone()[0]
    if orphan_votes > 0:
        print(f"   WARNING: {orphan_votes} legislator_votes with no matching legislator")
    else:
        print(f"   legislator_votes: OK")

    # 3. Summary stats
    print("\n=== Final Summary ===")

    cur.execute("SELECT COUNT(*) FROM legislators")
    print(f"  legislators:           {cur.fetchone()[0]}")

    cur.execute("SELECT COUNT(*) FROM legislators WHERE votes_yea > 0")
    print(f"  with vote data:        {cur.fetchone()[0]}")

    cur.execute("SELECT COUNT(*) FROM legislative_committees")
    print(f"  legislative_committees:{cur.fetchone()[0]}")

    cur.execute("SELECT COUNT(*) FROM committee_memberships")
    print(f"  committee_memberships: {cur.fetchone()[0]}")

    cur.execute("SELECT COUNT(*) FROM legislator_votes")
    print(f"  legislator_votes:      {cur.fetchone()[0]:,}")

    cur.execute("SELECT COUNT(*) FROM bill_sponsorships")
    print(f"  bill_sponsorships:     {cur.fetchone()[0]:,}")

    # 4. Show top fundraisers
    print("\n  Top 10 fundraisers:")
    cur.execute("""
        SELECT display_name, chamber, party, leadership_title, total_raised
        FROM legislators
        WHERE total_raised IS NOT NULL
        ORDER BY total_raised DESC
        LIMIT 10
    """)
    for name, chamber, party, title, total in cur.fetchall():
        title_str = f" [{title}]" if title else ""
        print(f"    {name:30s} {chamber:6s} {party:3s}{title_str:25s} ${total:>12,.0f}")

    # 5. Participation rate stats
    print("\n  Participation rate (floor votes):")
    cur.execute("""
        SELECT
            AVG(participation_rate) FILTER (WHERE participation_rate > 0) AS avg_rate,
            MIN(participation_rate) FILTER (WHERE participation_rate > 0) AS min_rate,
            MAX(participation_rate) FILTER (WHERE participation_rate > 0) AS max_rate
        FROM legislators
    """)
    avg_r, min_r, max_r = cur.fetchone()
    if avg_r:
        print(f"    Avg: {avg_r:.1%}  Min: {min_r:.1%}  Max: {max_r:.1%}")

    cur.close()
    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
