#!/usr/bin/env python3
"""
fix_committee_names.py

Fixes 4,159 committees in Supabase that have 'Committee Tracking System'
as their name. The correct names are in the closed_committees_manifest.json
from script 02b's sweep phase (Step 1), which extracted names from anchor text
in ComLkupByName.asp — accurate. The bug was in fetch_committee_detail (Step 2)
which grabbed the page title <h2> instead of the committee name.

Usage:
    .venv/bin/python scripts/fix_committee_names.py
"""

import json
import os
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")

DB_URL = os.environ.get("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("SUPABASE_DB_URL not set")

MANIFEST = ROOT / "data" / "raw" / "contributions" / "closed_committees_manifest.json"

def main():
    data = json.loads(MANIFEST.read_text())
    manifest = data.get("committees", {})
    print(f"Manifest entries: {len(manifest):,}")

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    # Get all bad rows from DB
    cur.execute("SELECT acct_num FROM committees WHERE committee_name = 'Committee Tracking System'")
    bad_accts = [r[0] for r in cur.fetchall()]
    print(f"Bad rows in DB:   {len(bad_accts):,}")

    # Build mapping: acct_num -> correct name
    pairs = []
    missing = []
    for acct in bad_accts:
        correct = manifest.get(str(acct), {}).get("committee_name", "")
        if correct and correct != "Committee Tracking System":
            pairs.append((correct, acct))
        else:
            missing.append(acct)

    print(f"Fixable:  {len(pairs):,}")
    print(f"Missing from manifest: {len(missing):,}")
    if missing[:10]:
        print(f"  Sample missing: {missing[:10]}")

    if not pairs:
        print("Nothing to fix.")
        return

    # Fix committees table
    psycopg2.extras.execute_values(
        cur,
        "UPDATE committees SET committee_name = v.name FROM (VALUES %s) AS v(name, acct) WHERE committees.acct_num = v.acct",
        pairs,
        page_size=len(pairs),
    )
    updated = cur.rowcount
    conn.commit()
    print(f"\n✓ Updated {updated:,} committees rows")

    # Fix donor_committees (denormalized copy)
    cur.execute("""
        UPDATE donor_committees dc
        SET committee_name = c.committee_name
        FROM committees c
        WHERE dc.acct_num = c.acct_num
          AND dc.committee_name = 'Committee Tracking System'
          AND c.committee_name IS NOT NULL
          AND c.committee_name != ''
          AND c.committee_name != 'Committee Tracking System'
    """)
    updated_dc = cur.rowcount
    conn.commit()
    print(f"✓ Updated {updated_dc:,} donor_committees rows")

    # Verify both
    cur.execute("SELECT COUNT(*) FROM committees WHERE committee_name = 'Committee Tracking System'")
    print(f"  committees remaining bad: {cur.fetchone()[0]}")
    cur.execute("SELECT COUNT(*) FROM donor_committees WHERE committee_name = 'Committee Tracking System'")
    print(f"  donor_committees remaining bad: {cur.fetchone()[0]}")

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
