"""
Script 76b: Backfill bill_number in legislator_votes from LegiScan bill_details cache.

The original load (script 73) pulled bill_number from each legislator's recent_votes JSON,
but those fields are often empty strings. The bill_details directory has the canonical
bill_id → bill_number mapping from the full LegiScan bill detail responses.

Strategy:
  1. Build bill_id → bill_number map from data/raw/bill_details/*.json
  2. For each legislator JSON (public/data/legislators/*.json), read recent_votes
     to get (people_id, roll_call_id, bill_id) triples
  3. Resolve bill_number via the map
  4. UPDATE legislator_votes SET bill_number = $1
     WHERE people_id = $2 AND roll_call_id = $3 AND bill_number IS NULL

Usage:
    .venv/bin/python scripts/76b_backfill_bill_numbers.py
    .venv/bin/python scripts/76b_backfill_bill_numbers.py --dry-run
"""

import json
import os
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")
DRY_RUN = "--dry-run" in sys.argv

# ── Step 1: Build bill_id → bill_number map ───────────────────────────────────
BILL_DETAILS_DIR = ROOT / "data" / "raw" / "bill_details"

bill_map = {}  # int bill_id → str bill_number
for f in BILL_DETAILS_DIR.glob("*.json"):
    try:
        d = json.loads(f.read_text())
        bid = d.get("bill_id")
        bn  = (d.get("bill_number") or "").strip()
        if bid and bn:
            bill_map[int(bid)] = bn
    except Exception:
        continue

print(f"Step 1: Loaded {len(bill_map):,} bill_id → bill_number mappings from bill_details/")
if not bill_map:
    print("  ERROR: No mappings found — check data/raw/bill_details/ exists and has .json files")
    sys.exit(1)

# ── Step 2: Collect (people_id, roll_call_id, bill_number) triples ────────────
LEG_DIR = ROOT / "public" / "data" / "legislators"
leg_files = [f for f in sorted(LEG_DIR.glob("*.json"))
             if f.name not in ("index.json", "donor_crossref.json")]

updates = []          # list of (bill_number, people_id, roll_call_id)
missing_bill = 0
missing_in_map = 0

for jf in leg_files:
    try:
        data = json.loads(jf.read_text())
    except Exception:
        continue
    people_id = data.get("people_id") or int(jf.stem)
    for v in data.get("recent_votes", []):
        rc  = v.get("roll_call_id")
        bid = v.get("bill_id")
        if not rc:
            continue
        if not bid:
            missing_bill += 1
            continue
        bn = bill_map.get(int(bid))
        if not bn:
            missing_in_map += 1
            continue
        updates.append((bn, people_id, rc))

print(f"Step 2: Scanned {len(leg_files)} legislator files")
print(f"  {len(updates):,} updates ready (bill_number resolved)")
print(f"  {missing_bill:,} vote entries had no bill_id")
print(f"  {missing_in_map:,} bill_ids not found in details cache (expected — cache is a sample)")

if not updates:
    print("\nNothing to update.")
    sys.exit(0)

if DRY_RUN:
    print(f"\n[DRY RUN] Would update up to {len(updates):,} rows in legislator_votes.")
    print("Sample updates (bill_number, people_id, roll_call_id):")
    for row in updates[:5]:
        print(f"  {row}")
    sys.exit(0)

# ── Step 3: Apply updates ─────────────────────────────────────────────────────
conn = psycopg2.connect(os.environ["SUPABASE_DB_URL"])
conn.autocommit = False
cur = conn.cursor()
cur.execute("SET statement_timeout = 0")

# Use a temp table for bulk UPDATE performance
cur.execute("""
    CREATE TEMP TABLE bill_number_updates (
        bill_number  TEXT,
        people_id    INTEGER,
        roll_call_id INTEGER
    )
""")
execute_values(cur,
    "INSERT INTO bill_number_updates VALUES %s",
    updates, page_size=5000)

cur.execute("""
    UPDATE legislator_votes lv
    SET    bill_number = u.bill_number
    FROM   bill_number_updates u
    WHERE  lv.people_id    = u.people_id
      AND  lv.roll_call_id = u.roll_call_id
      AND  lv.bill_number  IS NULL
""")
n = cur.rowcount
conn.commit()

print(f"\nStep 3: Updated {n:,} rows in legislator_votes.bill_number")
print("Bill Money Map tabs should now show data for bills with matching vote records.")
conn.close()
