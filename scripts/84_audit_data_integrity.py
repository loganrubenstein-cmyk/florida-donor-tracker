"""
Script 84: Data Integrity Audit

Read-only. Runs four checks against the live DB and outputs a report to
console + data/logs/integrity_audit_YYYY-MM-DD.json.

Run this before every quarterly data update and after any backfill script.

Checks:
  A. Committee/contribution mismatch — committees with total_received > $100K
     but zero rows in contributions (the "70275 detector")
  B. Donor aggregate drift — donors where stored total_soft diverges from
     the live SUM of their contributions rows by more than $100
  C. Ghost slugs — top 100 contributions rows whose donor_slug has no
     matching donors row (invisible giving)
  D. Name truncation suspects — donors with suspiciously uniform all-caps
     names that may be truncated at the source (like "REPUBLICAN GOVERNORS
     ASSOCIATI")

Usage:
    .venv/bin/python scripts/84_audit_data_integrity.py
"""

import json
import os
import sys
from datetime import date
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
conn.autocommit = True
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
cur.execute("SET statement_timeout = 0")

LOG_DIR = ROOT / "data" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
OUT_FILE = LOG_DIR / f"integrity_audit_{date.today()}.json"

report = {}

# ── Check A: Committee/contribution mismatch ─────────────────────────────────

print("\n" + "="*60)
print("CHECK A: Committees with money but no contribution rows")
print("="*60)

cur.execute("""
    SELECT acct_num, committee_name, total_received::float,
           (SELECT COUNT(*) FROM contributions
            WHERE recipient_acct = committees.acct_num) AS contrib_count
    FROM committees
    WHERE total_received > 100000
      AND (SELECT COUNT(*) FROM contributions
           WHERE recipient_acct = committees.acct_num) = 0
    ORDER BY total_received DESC
""")
rows_a = cur.fetchall()

if rows_a:
    print(f"  ⚠️  {len(rows_a)} committees flagged:\n")
    for r in rows_a:
        print(f"  [{r['acct_num']}] {r['committee_name']}")
        print(f"       total_received = ${r['total_received']:,.2f}  |  contrib rows = {r['contrib_count']}")
else:
    print("  ✓ No mismatches found.")

report["check_a_committee_mismatch"] = [dict(r) for r in rows_a]

# ── Check B: Donor aggregate drift ───────────────────────────────────────────
# Two separate queries + Python comparison to avoid a 336K×10.9M join timeout.

print("\n" + "="*60)
print("CHECK B: Donor total_soft vs live SUM (drift > $100)")
print("="*60)

print("  Loading stored donor totals (total_soft > $10K)...")
cur.execute("SELECT slug, name, total_soft::float AS total_soft FROM donors WHERE total_soft > 10000")
stored_donors = {r["slug"]: r for r in cur.fetchall()}
print(f"  {len(stored_donors):,} donors loaded")

print("  Aggregating contributions by donor_slug (may take ~30s)...")
cur.execute("""
    SELECT donor_slug, SUM(amount)::float AS soft
    FROM contributions
    WHERE recipient_type = 'committee' AND donor_slug IS NOT NULL
    GROUP BY donor_slug
""")
live_soft = {r["donor_slug"]: r["soft"] for r in cur.fetchall()}
print(f"  {len(live_soft):,} donor slugs found in contributions")

rows_b = []
for slug, d in stored_donors.items():
    actual = live_soft.get(slug, 0.0)
    drift  = abs(d["total_soft"] - actual)
    if drift > 100:
        rows_b.append({
            "slug":   slug,
            "name":   d["name"],
            "stored": d["total_soft"],
            "actual": actual,
            "drift":  drift,
        })

rows_b.sort(key=lambda x: -x["drift"])
rows_b = rows_b[:100]

if rows_b:
    print(f"\n  ⚠️  {len(rows_b)} donors with significant drift (showing top 20):\n")
    for r in rows_b[:20]:
        print(f"  {r['name'][:40]:<40}  stored=${r['stored']:>14,.2f}  actual=${r['actual']:>14,.2f}  drift=${r['drift']:>12,.2f}")
else:
    print("  ✓ No significant aggregate drift found.")

report["check_b_aggregate_drift"] = rows_b

# ── Check C: Ghost slugs ──────────────────────────────────────────────────────
# LEFT JOIN is more efficient than NOT EXISTS on large tables.

print("\n" + "="*60)
print("CHECK C: Top ghost slugs (contributions with no donor profile)")
print("="*60)
print("  (LEFT JOIN on 10.9M rows — may take 1-2 min)")

