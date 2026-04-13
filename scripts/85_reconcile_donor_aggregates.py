"""
Script 85: Reconcile Donor Aggregates

Recomputes total_soft, total_hard, total_combined, and num_contributions
for every donor in the donors table by summing directly from the
contributions table. Updates rows where the stored value diverges from
the live sum by more than $1.

Also reconciles donor_committees: recomputes per-(donor_slug, acct_num)
totals and upserts via ON CONFLICT (requires migration 013).

Run after:
  - Any backfill script that adds contributions
  - Script 86b (ghost slug remaps)
  - Any quarterly data refresh

Usage:
    .venv/bin/python scripts/85_reconcile_donor_aggregates.py
"""

import os
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")

db_url = os.environ.get("SUPABASE_DB_URL")
if not db_url:
    sys.exit("SUPABASE_DB_URL not set in .env.local")

conn = psycopg2.connect(db_url)
conn.autocommit = False
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
cur.execute("SET statement_timeout = 0")

# ── Step 1: Compute live sums from contributions ──────────────────────────────

print("Computing live sums from contributions table...")
print("  (this may take 30–60 seconds on 10.9M rows)")

cur.execute("""
    SELECT
        donor_slug,
        SUM(CASE WHEN recipient_type = 'committee' THEN amount ELSE 0 END) AS soft,
        SUM(CASE WHEN recipient_type = 'candidate' THEN amount ELSE 0 END) AS hard,
        COUNT(*) AS n
    FROM contributions
    WHERE donor_slug IS NOT NULL
    GROUP BY donor_slug
""")
live_rows = cur.fetchall()
live_by_slug = {r["donor_slug"]: r for r in live_rows}
print(f"  {len(live_by_slug):,} distinct donor_slugs in contributions")

# ── Step 2: Load current stored values ───────────────────────────────────────

print("Loading stored donor totals...")
cur.execute("SELECT slug, total_soft, total_hard, total_combined, num_contributions FROM donors")
donor_rows = cur.fetchall()
print(f"  {len(donor_rows):,} donors in table")

# ── Step 3: Find and fix drifted donors ──────────────────────────────────────

print("Comparing and updating donors with drift > $1...")

updates = []
for d in donor_rows:
    slug = d["slug"]
    live = live_by_slug.get(slug)
    if live is None:
        # No contributions at all for this donor — skip (don't zero out)
        continue
    live_soft  = float(live["soft"] or 0)
    live_hard  = float(live["hard"] or 0)  # hard money may be pre-loaded separately
    live_n     = int(live["n"])

    stored_soft = float(d["total_soft"] or 0)
    stored_hard = float(d["total_hard"] or 0)

    # Only update soft + combined + n; preserve hard money as-is
    # (hard money aggregates come from candidate contributions pipeline)
    drift = abs(live_soft - stored_soft)
    if drift > 1.0:
        updates.append({
            "slug":            slug,
            "new_soft":        live_soft,
            "new_combined":    live_soft + stored_hard,
            "new_n":           live_n,
            "old_soft":        stored_soft,
            "drift":           drift,
        })

print(f"  {len(updates):,} donors need updating")

if updates:
    print("  Top 20 corrections:")
    for u in sorted(updates, key=lambda x: -x["drift"])[:20]:
        print(f"    {u['slug'][:45]:<45}  ${u['old_soft']:>14,.2f} → ${u['new_soft']:>14,.2f}  (drift ${u['drift']:,.2f})")

    # Batch update
    for u in updates:
        cur.execute("""
            UPDATE donors
            SET total_soft     = %s,
                total_combined = %s,
                num_contributions = %s
            WHERE slug = %s
        """, (u["new_soft"], u["new_combined"], u["new_n"], u["slug"]))

    total_drift_corrected = sum(u["drift"] for u in updates)
    print(f"\n  Total drift corrected: ${total_drift_corrected:,.2f} across {len(updates):,} donors")

# ── Step 4: Reconcile donor_committees ───────────────────────────────────────

print("\nReconciling donor_committees from contributions...")
print("  (aggregating per donor_slug × acct_num — may take 1–2 min)")

cur.execute("""
    SELECT c.donor_slug, c.recipient_acct AS acct_num,
           co.committee_name,
           SUM(c.amount)::float AS total,
           COUNT(*)::int AS num_contributions
    FROM contributions c
    LEFT JOIN committees co ON co.acct_num = c.recipient_acct
    WHERE c.donor_slug IS NOT NULL
      AND c.recipient_type = 'committee'
    GROUP BY c.donor_slug, c.recipient_acct, co.committee_name
""")
dc_rows = cur.fetchall()
print(f"  {len(dc_rows):,} (donor_slug, acct_num) pairs in contributions")

upserted = 0
for r in dc_rows:
    cur.execute("""
        INSERT INTO donor_committees (donor_slug, acct_num, committee_name, total, num_contributions)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (donor_slug, acct_num)
        DO UPDATE SET
            total             = EXCLUDED.total,
            num_contributions = EXCLUDED.num_contributions,
            committee_name    = COALESCE(EXCLUDED.committee_name, donor_committees.committee_name)
    """, (r["donor_slug"], r["acct_num"], r["committee_name"], r["total"], r["num_contributions"]))
    upserted += 1

print(f"  Upserted {upserted:,} donor_committees rows")

# ── Commit ────────────────────────────────────────────────────────────────────

conn.commit()
cur.close()
conn.close()

print("\n✓ Script 85 complete.")
print(f"  {len(updates):,} donor aggregate rows corrected")
print(f"  {upserted:,} donor_committees rows reconciled")
print(f"\nRun script 84 again to verify drift is now near-zero.")
