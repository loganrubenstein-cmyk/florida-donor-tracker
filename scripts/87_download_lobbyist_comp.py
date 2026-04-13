"""
Script 87: Download all quarterly lobbyist compensation reports from FL DoE.

Downloads tab-delimited TXT files from floridalobbyist.gov/reports/ for
both Legislative and Executive branches, 2007 through current quarter.

URL pattern: https://www.floridalobbyist.gov/reports/{YEAR}_Quarter{N}_{Branch}.txt

Each file has 3 record types: FIRM, LOBBYIST, PRINCIPAL.
The PRINCIPAL rows contain the compensation range per principal-firm pair.

Output: data/raw/lobbyist_comp/{YEAR}_Quarter{N}_{Branch}.txt

Usage:
    .venv/bin/python scripts/87_download_lobbyist_comp.py
    .venv/bin/python scripts/87_download_lobbyist_comp.py --force   # re-download all
"""

import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent))
from config import REQUEST_DELAY_SEC

BASE_URL = "https://www.floridalobbyist.gov/reports"
OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "raw" / "lobbyist_comp"
OUT_DIR.mkdir(parents=True, exist_ok=True)

BRANCHES = ["Legislative", "Executive"]
START_YEAR = 2007
END_YEAR = 2026
QUARTERS = [1, 2, 3, 4]

QUARTER_LABELS = {1: "January - March", 2: "April - June", 3: "July - September", 4: "October - December"}


def main():
    force = "--force" in sys.argv
    print(f"=== Script 87: Download Lobbyist Compensation Reports ===")
    print(f"  Range: {START_YEAR} Q1 – {END_YEAR} Q4, both branches")
    print(f"  Output: {OUT_DIR}")
    print(f"  Force: {force}\n")

    downloaded = 0
    skipped = 0
    failed = 0

    for year in range(START_YEAR, END_YEAR + 1):
        for q in QUARTERS:
            for branch in BRANCHES:
                fname = f"{year}_Quarter{q}_{branch}.txt"
                out_path = OUT_DIR / fname
                url = f"{BASE_URL}/{fname}"

                if out_path.exists() and not force:
                    skipped += 1
                    continue

                try:
                    resp = requests.get(url, timeout=30)
                    if resp.status_code == 200 and len(resp.content) > 100:
                        out_path.write_bytes(resp.content)
                        lines = resp.text.count('\n')
                        downloaded += 1
                        print(f"  {fname:45s} {lines:>6,} lines")
                    elif resp.status_code == 404:
                        failed += 1
                    else:
                        print(f"  {fname:45s} HTTP {resp.status_code} (skipped)")
                        failed += 1
                except Exception as ex:
                    print(f"  {fname:45s} ERROR: {ex}")
                    failed += 1

                time.sleep(REQUEST_DELAY_SEC)

    print(f"\nDone: {downloaded} downloaded, {skipped} already existed, {failed} not available")
    return 0


if __name__ == "__main__":
    sys.exit(main())
