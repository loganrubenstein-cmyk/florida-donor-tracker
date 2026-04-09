# scripts/03_scrape_contributions.py
"""
Script 03: Download contribution records for every registered committee.

For each committee in data/processed/committees.csv, submits a paginated
request to the FL DOE contribution CGI and saves the result as a tab-
delimited .txt file in data/raw/contributions/.

Resumable: already-complete committees are skipped (tracked in manifest.json).
Re-run at any time to pick up where you left off.

Usage (from project root, with .venv activated):
    python scripts/03_scrape_contributions.py           # skip already-done
    python scripts/03_scrape_contributions.py --force   # re-download everything
    python scripts/03_scrape_contributions.py --limit 50  # only first 50 committees

Must be run after 02_download_registry.py and 05_import_registry.py.
"""

import sys
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).parent))
from config import (
    CONTRIB_CGI, CONTRIB_RAW, PROCESSED_DIR,
    COMMITTEE_TYPE_FILTER,
)
from _scraper_lib import (
    setup_logging,
    load_manifest, save_manifest,
    probe_cgi_endpoint,
    download_all_pages,
    warmup_session,
)

MANIFEST_PATH = CONTRIB_RAW / "manifest.json"


def load_committees(limit: int | None = None) -> list[tuple[str, str]]:
    """
    Load acct_num + committee_name pairs from committees.csv.
    Applies COMMITTEE_TYPE_FILTER if set. Returns list of (acct_num, name).
    """
    csv_path = PROCESSED_DIR / "committees.csv"
    if not csv_path.exists():
        print(f"ERROR: {csv_path} not found. Run 05_import_registry.py first.", file=sys.stderr)
        sys.exit(1)

    df = pd.read_csv(csv_path, dtype=str)

    if COMMITTEE_TYPE_FILTER and "type_code" in df.columns:
        df = df[df["type_code"].isin(COMMITTEE_TYPE_FILTER)]

    df = df[df["acct_num"].notna() & (df["acct_num"].str.strip() != "")]

    if limit:
        df = df.head(limit)

    return list(zip(df["acct_num"], df.get("committee_name", df["acct_num"])))


def find_probe_committee(committees: list[tuple[str, str]]) -> tuple[str, str]:
    """
    Use RPOF for the CGI probe (known to have lots of data).
    Falls back to the first committee if RPOF isn't in the list.
    """
    for acct, name in committees:
        if "REPUBLICAN PARTY" in str(name).upper():
            return acct, name
    return (committees[0][0], committees[0][1]) if committees else ("", "")


def main(force: bool = False, limit: int | None = None) -> int:
    logger = setup_logging("03_scrape_contributions")
    logger.info("=== Script 03: Scrape Contributions ===")

    committees = load_committees(limit=limit)
    if not committees:
        logger.error("No committees to process. Check committees.csv and COMMITTEE_TYPE_FILTER.")
        return 1

    logger.info(f"Committees to process: {len(committees):,}")

    # Probe the CGI endpoint before starting the main loop
    probe_acct, probe_name = find_probe_committee(committees)
    try:
        cgi_params, response_format = probe_cgi_endpoint(
            CONTRIB_CGI, probe_acct, probe_name, logger
        )
    except RuntimeError as e:
        logger.error(str(e))
        return 1

    logger.info(f"Response format: {response_format}")

    manifest = load_manifest(MANIFEST_PATH)
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": "https://dos.elections.myflorida.com/cgi-bin/TreSel.exe",
    })
    warmup_session(session, logger)

    total = len(committees)
    completed = errors = skipped = empty = 0

    for i, (acct_num, name) in enumerate(committees, 1):
        safe_name = acct_num.replace(" ", "_").replace("/", "_")
        dest = CONTRIB_RAW / f"Contrib_{safe_name}.txt"

        # Quick skip check before calling download_all_pages
        if not force and manifest.get(acct_num, {}).get("status") == "complete":
            skipped += 1
            logger.info(f"[{i}/{total}] {acct_num} — skipped (already complete)")
            continue

        logger.info(f"[{i}/{total}] {acct_num}  {name[:60]}")

        try:
            entry = download_all_pages(
                CONTRIB_CGI, acct_num, name, dest, cgi_params, response_format,
                session, manifest, MANIFEST_PATH, logger, force=force,
            )
            if entry["status"] == "complete":
                completed += 1
                logger.info(f"  → {entry['rows']:,} rows ({entry['pages']} page(s))")
            else:
                empty += 1
                logger.info(f"  → no contributions found")
        except Exception as e:
            errors += 1
            logger.error(f"  FAILED: {e}")
            manifest[acct_num] = {
                "status": "error",
                "error": str(e),
                "last_updated": __import__("datetime").datetime.now().isoformat(),
            }
            save_manifest(manifest, MANIFEST_PATH)
            continue

    logger.info(
        f"\nDone. completed={completed}, empty={empty}, skipped={skipped}, errors={errors}"
    )
    logger.info(f"Manifest: {MANIFEST_PATH}")
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    _force = "--force" in sys.argv
    _limit = None
    if "--limit" in sys.argv:
        idx = sys.argv.index("--limit")
        try:
            _limit = int(sys.argv[idx + 1])
        except (IndexError, ValueError):
            print("Usage: --limit <number>", file=sys.stderr)
            sys.exit(1)
    sys.exit(main(force=_force, limit=_limit))
