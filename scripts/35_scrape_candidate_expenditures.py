# scripts/35_scrape_candidate_expenditures.py
"""
Script 35: Download expenditure records for every FL candidate's CCE account.

Mirrors script 20 (candidate contributions) but uses queryfor=2 to pull
expenditure data instead of contributions. Uses the same TreFin.exe CGI endpoint
with CanCom=Can.

Saves raw TSV files to data/raw/candidate_expenditures/.
Resumable: already-downloaded candidates are tracked in a manifest and skipped.

In Florida, candidates must file expenditure reports with the Division of Elections.
This captures money *spent* by each candidate's campaign committee — vendors, staff,
advertising, etc. — going back to 2006.

Usage (from project root, with .venv activated):
    python scripts/35_scrape_candidate_expenditures.py              # full run
    python scripts/35_scrape_candidate_expenditures.py --force      # re-scrape all
    python scripts/35_scrape_candidate_expenditures.py --limit 10   # test with 10 candidates
"""

import sys
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).parent))
from config import CONTRIB_CGI, PROCESSED_DIR
from _scraper_lib import (
    setup_logging,
    load_manifest, save_manifest,
    download_all_pages,
    warmup_session,
)

CAND_EXPEND_RAW = Path(__file__).resolve().parent.parent / "data" / "raw" / "candidate_expenditures"
MANIFEST_PATH   = CAND_EXPEND_RAW / "manifest.json"

# Same endpoint as candidate contributions but queryfor=2 = expenditures
_CAND_EXPEND_PARAMS = {
    "account":     "{acct}",
    "canname":     "{comname}",
    "CanCom":      "Can",
    "seqnum":      "0",
    "queryfor":    "2",          # <-- expenditures (vs 1 = contributions in script 20)
    "queryorder":  "DAT",
    "queryoutput": "2",
    "query":       "Submit+Query+Now",
}


def load_candidates(limit: int | None = None) -> list[tuple[str, str]]:
    """Load candidate accounts from the same CSV script 20 uses."""
    csv_path = PROCESSED_DIR / "candidates.csv"
    if not csv_path.exists():
        print(f"ERROR: {csv_path} not found. Run script 05 first.", file=sys.stderr)
        sys.exit(1)

    df = pd.read_csv(csv_path, dtype=str).fillna("")
    df = df[df["acct_num"].str.strip() != ""]
    df["full_name"] = (df["first_name"].str.strip() + " " + df["last_name"].str.strip()).str.strip()

    if limit:
        df = df.head(limit)

    return list(zip(df["acct_num"], df["full_name"]))


def main(force: bool = False, limit: int | None = None) -> int:
    logger = setup_logging("35_scrape_candidate_expenditures")
    logger.info("=== Script 35: Scrape Candidate CCE Expenditures ===")

    CAND_EXPEND_RAW.mkdir(parents=True, exist_ok=True)
    candidates = load_candidates(limit=limit)

    if not candidates:
        logger.error("No candidates to process.")
        return 1

    logger.info(f"Candidates to process: {len(candidates):,}")

    manifest = load_manifest(MANIFEST_PATH)
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer":    "https://dos.elections.myflorida.com/cgi-bin/TreSel.exe",
    })
    warmup_session(session, logger)

    total = len(candidates)
    completed = errors = skipped = empty = 0

    for i, (acct_num, name) in enumerate(candidates, 1):
        dest = CAND_EXPEND_RAW / f"CandExpend_{acct_num}.txt"

        if not force and manifest.get(acct_num, {}).get("status") == "complete":
            skipped += 1
            logger.info(f"[{i}/{total}] {acct_num} — skipped (already complete)")
            continue

        logger.info(f"[{i}/{total}] {acct_num}  {name[:60]}")

        try:
            entry = download_all_pages(
                CONTRIB_CGI, acct_num, name, dest, _CAND_EXPEND_PARAMS, "tsv",
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
