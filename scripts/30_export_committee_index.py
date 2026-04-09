"""
Script 30 — Export committees index for the /committees directory page.

Reads all existing public/data/committees/{acct}.json files and writes a
lightweight index: public/data/committees/index.json

Each entry: {acct_num, committee_name, total_received, num_contributions}
Sorted by total_received descending.

Runtime: ~5 seconds (4,440 files, no CSV reads).
"""

import json
from pathlib import Path

BASE = Path(__file__).parent.parent
COMMITTEES_DIR = BASE / "public" / "data" / "committees"
OUT = COMMITTEES_DIR / "index.json"


def main():
    print("Script 30 — Committee Index")
    files = sorted(COMMITTEES_DIR.glob("*.json"))
    # exclude index.json if it exists
    files = [f for f in files if f.name != "index.json"]
    print(f"  Found {len(files)} committee files")

    entries = []
    for f in files:
        try:
            d = json.loads(f.read_text())
            entries.append({
                "acct_num":        str(d.get("acct_num", f.stem)),
                "committee_name":  d.get("committee_name", ""),
                "total_received":  round(float(d.get("total_received", 0)), 2),
                "num_contributions": int(d.get("num_contributions", 0)),
            })
        except Exception as e:
            print(f"  Skipping {f.name}: {e}")

    entries.sort(key=lambda x: x["total_received"], reverse=True)

    OUT.write_text(json.dumps(entries, separators=(",", ":")))
    print(f"Wrote {OUT} ({len(entries)} entries, {OUT.stat().st_size // 1024} KB)")
    print("Done.")


if __name__ == "__main__":
    main()
