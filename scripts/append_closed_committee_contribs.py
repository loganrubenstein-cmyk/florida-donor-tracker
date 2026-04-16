#!/usr/bin/env python3
"""
append_closed_committee_contribs.py

Appends contribution rows for specific closed committees (whose raw Contrib_*.txt
files were scraped by script 02b AFTER script 01 last ran) to the existing
data/processed/contributions.csv.

This avoids re-running script 01 on all 4,000+ raw files. After running this,
script 41 will detect the new source_file entries (not in its manifest) and load
only those rows into Supabase.

Usage:
    .venv/bin/python scripts/append_closed_committee_contribs.py

Add new acct_nums to ACCTS_TO_APPEND as more closed committees are scraped.
"""

import csv
import sys
from pathlib import Path

import pandas as pd

PROJECT_ROOT  = Path(__file__).resolve().parent.parent
RAW_DIR       = PROJECT_ROOT / "data" / "raw" / "contributions"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
OUTPUT_FILE   = PROCESSED_DIR / "contributions.csv"

# Committees to append — add acct_num here when a new closed committee is scraped
# after the last script 01 run.  Empties (header-only files) are auto-skipped.
# Batch scraped by script 02b on 2026-04-15:
ACCTS_TO_APPEND = [
    "70275",  # Friends of Ron DeSantis (now Empower Parents PAC) — 76,479 rows
    "78992",  # ~2 rows
    "78993",  # ~1 row
    "78994",  # ~2 rows
    "78995",  # ~1 row
    "78996",  # ~45 rows
    "78997",  # ~57 rows
    "78998",  # ~8 rows
    "78999",  # ~17 rows
    "79003",  # ~2 rows
    "79006",  # ~15 rows
    "79010",  # ~20 rows
    "79012",  # ~10 rows
    "79014",  # ~105 rows
    "79015",  # ~16 rows
    "79086",  # ~4 rows
    # 78991, 79011, 79013, 79064 — header-only, auto-skipped
]

COLUMN_RENAME = {
    "Rpt Yr":           "report_year",
    "Rpt Type":         "report_type",
    "Date":             "contribution_date",
    "Amount":           "amount",
    "Contributor Name": "contributor_name",
    "Address":          "contributor_address",
    "City State Zip":   "contributor_city_state_zip",
    "Occupation":       "contributor_occupation",
    "Typ":              "type_code",
    "InKind Desc":      "in_kind_description",
}

_RAW_COLS = ["Rpt Yr", "Rpt Type", "Date", "Amount", "Contributor Name",
             "Address", "City State Zip", "Occupation", "Typ", "InKind Desc"]

_KNOWN_HEADER_STARTS = {"rpt yr", "rpt type", "date", "report_year", "report_type"}

OUTPUT_COLS = [
    "report_year", "report_type", "contribution_date", "amount",
    "contributor_name", "contributor_address", "contributor_city_state_zip",
    "contributor_occupation", "type_code", "in_kind_description", "source_file",
]


def _has_header(path: Path) -> bool:
    try:
        with open(path, encoding="latin-1", errors="replace") as f:
            first = f.readline().split("\t")[0].strip().lower()
        return first in _KNOWN_HEADER_STARTS
    except Exception:
        return True


def load_one_file(path: Path) -> pd.DataFrame:
    print(f"  Reading {path.name} ...", flush=True)
    has_hdr = _has_header(path)
    read_kwargs = dict(
        sep="\t",
        dtype=str,
        encoding="latin-1",
        on_bad_lines="warn",
        quoting=csv.QUOTE_NONE,
    )
    if not has_hdr:
        read_kwargs["header"] = None
        read_kwargs["names"] = _RAW_COLS
        print("    (no header — using fixed column names)", flush=True)

    df = pd.read_csv(path, **read_kwargs)
    df.columns = [c.strip() for c in df.columns]
    df = df.rename(columns=COLUMN_RENAME)

    # Parse date to ISO format string (YYYY-MM-DD) matching existing CSV
    if "contribution_date" in df.columns:
        df["contribution_date"] = pd.to_datetime(
            df["contribution_date"], errors="coerce"
        ).dt.strftime("%Y-%m-%d")

    # Parse amount to float
    if "amount" in df.columns:
        def parse_amt(v):
            if pd.isna(v): return 0.0
            s = str(v).strip()
            neg = s.startswith("(") and s.endswith(")")
            s = s.replace("$","").replace(",","").replace("(","").replace(")","")
            try: n = float(s)
            except ValueError: return 0.0
            return -n if neg else n
        df["amount"] = df["amount"].apply(parse_amt)

    df["source_file"] = path.name

    # Ensure output columns exist and are in correct order
    for col in OUTPUT_COLS:
        if col not in df.columns:
            df[col] = ""
    return df[OUTPUT_COLS]


def main() -> int:
    if not OUTPUT_FILE.exists():
        print(f"ERROR: {OUTPUT_FILE} not found. Run script 01 first.", file=sys.stderr)
        return 1

    total_appended = 0
    for acct in ACCTS_TO_APPEND:
        raw_path = RAW_DIR / f"Contrib_{acct}.txt"
        if not raw_path.exists():
            print(f"SKIP {acct}: {raw_path.name} not found")
            continue

        size = raw_path.stat().st_size
        if size < 300:
            print(f"SKIP {acct}: file is empty (header only, {size} bytes)")
            continue

        df = load_one_file(raw_path)
        print(f"  → {len(df):,} rows parsed", flush=True)

        # Append without header
        df.to_csv(OUTPUT_FILE, mode="a", index=False, header=False)
        print(f"  → Appended to {OUTPUT_FILE.name}", flush=True)
        total_appended += len(df)

    print(f"\nDone. Total rows appended: {total_appended:,}")
    print("\nNext steps:")
    print("  1. Run script 41 to load new rows into Supabase:")
    print("     .venv/bin/python -u scripts/41_load_contributions.py")
    print("  2. Run script 30 to update committee metadata:")
    print("     .venv/bin/python -u scripts/30_export_committee_index.py")
    print("  3. Run script 09 (optional, slow) to update donor dedup index")
    return 0


if __name__ == "__main__":
    sys.exit(main())
