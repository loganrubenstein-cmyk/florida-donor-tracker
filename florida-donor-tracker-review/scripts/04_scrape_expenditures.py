# scripts/04_scrape_expenditures.py
"""
Script 04: Download expenditure records for every registered committee.

Identical logic to 03_scrape_contributions.py — just targets the expenditures
CGI endpoint and writes to data/raw/expenditures/.

Usage (from project root, with .venv activated):
    python scripts/04_scrape_expenditures.py
    python scripts/04_scrape_expenditures.py --force
    python scripts/04_scrape_expenditures.py --limit 50

Must be run after 02_download_registry.py and 05_import_registry.py.
"""

import sys
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).parent))
from config import (
    EXPEND_CGI, EXPEND_RAW, PROCESSED_DIR,
    COMMITTEE_TYPE_FILTER,
)
from _scraper_lib import (
    setup_logging,
    load_manifest, save_manifest,
    probe_cgi_endpoint,
    download_all_pages,
)

MANIFEST_PATH = EXPEND_RAW / "manifest.json"


def load_committees(limit: int | None = None) -> list[tuple[str, str]]:
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
    for acct, name in committees:
        if "REPUBLICAN PARTY" in str(name).upper():
            return acct, name
    return committees[0] if committees else ("", "")


def main(force: bool = False, limit: int | None = None) -> int:
    logger = setup_logging("04_scrape_expenditures")
    logger.info("=== Script 04: Scrape Expenditures ===")

    committees = load_committees(limit=limit)
    if not committees:
        logger.error("No committees to process.")
        return 1

    logger.info(f"Committees to process: {len(committees):,}")

    probe_acct, probe_name = find_probe_committee(committees)
    try:
        cgi_params_template, response_format = probe_cgi_endpoint(
            EXPEND_CGI, probe_acct, probe_name, logger,
        )
    except RuntimeError as e:
        logger.error(str(e))
        return 1

    manifest = load_manifest(MANIFEST_PATH)
    session = requests.Session()
    session.headers["User-Agent"] = "Mozilla/5.0 (FL-Finance-Tracker/1.0)"

    total = len(committees)
    completed = errors = skipped = empty = 0

    for i, (acct_num, name) in enumerate(committees, 1):
        safe_name = acct_num.replace(" ", "_").replace("/", "_")
        dest = EXPEND_RAW / f"Expend_{safe_name}.txt"

        if not force and manifest.get(acct_num, {}).get("status") == "complete":
            skipped += 1
            logger.info(f"[{i}/{total}] {acct_num} — skipped (already complete)")
            continue

        logger.info(f"[{i}/{total}] {acct_num}  {name[:60]}")

        try:
            entry = download_all_pages(
                EXPEND_CGI, acct_num, name, dest,
                cgi_params_template, response_format,
                session, manifest, MANIFEST_PATH, logger, force=force,
            )
            if entry["status"] == "complete":
                completed += 1
                logger.info(f"  → {entry['rows']:,} rows ({entry['pages']} page(s))")
            else:
                empty += 1
                logger.info(f"  → no expenditures found")
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
