#!/usr/bin/env python3
"""
fix_committees_csv.py

Patches data/processed/committees.csv: replaces "Committee Tracking System"
committee_name values with the correct names from closed_committees_manifest.json.

Same manifest used by fix_committee_names.py (which fixed the DB tables).
Run this BEFORE re-running script 78 so the fuzzy committee matcher has
correct names to match solicitation org names against.

Usage:
    .venv/bin/python scripts/fix_committees_csv.py
"""

import csv
import json
from pathlib import Path

ROOT     = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "data" / "raw" / "contributions" / "closed_committees_manifest.json"
CSV_PATH = ROOT / "data" / "processed" / "committees.csv"

def main():
    manifest_data = json.loads(MANIFEST.read_text())
    manifest = manifest_data.get("committees", {})
    print(f"Manifest entries: {len(manifest):,}")

    rows = []
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    print(f"CSV rows: {len(rows):,}")
    bad = [r for r in rows if r["committee_name"] == "Committee Tracking System"]
    print(f"Rows with bad name: {len(bad):,}")

    fixed = 0
    missing = 0
    for row in rows:
        if row["committee_name"] != "Committee Tracking System":
            continue
        acct = row["acct_num"]
        correct = manifest.get(str(acct), {}).get("committee_name", "")
        if correct and correct != "Committee Tracking System":
            row["committee_name"] = correct
            fixed += 1
        else:
            missing += 1

    print(f"Fixed: {fixed:,}")
    print(f"Missing from manifest (kept as-is): {missing:,}")

    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n✓ Wrote {len(rows):,} rows back to {CSV_PATH.name}")

    # Spot-check
    check = {r["acct_num"]: r["committee_name"] for r in rows if r["acct_num"] in ("65255", "70275", "89518")}
    for acct, name in check.items():
        print(f"  {acct}: {name}")

if __name__ == "__main__":
    main()
