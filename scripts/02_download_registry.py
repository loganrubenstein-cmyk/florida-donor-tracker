# scripts/02_download_registry.py
"""
Script 02: Download FL Division of Elections registry files.

Downloads:
  - committees.txt  — all registered committees (single POST, all active)
  - candidates.txt  — all candidates across major general elections (2020–2026),
                      combined into one file

These files are small (~1-5 MB) and rarely change.
By default, existing files are skipped. Pass --force to re-download.

Usage (from project root, with .venv activated):
    python scripts/02_download_registry.py
    python scripts/02_download_registry.py --force
"""

import sys
import time
from io import StringIO
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).parent))
from config import (
    COMMITTEES_RAW, CANDIDATES_RAW,
    COMMITTEES_URL, CANDIDATES_URL,
    REQUEST_DELAY_SEC, REQUEST_TIMEOUT, MAX_RETRIES,
    FL_ENCODING,
)

# General elections to pull candidates from (most recent first).
# Covers 2014–2026 so retired candidates (e.g. Brandes, Scott, Galvano) remain
# in the dataset. Add more IDs here to expand coverage (format: YYYYMMDD-TYPE).
CANDIDATE_ELECTION_IDS = [
    "20261103-GEN",
    "20241105-GEN",
    "20221108-GEN",
    "20201103-GEN",
    "20181106-GEN",
    "20161108-GEN",
    "20141104-GEN",
]

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://dos.elections.myflorida.com/",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def post_file(
    url: str,
    post_data: dict,
    label: str,
    timeout: int = REQUEST_TIMEOUT,
    max_retries: int = MAX_RETRIES,
    delay: float = REQUEST_DELAY_SEC,
) -> bytes:
    """
    POST to url with post_data.
    Returns raw response bytes.
    Raises RuntimeError after max_retries failures.
    """
    for attempt in range(1, max_retries + 1):
        try:
            print(f"    Fetching {label} (attempt {attempt}/{max_retries})...", flush=True)
            resp = requests.post(url, data=post_data, timeout=timeout, headers=_HEADERS)
            resp.raise_for_status()
            time.sleep(delay)
            return resp.content
        except requests.RequestException as e:
            print(f"    Warning: attempt {attempt} failed — {e}")
            if attempt == max_retries:
                raise RuntimeError(f"Failed to fetch {label} after {max_retries} attempts: {e}")
            time.sleep(delay * attempt)
    return b""


def validate_tsv(path: Path, expected_min_rows: int = 10) -> int:
    """
    Count data rows in a tab-delimited file (excludes header).
    Raises ValueError if file looks malformed.
    """
    lines = path.read_text(encoding=FL_ENCODING, errors="replace").splitlines()
    if len(lines) < expected_min_rows:
        raise ValueError(
            f"{path.name} has only {len(lines)} lines — expected at least {expected_min_rows}."
        )
    if "\t" not in lines[0]:
        raise ValueError(f"{path.name} first line has no tabs — may not be tab-delimited.")
    return len(lines) - 1


def download_committees(force: bool = False) -> int:
    """Download committees.txt. Returns row count."""
    dest = COMMITTEES_RAW / "committees.txt"
    print("[committees.txt]")

    if dest.exists() and dest.stat().st_size > 0 and not force:
        print("  Skipped (already exists — use --force to re-download)")
        return validate_tsv(dest)

    COMMITTEES_RAW.mkdir(parents=True, exist_ok=True)
    raw = post_file(COMMITTEES_URL, {"FormSubmit": "Download"}, "committees.txt")
    dest.write_bytes(raw)

    try:
        count = validate_tsv(dest)
        print(f"  Saved {count:,} rows ({dest.stat().st_size // 1024:,} KB)")
        return count
    except ValueError as e:
        print(f"  WARNING: {e}", file=sys.stderr)
        return 0


def download_candidates(force: bool = False) -> int:
    """
    Download candidates for each election in CANDIDATE_ELECTION_IDS,
    combine into a single candidates.txt (deduped by acct_num + election_id).
    Returns total row count.
    """
    dest = CANDIDATES_RAW / "candidates.txt"
    print("[candidates.txt]")

    if dest.exists() and dest.stat().st_size > 0 and not force:
        print("  Skipped (already exists — use --force to re-download)")
        try:
            return validate_tsv(dest)
        except ValueError:
            return 0

    CANDIDATES_RAW.mkdir(parents=True, exist_ok=True)
    frames: list[pd.DataFrame] = []

    for elec_id in CANDIDATE_ELECTION_IDS:
        print(f"  Election {elec_id}:")
        post_data = {
            "elecID": elec_id,
            "office": "All",
            "status": "All",
            "cantype": "STA",   # State candidates
            "FormSubmit": "Download Candidate List",
        }
        try:
            raw = post_file(CANDIDATES_URL, post_data, elec_id)
            text = raw.decode(FL_ENCODING, errors="replace")
            lines = text.strip().splitlines()
            if len(lines) < 2 or "\t" not in lines[0]:
                print(f"    No data returned — skipping")
                continue
            df = pd.read_csv(StringIO(text), sep="\t", dtype=str, on_bad_lines="warn")
            df.columns = [c.strip() for c in df.columns]
            print(f"    {len(df):,} rows")
            frames.append(df)
        except (RuntimeError, Exception) as e:
            print(f"    WARNING: {e}", file=sys.stderr)
            continue

    if not frames:
        print("  ERROR: No candidate data downloaded.", file=sys.stderr)
        return 0

    combined = pd.concat(frames, ignore_index=True)
    # Deduplicate: same candidate can appear in multiple elections
    if "AcctNum" in combined.columns and "ElectionID" in combined.columns:
        combined = combined.drop_duplicates(subset=["AcctNum", "ElectionID"])

    combined.to_csv(dest, sep="\t", index=False, encoding=FL_ENCODING)
    print(f"  Saved {len(combined):,} rows across {len(frames)} elections ({dest.stat().st_size // 1024:,} KB)")
    return len(combined)


def main(force: bool = False, skip_closed: bool = False) -> int:
    print("=== Script 02: Download Registry Files ===\n")

    try:
        download_committees(force=force)
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    print()

    try:
        download_candidates(force=force)
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1

    # ── Always run closed-committee discovery as a first-class step ──────────
    # Previously this was a separate 02b patch script; the canonical committee
    # pipeline now always includes closed/revoked/terminated PACs on every run
    # so dissolved committees like 70275 (Friends of Ron DeSantis) appear in
    # the registry without bespoke scripts.
    if not skip_closed:
        print("\n=== Step 2/2: Closed-committee discovery ===")
        try:
            import importlib.util
            here = Path(__file__).parent
            spec = importlib.util.spec_from_file_location(
                "closed_discovery", here / "02b_discover_closed_committees.py"
            )
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            rc = mod.main(force=force) if hasattr(mod, "main") else 0
            if rc:
                # Non-fatal: 02b requires committees.csv which is only available
                # after script 05 has run. In fresh CI runners, 02 runs before
                # 05, so 02b will exit 1 on the first 02 invocation — that's OK.
                print(f"  Closed-committee discovery exited {rc} (non-fatal)", file=sys.stderr)
        except Exception as e:
            print(f"  WARNING: closed-committee discovery failed — {e}", file=sys.stderr)
            # Not fatal — active-registry data is still usable.

    print("\nDone.")
    return 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    skip_closed = "--skip-closed" in sys.argv
    sys.exit(main(force=force, skip_closed=skip_closed))
