# scripts/11_scrape_transfers.py
"""
Script 11: Download fund transfer records for every registered committee.

Queries the FL DOE FundXfers.exe endpoint for each committee and saves
outgoing transfer records (money sent FROM that committee to candidates
or other committees) as tab-delimited .txt files in data/raw/transfers/.

This data captures the "laundering layer" — PC→PC→Candidate money chains
that don't appear in contribution records.

Resumable: already-complete committees are skipped (tracked in manifest.json).

Usage (from project root, with .venv activated):
    python scripts/11_scrape_transfers.py
    python scripts/11_scrape_transfers.py --force
    python scripts/11_scrape_transfers.py --limit 50

Must be run after 05_import_registry.py.
"""

import sys
import time
from datetime import datetime
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).parent))
from config import (
    TRANSFER_CGI, TRANSFERS_RAW, PROCESSED_DIR,
    COMMITTEE_TYPE_FILTER, FL_ENCODING,
    REQUEST_DELAY_SEC, REQUEST_TIMEOUT, MAX_RETRIES, PAGE_ROW_LIMIT,
)
from _scraper_lib import (
    setup_logging,
    load_manifest, save_manifest,
    parse_tsv_page, parse_html_page,
)

MANIFEST_PATH = TRANSFERS_RAW / "manifest.json"

# ---------------------------------------------------------------------------
# Probe variants for FundXfers.exe
# ComName + ComNameSrch instead of account + comname (TreFin.exe convention).
# queryformat=2 requests tab-delimited output (mirrors queryoutput=2 on TreFin).
# seqnum is included so the shared pagination logic in _scraper_lib works.
# ---------------------------------------------------------------------------
# Full set of form fields matching what the browser POSTs to FundXfers.exe.
# election=All is a REQUIRED field — omitting it causes a 502.
# search_on=1 targets committee name search (not candidate).
# queryformat=2 requests TSV; queryformat=1 is the HTML fallback.
_TRANSFER_BASE_PARAMS = {
    "election":        "All",
    "search_on":       "1",
    "CanFName":        "",
    "CanLName":        "",
    "CanNameSrch":     "2",
    "office":          "All",
    "cdistrict":       "",
    "cgroup":          "",
    "party":           "All",
    "ComName":         "{comname}",
    "ComNameSrch":     "2",
    "committee":       "All",
    "clname":          "",
    "namesearch":      "2",
    "ccity":           "",
    "cstate":          "",
    "czipcode":        "",
    "cdollar_minimum": "",
    "cdollar_maximum": "",
    "rowlimit":        "500",
    "csort1":          "DAT",
    "csort2":          "CAN",
    "cdatefrom":       "",
    "cdateto":         "",
    "queryformat":     "2",   # overridden per variant
    "Submit":          "Submit",
}

_TRANSFER_PROBE_VARIANTS = [
    # Variant 1: TSV output, starts-with match
    {**_TRANSFER_BASE_PARAMS, "queryformat": "2", "ComNameSrch": "2"},
    # Variant 2: TSV output, contains match
    {**_TRANSFER_BASE_PARAMS, "queryformat": "2", "ComNameSrch": "1"},
    # Variant 3: alternate TSV format string
    {**_TRANSFER_BASE_PARAMS, "queryformat": "tab", "ComNameSrch": "2"},
    # Variant 4: HTML fallback (matches browser exactly)
    {**_TRANSFER_BASE_PARAMS, "queryformat": "1", "ComNameSrch": "2"},
]


def _looks_like_tsv(text: str) -> bool:
    if not text or not text.strip():
        return False
    first_line = text.strip().splitlines()[0]
    return "\t" in first_line and not first_line.strip().startswith("<")


def _looks_like_html_data_table(text: str) -> bool:
    if not text or not text.strip():
        return False
    lower = text.lower()
    return "<table" in lower and (
        "transfer" in lower or "amount" in lower or "fund" in lower
    )


def _looks_like_plaintext_report(text: str) -> bool:
    """Detect FundXfers.exe plain-text fixed-width response (no tabs, no HTML table)."""
    if not text or not text.strip():
        return False
    lower = text.lower()
    return (
        "fund transfer" in lower or "selected" in lower
    ) and "<table" not in lower


import re as _re

