"""
Script 47b: Conditional-GET refresh of lobbyist compensation files.

Fetches the current + prior 2 quarters (both branches) from floridalobbyist.gov/reports/
using If-Modified-Since so unchanged files aren't re-downloaded. Writes a sentinel
file at /tmp/lobbyist_changed when any file actually changes, which the daily
workflow uses to gate downstream import/reload steps.

Replaces the hardcoded QUARTERS list in scripts/47 with a rolling window computed
from today's date. Safe to run daily — typical cost when nothing changed is 6
HEAD-equivalent 304 responses.

Output: data/raw/lobbyist_comp/{YEAR}_Quarter{N}_{Branch}.txt (overwrites when changed)
        /tmp/lobbyist_changed  (only exists when at least one file changed this run)
"""

import os
import sys
from datetime import datetime, timezone
from email.utils import format_datetime, parsedate_to_datetime
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent))
from config import REQUEST_DELAY_SEC

BASE_URL = "https://floridalobbyist.gov/reports"
OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "raw" / "lobbyist_comp"
SENTINEL = Path("/tmp/lobbyist_changed")

BRANCHES = ["Legislative", "Executive"]
# How many quarters back to refresh. Covers amendments to the 2 prior deadlines
# plus the currently-accumulating quarter.
QUARTER_WINDOW = 3


def quarters_to_check(today: datetime | None = None) -> list[tuple[int, int]]:
    """Return (year, quarter) pairs for the current + (QUARTER_WINDOW - 1) prior quarters."""
    today = today or datetime.now(timezone.utc)
    q = (today.month - 1) // 3 + 1
    y = today.year
    out = []
    for _ in range(QUARTER_WINDOW):
        out.append((y, q))
        q -= 1
        if q == 0:
            q = 4
            y -= 1
    return out


def refresh_file(session: requests.Session, year: int, quarter: int, branch: str) -> bool:
    """Return True if the file changed (downloaded fresh), False if not modified / missing."""
    fname = f"{year}_Quarter{quarter}_{branch}.txt"
    out_path = OUT_DIR / fname
    url = f"{BASE_URL}/{fname}"

    headers = {}
    if out_path.exists():
        mtime = datetime.fromtimestamp(out_path.stat().st_mtime, tz=timezone.utc)
        headers["If-Modified-Since"] = format_datetime(mtime, usegmt=True)

    try:
        resp = session.get(url, headers=headers, timeout=30)
    except requests.RequestException as e:
        print(f"  {fname:45s} ERROR: {e}")
        return False

    if resp.status_code == 304:
        print(f"  {fname:45s} unchanged (304)")
        return False

    if resp.status_code == 404:
        print(f"  {fname:45s} not yet published (404)")
        return False

    if resp.status_code != 200 or len(resp.content) < 100:
        print(f"  {fname:45s} HTTP {resp.status_code} ({len(resp.content)} bytes) — skipped")
        return False

    out_path.write_bytes(resp.content)

    # Preserve server Last-Modified on local mtime so next run's If-Modified-Since
    # reflects the actual server version rather than local wall clock.
    last_mod = resp.headers.get("Last-Modified")
    if last_mod:
        try:
            ts = parsedate_to_datetime(last_mod).timestamp()
            os.utime(out_path, (ts, ts))
        except (TypeError, ValueError):
            pass

    lines = resp.text.count("\n")
    print(f"  {fname:45s} REFRESHED  {lines:>6,} lines  {len(resp.content):>9,} bytes")
    return True


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if SENTINEL.exists():
        SENTINEL.unlink()

    targets = quarters_to_check()
    print(f"=== Script 47b: Conditional refresh of lobbyist comp ===")
    print(f"  Window: {targets}")
    print(f"  Output: {OUT_DIR}\n")

    session = requests.Session()
    session.headers.update({
        "User-Agent": "florida-donor-tracker/1.0 (+https://github.com/loganrubenstein-cmyk/florida-donor-tracker)",
        "Referer": "https://floridalobbyist.gov/CompensationReportSearch/",
    })

    changed_count = 0
    import time
    for year, q in targets:
        for branch in BRANCHES:
            if refresh_file(session, year, q, branch):
                changed_count += 1
            time.sleep(REQUEST_DELAY_SEC)

    print(f"\n{changed_count} file(s) changed this run.")

    if changed_count > 0:
        SENTINEL.write_text(f"{changed_count}\n")
        print(f"Sentinel written: {SENTINEL}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
