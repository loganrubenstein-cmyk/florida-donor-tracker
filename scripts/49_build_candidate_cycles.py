#!/usr/bin/env python3
"""
49_build_candidate_cycles.py

Scans all public/data/candidates/{acct_num}.json files and builds a
lookup table mapping normalized candidate names to all their election
appearances (different acct_nums, years, offices).

Output: public/data/candidate_cycles.json
  {
    "GERALDINE THOMPSON": [
      {"acct_num": "50341", "year": "2010", "office_code": "STR", "office_desc": "State Representative", "district": "022"},
      ...
    ],
    ...
  }

Only includes candidates who appear in 2+ election years (same normalized name).
Within each group, entries are sorted by year ascending.

Confidence notes:
  - Exact normalized name match only (uppercase, collapsed whitespace).
  - False-positive risk: common names like "JOSE RODRIGUEZ" may merge different people.
    The frontend should display office+district labels to help users spot mismatches.
  - False-negative: name spelling changes between elections (e.g. "Bob Smith" vs "Robert Smith")
    will NOT be linked — this is intentional (prefers undercounting over false merges).

Usage (from project root, with .venv activated):
    python scripts/49_build_candidate_cycles.py
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CAND_DIR     = PROJECT_ROOT / "public" / "data" / "candidates"
OUTPUT_PATH  = PROJECT_ROOT / "public" / "data" / "candidate_cycles.json"


def normalize(name: str) -> str:
    if not name:
        return ""
    return re.sub(r"\s+", " ", name.strip().upper())


def main() -> int:
    print("=== Script 49: Build candidate cycles index ===\n")

    files = [f for f in CAND_DIR.iterdir()
             if f.suffix == ".json" and f.stem not in ("index",)]
    print(f"Scanning {len(files):,} candidate files…")

    # Build per-name list of appearances
    name_groups: dict[str, list] = defaultdict(list)
    errors = 0

    for f in files:
        try:
            d = json.loads(f.read_text())
        except Exception:
            errors += 1
            continue

        name = d.get("candidate_name", "")
        norm = normalize(name)
        if not norm:
            continue

        name_groups[norm].append({
            "acct_num":   d.get("acct_num", f.stem),
            "year":       str(d.get("election_year", "")),
            "office_code": d.get("office_code", ""),
            "office_desc": d.get("office_desc", ""),
            "district":   d.get("district", ""),
            "party_code": d.get("party_code", ""),
        })

    # Keep only multi-year entries (same name, different election years)
    multi: dict[str, list] = {}
    for name, entries in name_groups.items():
        # Sort by year
        sorted_entries = sorted(entries, key=lambda e: (e["year"], e["acct_num"]))
        # Only include if there are 2+ distinct election years
        years = {e["year"] for e in sorted_entries}
        if len(years) >= 2:
            multi[name] = sorted_entries

    print(f"Found {len(multi):,} candidates with 2+ election years")
    if errors:
        print(f"  ({errors} files had parse errors — skipped)")

    # Build reverse lookup: acct_num → list of related entries (same name group)
    acct_to_cycles: dict[str, list] = {}
    for name, entries in multi.items():
        for entry in entries:
            # The "related" list is all entries for this name group, excluding self
            others = [e for e in entries if e["acct_num"] != entry["acct_num"]]
            acct_to_cycles[entry["acct_num"]] = others

    print(f"Built reverse lookup for {len(acct_to_cycles):,} acct_nums\n")

    output = {
        "_meta": {
            "total_groups": len(multi),
            "total_linked_accts": len(acct_to_cycles),
            "note": "Linked by exact normalized name only. Common names may have false merges — check office+district.",
        },
        "by_name":  multi,
        "by_acct":  acct_to_cycles,
    }

    OUTPUT_PATH.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")))
    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"✓ Wrote {OUTPUT_PATH.relative_to(PROJECT_ROOT)}  ({size_kb:.0f} KB)")

    # Show top examples
    top = sorted(multi.items(), key=lambda x: -len(x[1]))[:5]
    print("\nTop multi-cycle candidates:")
    for name, entries in top:
        years = " · ".join(
            f"{e['year']} {e['office_code']}{'/' + e['district'] if e['district'] else ''}"
            for e in entries
        )
        print(f"  {name}: {years}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
