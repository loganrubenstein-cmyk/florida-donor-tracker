# scripts/14_download_lobbyists.py
"""
Script 14: Download Florida lobbyist registration files from Online Sunshine.

Downloads two tab-delimited files from the FL Legislature's data portal:
  llob.txt — Legislative lobbyists (lobby the Legislature / committees / members)
  elob.txt — Executive lobbyists  (lobby state agencies and the Governor's office)

Both files share the same 37-column schema (see 15_import_lobbyists.py for mapping).
Files are updated continuously by the Lobbyist Registration Office.

Saved to: data/raw/lobbyists/

Usage (from project root, with .venv activated):
    python scripts/14_download_lobbyists.py
    python scripts/14_download_lobbyists.py --force   # re-download even if files exist
"""

import sys
import time
from datetime import datetime
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent))
from config import LOBBYIST_RAW, LLOB_URL, ELOB_URL, FL_ENCODING, REQUEST_TIMEOUT

_FILES = [
    ("llob.txt", LLOB_URL, "Legislative lobbyists"),
    ("elob.txt", ELOB_URL, "Executive lobbyists"),
]

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
}


def download_file(filename: str, url: str, label: str, force: bool = False) -> bool:
    dest = LOBBYIST_RAW / filename
    if dest.exists() and not force:
        size_kb = dest.stat().st_size // 1024
        print(f"  {label}: already downloaded ({size_kb:,} KB) — skipping (use --force to re-download)")
        return True

    print(f"  {label}: downloading from {url} ...", flush=True)
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=REQUEST_TIMEOUT * 2)
        if resp.status_code == 404:
            print(f"  ERROR: {url} returned 404 — file may have moved.", file=sys.stderr)
            return False
        resp.raise_for_status()

        # Validate: should be tab-delimited text, not HTML
        text = resp.content.decode(FL_ENCODING, errors="replace")
        first_line = text.strip().splitlines()[0] if text.strip() else ""
        if first_line.strip().startswith("<"):
            print(f"  ERROR: {url} returned HTML, not data. The file may have moved.",
                  file=sys.stderr)
            return False
        if "\t" not in first_line:
            print(f"  WARNING: Response doesn't look tab-delimited. First line: {first_line[:100]!r}")

        dest.write_bytes(resp.content)
        rows = len(text.strip().splitlines()) - 1  # subtract header
        size_kb = dest.stat().st_size // 1024
        print(f"  {label}: saved {rows:,} rows ({size_kb:,} KB) → {dest.name}")
        return True

    except requests.RequestException as e:
        print(f"  ERROR downloading {label}: {e}", file=sys.stderr)
        return False


def main(force: bool = False) -> int:
    print("=== Script 14: Download Lobbyist Registration Files ===\n")
    print(f"Destination: {LOBBYIST_RAW}\n")

    LOBBYIST_RAW.mkdir(parents=True, exist_ok=True)

    results = []
    for filename, url, label in _FILES:
        ok = download_file(filename, url, label, force=force)
        results.append(ok)
        time.sleep(1.0)

    print()
    if all(results):
        print("All lobbyist files downloaded.")
        print("Next: python scripts/15_import_lobbyists.py")
        return 0
    else:
        failed = [_FILES[i][2] for i, ok in enumerate(results) if not ok]
        print(f"WARNING: {len(failed)} file(s) failed: {', '.join(failed)}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(main(force=force))
