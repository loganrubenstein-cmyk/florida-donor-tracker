#!/usr/bin/env python3
"""
101_download_irs_bmf.py

Download the IRS Exempt Organizations Business Master File (EO BMF).
This is the authoritative list of all ~1.8M tax-exempt orgs in the US,
with EIN + NTEE category. Feeds 21b as NAICS source #4.

Source: https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract

Files (split by state):
  eo1.csv — AL through ID     (~430K rows)
  eo2.csv — IL through MO     (~450K rows)
  eo3.csv — MT through RI     (~430K rows)
  eo4.csv — SC through WY + PR/foreign  (~500K rows)

Outputs to public/data/irs_bmf/eoN.csv (gitignored).
Conditional-GET: skips download if Last-Modified matches cached.
"""
import os
import sys
import time
from pathlib import Path

import requests

PROJECT = Path(__file__).resolve().parent.parent
DEST = PROJECT / "public" / "data" / "irs_bmf"
DEST.mkdir(parents=True, exist_ok=True)

FILES = ["eo1.csv", "eo2.csv", "eo3.csv", "eo4.csv"]
BASE = "https://www.irs.gov/pub/irs-soi/"
UA = "Mozilla/5.0 (compatible; FLDonorTracker/1.0)"


def fetch(name: str) -> bool:
    url = BASE + name
    dest = DEST / name
    meta = DEST / f"{name}.meta"
    headers = {"User-Agent": UA}
    if meta.exists():
        cached_lm = meta.read_text().strip()
        headers["If-Modified-Since"] = cached_lm
    t0 = time.time()
    with requests.get(url, headers=headers, stream=True, timeout=120) as r:
        if r.status_code == 304:
            print(f"  {name}: not modified (cached)")
            return False
        r.raise_for_status()
        total = 0
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=65536):
                f.write(chunk)
                total += len(chunk)
        lm = r.headers.get("Last-Modified", "")
        if lm:
            meta.write_text(lm)
    print(f"  {name}: {total/1e6:.1f} MB  ({time.time()-t0:.1f}s)")
    return True


def main():
    print(f"Downloading IRS EO BMF to {DEST}")
    changed = 0
    for name in FILES:
        try:
            if fetch(name):
                changed += 1
        except requests.HTTPError as e:
            print(f"  {name}: HTTP error {e}")
            sys.exit(1)
    print(f"\n{changed}/{len(FILES)} files updated")


if __name__ == "__main__":
    main()
