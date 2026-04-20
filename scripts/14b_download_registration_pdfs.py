"""
Script 14b: Conditional-GET refresh of lobbyist registration PDFs.

Fetches the current-year Lobbyist_{LEG,EXE}.pdf + Principl_{LEG,EXE}.pdf from
floridalobbyist.gov/reports/ using If-Modified-Since so unchanged files aren't
re-downloaded. Writes a sentinel at /tmp/registration_changed when any file
actually changes, which the daily workflow can use to gate Phase B parsing.

Registration PDFs are the only source for NAICS industry codes per principal,
per-pair effective dates, chamber scope (House/Senate/PSCNC), and zero-comp
relationships — none of which are in the comp TXT files.

Output: data/raw/lobbyist_registrations/{YEAR}/{filename}.pdf
        /tmp/registration_changed  (only exists when >=1 file changed)
"""

import os
import sys
import time
from datetime import datetime, timezone
from email.utils import format_datetime, parsedate_to_datetime
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent))
from config import REQUEST_DELAY_SEC

BASE_URL = "https://floridalobbyist.gov/reports"
ROOT_OUT = Path(__file__).resolve().parent.parent / "data" / "raw" / "lobbyist_registrations"
SENTINEL = Path("/tmp/registration_changed")

# (prefix, branch_code) — filename pattern is {prefix}_{branch_code}_{year}.pdf
TARGETS = [
    ("Lobbyist", "LEG"),
    ("Lobbyist", "EXE"),
    ("Principl", "LEG"),
    ("Principl", "EXE"),
]


def refresh_file(session: requests.Session, prefix: str, branch: str, year: int) -> bool:
    fname = f"{prefix}_{branch}_{year}.pdf"
    out_dir = ROOT_OUT / str(year)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / fname
    url = f"{BASE_URL}/{fname}"

    headers = {}
    if out_path.exists():
        mtime = datetime.fromtimestamp(out_path.stat().st_mtime, tz=timezone.utc)
        headers["If-Modified-Since"] = format_datetime(mtime, usegmt=True)

    try:
        resp = session.get(url, headers=headers, timeout=60)
    except requests.RequestException as e:
        print(f"  {fname:35s} ERROR: {e}")
        return False

    if resp.status_code == 304:
        print(f"  {fname:35s} unchanged (304)")
        return False

    if resp.status_code == 404:
        print(f"  {fname:35s} not yet published (404)")
        return False

    if resp.status_code != 200 or len(resp.content) < 1000:
        print(f"  {fname:35s} HTTP {resp.status_code} ({len(resp.content)} bytes) — skipped")
        return False

    if not resp.content.startswith(b"%PDF"):
        print(f"  {fname:35s} not a PDF (magic bytes missing) — skipped")
        return False

    out_path.write_bytes(resp.content)

    last_mod = resp.headers.get("Last-Modified")
    if last_mod:
        try:
            ts = parsedate_to_datetime(last_mod).timestamp()
            os.utime(out_path, (ts, ts))
        except (TypeError, ValueError):
            pass

    print(f"  {fname:35s} REFRESHED  {len(resp.content):>10,} bytes")
    return True


def main() -> int:
    if SENTINEL.exists():
        SENTINEL.unlink()

    year = datetime.now(timezone.utc).year

    print(f"=== Script 14b: Conditional refresh of registration PDFs ===")
    print(f"  Year:   {year}")
    print(f"  Output: {ROOT_OUT / str(year)}\n")

    session = requests.Session()
    session.headers.update({
        "User-Agent": "florida-donor-tracker/1.0 (+https://github.com/loganrubenstein-cmyk/florida-donor-tracker)",
        "Referer": "https://floridalobbyist.gov/",
    })

    changed = 0
    for prefix, branch in TARGETS:
        if refresh_file(session, prefix, branch, year):
            changed += 1
        time.sleep(REQUEST_DELAY_SEC)

    print(f"\n{changed} file(s) changed this run.")
    if changed > 0:
        SENTINEL.write_text(f"{changed}\n")
        print(f"Sentinel written: {SENTINEL}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
