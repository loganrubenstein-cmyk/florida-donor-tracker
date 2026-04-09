# scripts/36_import_candidate_expenditures.py
"""
Script 36: Import candidate expenditure files into a single clean CSV.

Mirrors script 07 (committee expenditure importer) but reads from
data/raw/candidate_expenditures/ instead of data/raw/expenditures/.

Includes a 1990-2099 date sanity filter (lesson learned from script 07 which
produced dirty 2999 dates that had to be dropped downstream in script 34).

Output: data/processed/candidate_expenditures.csv

Usage (from project root, with .venv activated):
    python scripts/36_import_candidate_expenditures.py
"""

import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR, FL_ENCODING

CAND_EXPEND_RAW = Path(__file__).resolve().parent.parent / "data" / "raw" / "candidate_expenditures"
OUTPUT_FILE     = PROCESSED_DIR / "candidate_expenditures.csv"

MIN_YEAR = 1990
MAX_YEAR = 2099

# Same column names as committee expenditures — the FL DOE CGI produces
# identical headers for both committee and candidate expenditure queries.
COLUMN_RENAME: dict = {
    "Rpt Yr":          "report_year",
    "Rpt Type":        "report_type",
    "Date":            "expenditure_date",
    "Amount":          "amount",
    "Expense Paid To": "vendor_name",
    "Address":         "vendor_address",
    "City State Zip":  "vendor_city_state_zip",
    "Purpose":         "purpose",
    "Typ Reimb":       "type_code",
}

DATE_COLUMN   = "expenditure_date"
AMOUNT_COLUMN = "amount"

# Extract acct_num from filename: CandExpend_88747.txt → "88747"
_ACCT_RE = re.compile(r"CandExpend_(\d+)\.txt", re.IGNORECASE)


def parse_amount(value) -> float:
    """Convert '$1,250.00' or '(50.00)' to float. Parentheses = negative refund."""
    if pd.isna(value):
        return 0.0
    s = str(value).strip()
    if not s:
        return 0.0
    negative = s.startswith("(") and s.endswith(")")
    s = s.replace("$", "").replace(",", "").replace("(", "").replace(")", "")
    try:
        n = float(s)
    except ValueError:
        return 0.0
    return -n if negative else n


def load_one_file(path: Path) -> pd.DataFrame:
    """Read one FL DOE tab-delimited candidate expenditure file into a clean DataFrame."""
    m = _ACCT_RE.search(path.name)
    acct_num = m.group(1) if m else None

    df = pd.read_csv(
        path,
        sep="\t",
        dtype=str,
        encoding=FL_ENCODING,
        on_bad_lines="warn",
    )
    df.columns = [c.strip() for c in df.columns]

    rename = {k: v for k, v in COLUMN_RENAME.items() if k in df.columns}
    df = df.rename(columns=rename)

    if DATE_COLUMN in df.columns:
        df[DATE_COLUMN] = pd.to_datetime(df[DATE_COLUMN], errors="coerce")
        # Date sanity filter — drop rows outside valid range
        years = df[DATE_COLUMN].dt.year
        bad = years.isna() | (years < MIN_YEAR) | (years > MAX_YEAR)
        if bad.any():
            df = df.loc[~bad].copy()

    if AMOUNT_COLUMN in df.columns:
        df[AMOUNT_COLUMN] = df[AMOUNT_COLUMN].apply(parse_amount)

    df["source_file"] = path.name
    df["acct_num"]    = acct_num
    return df


def main() -> int:
    print("=== Script 36: Import Candidate Expenditures ===\n")

    if not CAND_EXPEND_RAW.exists():
        print(f"ERROR: {CAND_EXPEND_RAW} does not exist. Run script 35 first.")
        return 1

    files = sorted(f for f in CAND_EXPEND_RAW.glob("CandExpend_*.txt"))
    if not files:
        print(f"No CandExpend_*.txt files in {CAND_EXPEND_RAW}.")
        print("Run script 35 first to download candidate expenditure data.")
        return 0

    print(f"Found {len(files):,} candidate expenditure file(s)")
    print("Loading files ...", flush=True)

    frames = []
    skipped_empty = 0
    for path in files:
        try:
            df = load_one_file(path)
            if df.empty:
                skipped_empty += 1
            else:
                frames.append(df)
        except Exception as e:
            print(f"  WARNING: could not read {path.name}: {e}")

    if not frames:
        print("No data found across all files.")
        return 0

    combined = pd.concat(frames, ignore_index=True)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    combined.to_csv(OUTPUT_FILE, index=False)

    print(f"\nWrote {len(combined):,} rows to {OUTPUT_FILE}")
    print(f"Skipped {skipped_empty:,} empty files")

    print("\n=== SUMMARY ===")
    print(f"Total expenditures: {len(combined):,}")
    if AMOUNT_COLUMN in combined.columns:
        print(f"Total amount:       ${combined[AMOUNT_COLUMN].sum():,.2f}")
    if DATE_COLUMN in combined.columns:
        valid = combined[DATE_COLUMN].dropna()
        if len(valid):
            print(f"Date range:         {valid.min().date()} to {valid.max().date()}")
    if "acct_num" in combined.columns:
        print(f"Unique candidates:  {combined['acct_num'].nunique():,}")
    if "vendor_name" in combined.columns:
        print("\nTop 10 vendors by row count:")
        print(combined["vendor_name"].value_counts().head(10).to_string())

    return 0


if __name__ == "__main__":
    sys.exit(main())