# Matches a fund transfer record line from FundXfers.exe plain-text output.
# Format: <name>  <MM/DD/YYYY>  <amount>  <recipient>
# Example: "Republican Party of Florida (PTY)    08/24/1999    1,039.68  SUNTRUST BANK"
_PLAINTEXT_ROW_RE = _re.compile(
    r"^(.+?)\s{2,}(\d{2}/\d{2}/\d{4})\s{2,}([\d,]+\.\d{2})\s{2,}(.+?)\s*$"
)


def parse_plaintext_page(text: str) -> pd.DataFrame:
    """
    Parse FundXfers.exe fixed-width plain-text response into a DataFrame.
    Skips header lines, dashes, and the summary footer.
    Columns: transferor_name, transfer_date, amount, transferee_name
    """
    rows = []
    for line in text.splitlines():
        m = _PLAINTEXT_ROW_RE.match(line)
        if m:
            rows.append({
                "transferor_name": m.group(1).strip(),
                "transfer_date":   m.group(2).strip(),
                "amount":          m.group(3).replace(",", ""),
                "transferee_name": m.group(4).strip(),
            })
    return pd.DataFrame(rows)


def probe_transfer_endpoint(
    probe_comname: str,
    logger,
    session: requests.Session,
) -> tuple[dict, str]:
    """
    Try FundXfers.exe probe variants. Returns (params_template, response_format).
    response_format is 'tsv' or 'html'. Raises RuntimeError if none succeed.
    """
    logger.info(f"Probing transfer endpoint: {TRANSFER_CGI}")
    logger.info(f"  Probe committee name: {probe_comname!r}")

    for i, variant in enumerate(_TRANSFER_PROBE_VARIANTS, 1):
        params = {k: v.replace("{comname}", probe_comname) for k, v in variant.items()}
        logger.debug(f"  Variant {i}: {params}")
        try:
            resp = session.post(TRANSFER_CGI, data=params, timeout=REQUEST_TIMEOUT)
            if resp.status_code == 502:
                raise RuntimeError(
                    "FL DOE FundXfers CGI returned 502 Bad Gateway — "
                    "likely a bad parameter combination. Check probe variants."
                )
            resp.raise_for_status()
            text = resp.content.decode(FL_ENCODING, errors="replace")

            if _looks_like_tsv(text):
                logger.info(f"  Probe succeeded with variant {i} (TSV format).")
                for line in text.strip().splitlines()[:3]:
                    logger.info(f"    {line[:120]}")
                return variant, "tsv"
            elif _looks_like_html_data_table(text):
                logger.info(f"  Probe succeeded with variant {i} (HTML format).")
                return variant, "html"
            elif _looks_like_plaintext_report(text):
                logger.info(f"  Probe succeeded with variant {i} (plain-text format).")
                for line in text.strip().splitlines()[:3]:
                    logger.info(f"    {line[:120]}")
                return variant, "plaintext"
            else:
                snippet = text[:200].replace("\n", " ")
                logger.debug(f"  Variant {i}: unrecognized response — {snippet!r}")

        except RuntimeError:
            raise
        except requests.RequestException as e:
            logger.debug(f"  Variant {i} request error: {e}")

        time.sleep(0.5)

    raise RuntimeError(
        f"Could not get usable data from {TRANSFER_CGI}.\n"
        "None of the probe variants returned recognizable TSV or HTML.\n"
        "Check the endpoint in config.py or inspect network traffic at:\n"
        "  https://dos.elections.myflorida.com/campaign-finance/transfers/"
    )


