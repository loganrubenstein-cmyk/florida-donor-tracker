"""
Script 86b: Apply Ghost Slug Remaps

Reads the most recent ghost_remaps_*.csv from data/logs/ and applies the
UPDATE contributions SET donor_slug = canonical WHERE donor_slug = ghost
for each approved row.

IMPORTANT: Review ghost_remaps_*.csv manually before running this script.
Remove any rows you don't want to apply. The confident_remaps CSV only
contains rows where the matching logic found a single unambiguous candidate,
but human review is still required before touching 10M+ contribution rows.

After this script completes, run script 85 to reconcile donor aggregates.

Usage:
    .venv/bin/python scripts/86b_apply_ghost_remaps.py
    .venv/bin/python scripts/86b_apply_ghost_remaps.py --dry-run
"""

import csv
import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")

DRY_RUN = "--dry-run" in sys.argv

db_url = os.environ.get("SUPABASE_DB_URL")
if not db_url:
    sys.exit("SUPABASE_DB_URL not set in .env.local")

LOG_DIR = ROOT / "data" / "logs"

# Find most recent remaps file
remap_files = sorted(LOG_DIR.glob("ghost_remaps_*.csv"), reverse=True)
if not remap_files:
    sys.exit(f"No ghost_remaps_*.csv found in {LOG_DIR}. Run script 86 first.")

remap_file = remap_files[0]
print(f"Using remap file: {remap_file.name}")

with open(remap_file, newline="") as f:
    remaps = list(csv.DictReader(f))

print(f"  {len(remaps)} remaps to apply")
if not remaps:
    sys.exit("No remaps to apply.")

if DRY_RUN:
    print("\n[DRY RUN] Would apply these remaps:")
    for r in remaps:
        print(f"  {r['ghost_slug']:<45} → {r['proposed_slug']:<40}  ({r['confidence']})  ${float(r['total']):,.2f}")
    sys.exit(0)

conn = psycopg2.connect(db_url)
conn.autocommit = False
cur = conn.cursor()
cur.execute("SET statement_timeout = 0")

print("\nApplying remaps...")
applied = 0
total_rows_updated = 0

for r in remaps:
    ghost  = r["ghost_slug"]
    canon  = r["proposed_slug"]
    if not ghost or not canon:
        continue
    cur.execute(
        "UPDATE contributions SET donor_slug = %s WHERE donor_slug = %s",
        (canon, ghost)
    )
    n = cur.rowcount
    total_rows_updated += n
    print(f"  {ghost:<45} → {canon:<40}  ({n} rows)")
    applied += 1

conn.commit()
cur.close()
conn.close()

print(f"\n✓ Script 86b complete.")
print(f"  {applied} ghost slugs remapped")
print(f"  {total_rows_updated:,} contribution rows updated")
print(f"\nNext: run script 85 to reconcile donor aggregate totals.")