cur.execute("""
    SELECT c.donor_slug,
           COUNT(*)::int   AS num_contributions,
           SUM(c.amount)::float AS total_amount,
           MIN(c.contributor_name) AS sample_name
    FROM contributions c
    LEFT JOIN donors d ON d.slug = c.donor_slug
    WHERE c.donor_slug IS NOT NULL
      AND d.slug IS NULL
    GROUP BY c.donor_slug
    ORDER BY total_amount DESC
    LIMIT 100
""")
rows_c = cur.fetchall()

# Summary totals — reuse the slug set we loaded for Check B
ghost_slug_set = set(live_soft.keys()) - set(stored_donors.keys())
# More precise: count contributions slugs not in ANY donors row
cur.execute("""
    SELECT COUNT(DISTINCT c.donor_slug) AS distinct_ghost_slugs,
           COUNT(*)::bigint             AS total_ghost_rows,
           SUM(c.amount)::float         AS total_ghost_amount
    FROM contributions c
    LEFT JOIN donors d ON d.slug = c.donor_slug
    WHERE c.donor_slug IS NOT NULL
      AND d.slug IS NULL
""")
ghost_summary = cur.fetchone()

print(f"  Total ghost slugs:   {ghost_summary['distinct_ghost_slugs']:,}")
print(f"  Total ghost rows:    {ghost_summary['total_ghost_rows']:,}")
print(f"  Total ghost dollars: ${ghost_summary['total_ghost_amount']:,.2f}")
print(f"\n  Top 20 by dollar value:\n")
for r in list(rows_c)[:20]:
    print(f"  {r['donor_slug'][:45]:<45}  ${r['total_amount']:>12,.2f}  ({r['num_contributions']} rows)  [{r['sample_name'][:30]}]")

report["check_c_ghost_slugs_summary"] = dict(ghost_summary)
report["check_c_ghost_slugs_top100"] = [dict(r) for r in rows_c]

# ── Check D: Name truncation suspects ────────────────────────────────────────

print("\n" + "="*60)
print("CHECK D: Possible truncated donor names (28–32 char all-caps)")
print("="*60)

cur.execute("""
    SELECT slug, name, total_soft::float AS total_soft
    FROM donors
    WHERE LENGTH(name) BETWEEN 28 AND 32
      AND name = UPPER(name)
      AND name ~ '^[A-Z0-9 ,\\.&/-]+$'
      AND name NOT LIKE '% JR%'
      AND name NOT LIKE '% SR%'
      AND name NOT LIKE '% III%'
      AND name NOT LIKE '% II%'
    ORDER BY total_soft DESC
    LIMIT 50
""")
rows_d = cur.fetchall()

if rows_d:
    print(f"  {len(rows_d)} suspects (showing top 20 by total_soft):\n")
    for r in list(rows_d)[:20]:
        print(f"  [{len(r['name'])} chars] {r['name']:<32}  ${r['total_soft']:>12,.2f}")
else:
    print("  ✓ No truncation suspects found.")

report["check_d_truncation_suspects"] = [dict(r) for r in rows_d]

# ── Write report ──────────────────────────────────────────────────────────────

report["audit_date"] = str(date.today())
report["summary"] = {
    "committee_mismatches":   len(rows_a),
    "donors_with_drift":      len(rows_b),
    "distinct_ghost_slugs":   ghost_summary["distinct_ghost_slugs"],
    "total_ghost_rows":       ghost_summary["total_ghost_rows"],
    "total_ghost_dollars":    ghost_summary["total_ghost_amount"],
    "truncation_suspects":    len(rows_d),
}

with open(OUT_FILE, "w") as f:
    json.dump(report, f, indent=2, default=str)

print("\n" + "="*60)
print("SUMMARY")
print("="*60)
print(f"  Committee mismatches:   {report['summary']['committee_mismatches']}")
print(f"  Donors with drift:      {report['summary']['donors_with_drift']}")
print(f"  Ghost slugs (distinct): {report['summary']['distinct_ghost_slugs']:,}")
print(f"  Ghost rows (total):     {report['summary']['total_ghost_rows']:,}")
print(f"  Ghost dollars (total):  ${report['summary']['total_ghost_dollars']:,.2f}")
print(f"  Truncation suspects:    {report['summary']['truncation_suspects']}")
print(f"\n  Full report → {OUT_FILE}")

cur.close()
conn.close()