def fetch_transfer_page(
    comname: str,
    row_offset: int,
    params_template: dict,
    session: requests.Session,
    logger,
) -> str:
    """POST to FundXfers.exe for comname at row_offset. Retries on failure."""
    params = {k: v.replace("{comname}", comname) for k, v in params_template.items()}
    params["seqnum"] = str(row_offset)

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = session.post(TRANSFER_CGI, data=params, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            text = resp.content.decode(FL_ENCODING, errors="replace")
            time.sleep(REQUEST_DELAY_SEC)
            return text
        except requests.RequestException as e:
            logger.warning(f"    fetch attempt {attempt}/{MAX_RETRIES} failed: {e}")
            if attempt == MAX_RETRIES:
                raise RuntimeError(
                    f"Failed to fetch transfer page (offset={row_offset}) "
                    f"after {MAX_RETRIES} attempts: {e}"
                )
            time.sleep(REQUEST_DELAY_SEC * attempt)
    return ""


def download_transfer_pages(
    acct_num: str,
    comname: str,
    dest_path: Path,
    params_template: dict,
    response_format: str,
    session: requests.Session,
    manifest: dict,
    logger,
    force: bool = False,
) -> dict:
    """Download all pages of transfer records for one committee."""
    if not force and manifest.get(acct_num, {}).get("status") == "complete":
        return manifest[acct_num]

    all_frames: list[pd.DataFrame] = []
    row_offset = 0
    page_num = 0

    while True:
        logger.debug(f"  {acct_num}: page {page_num + 1} (offset={row_offset})")
        try:
            raw = fetch_transfer_page(comname, row_offset, params_template, session, logger)
        except RuntimeError as e:
            entry = {"status": "error", "error": str(e), "last_updated": datetime.now().isoformat()}
            manifest[acct_num] = entry
            save_manifest(manifest, MANIFEST_PATH)
            raise

        if response_format == "html":
            page_df = parse_html_page(raw)
        elif response_format == "plaintext":
            page_df = parse_plaintext_page(raw)
        else:
            page_df = parse_tsv_page(raw, expect_header=(page_num == 0))

        if page_df.empty:
            break

        all_frames.append(page_df)
        rows_this_page = len(page_df)
        logger.debug(f"  {acct_num}: page {page_num + 1} → {rows_this_page} rows")

        if rows_this_page < PAGE_ROW_LIMIT:
            break  # last page

        row_offset += PAGE_ROW_LIMIT
        page_num += 1

    if all_frames:
        combined = pd.concat(all_frames, ignore_index=True)
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        combined.to_csv(dest_path, sep="\t", index=False, encoding=FL_ENCODING)
        entry = {
            "status": "complete",
            "rows": len(combined),
            "pages": page_num + 1,
            "last_updated": datetime.now().isoformat(),
        }
    else:
        entry = {
            "status": "empty",
            "rows": 0,
            "pages": 0,
            "last_updated": datetime.now().isoformat(),
        }

    manifest[acct_num] = entry
    save_manifest(manifest, MANIFEST_PATH)
    return entry


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


def main(force: bool = False, limit: int | None = None) -> int:
    logger = setup_logging("11_scrape_transfers")
    logger.info("=== Script 11: Scrape Fund Transfers ===")
    logger.info(f"Endpoint: {TRANSFER_CGI}")

    TRANSFERS_RAW.mkdir(parents=True, exist_ok=True)

    committees = load_committees(limit=limit)
    if not committees:
        logger.error("No committees found. Run 05_import_registry.py first.")
        return 1

    logger.info(f"Committees to process: {len(committees):,}")

    # Use RPOF as probe committee (known to have lots of data)
    probe_name = next(
        (name for _, name in committees if "REPUBLICAN PARTY" in str(name).upper()),
        committees[0][1],
    )

    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": "https://dos.elections.myflorida.com/campaign-finance/transfers/",
    })

    try:
        params_template, response_format = probe_transfer_endpoint(probe_name, logger, session)
    except RuntimeError as e:
        logger.error(str(e))
        return 1

    logger.info(f"Response format: {response_format}")

    manifest = load_manifest(MANIFEST_PATH)
    total = len(committees)
    completed = errors = skipped = empty = 0

    for i, (acct_num, name) in enumerate(committees, 1):
        safe_name = acct_num.replace(" ", "_").replace("/", "_")
        dest = TRANSFERS_RAW / f"Transfer_{safe_name}.txt"

        if not force and manifest.get(acct_num, {}).get("status") == "complete":
            skipped += 1
            logger.info(f"[{i}/{total}] {acct_num} — skipped (already complete)")
            continue

        logger.info(f"[{i}/{total}] {acct_num}  {name[:60]}")

        try:
            entry = download_transfer_pages(
                acct_num, name, dest, params_template, response_format,
                session, manifest, logger, force=force,
            )
            if entry["status"] == "complete":
                completed += 1
                logger.info(f"  → {entry['rows']:,} rows ({entry['pages']} page(s))")
            else:
                empty += 1
                logger.info(f"  → no transfers found")
        except Exception as e:
            errors += 1
            logger.error(f"  FAILED: {e}")
            manifest[acct_num] = {
                "status": "error",
                "error": str(e),
                "last_updated": datetime.now().isoformat(),
            }
            save_manifest(manifest, MANIFEST_PATH)

    logger.info(
        f"\nDone. completed={completed}, empty={empty}, skipped={skipped}, errors={errors}"
    )
    logger.info(f"Files written to: {TRANSFERS_RAW}")
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
