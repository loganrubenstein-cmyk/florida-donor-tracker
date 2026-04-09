# scripts/07_import_expenditures.py
"""
Script 07: Import FL Division of Elections expenditure files.

Reads tab-delimited .txt files from data/raw/expenditures/, normalizes them
into a single clean CSV at data/processed/expenditures.csv.

Since expenditure files won't exist until the FL DOE CGI server comes back up,
this script exits cleanly with a message if the folder is empty.

Column names are auto-detected from real files. Once a real file is seen,
update COLUMN_RENAME below with the actual FL DOE column names.

Usage (from project root, with .venv activated):
    python scripts/07_import_expenditures.py
"""

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import EXPEND_RAW, PROCESSED_DIR, FL_ENCODING

OUTPUT_FILE = PROCESSED_DIR / "expenditures.csv"

# Populated once we've seen a real FL DOE expenditure file.
# Keys are exact raw column names (whitespace-stripped); values are snake_case.
# If a raw column isn't in this dict, it passes through as-is.
COLUMN_RENAME: dict = {
    # Actual FL DOE TreFin.exe (queryfor=2) column names:
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
    """Read one FL DOE tab-delimited expenditure file into a clean DataFrame."""
    print(f"  reading {path.name} ...", flush=True)
    df = pd.read_csv(
        path,
        sep="\t",
        dtype=str,
        encoding=FL_ENCODING,
        on_bad_lines="warn",
    )
    df.columns = [c.strip() for c in df.columns]

    # Rename known columns; unknown columns pass through
    rename = {k: v for k, v in COLUMN_RENAME.items() if k in df.columns}
    df = df.rename(columns=rename)

    if DATE_COLUMN in df.columns:
        df[DATE_COLUMN] = pd.to_datetime(df[DATE_COLUMN], errors="coerce")

    if AMOUNT_COLUMN in df.columns:
        df[AMOUNT_COLUMN] = df[AMOUNT_COLUMN].apply(parse_amount)

    df["source_file"] = path.name
    return df


def main() -> int:
    print("=== Script 07: Import Expenditures ===\n")

    if not EXPEND_RAW.exists():
        print(f"  {EXPEND_RAW} does not exist — skipping (run after CGI server is back up)")
        return 0

    files = sorted(EXPEND_RAW.glob("*.txt"))
    if not files:
        print(f"  No .txt files in {EXPEND_RAW} — skipping (run after CGI server is back up)")
        return 0

    print(f"Found {len(files)} expenditure file(s):")
    for f in files:
        print(f"  - {f.name}")

    print("\nLoading files ...")
    frames = [load_one_file(f) for f in files]
    df = pd.concat(frames, ignore_index=True)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT_FILE, index=False)
    print(f"\nWrote {len(df):,} rows to {OUTPUT_FILE}")

    print("\n=== SUMMARY ===")
    print(f"Total expenditures: {len(df):,}")
    if AMOUNT_COLUMN in df.columns:
        print(f"Total amount:       ${df[AMOUNT_COLUMN].sum():,.2f}")
    if DATE_COLUMN in df.columns:
        valid = df[DATE_COLUMN].dropna()
        if len(valid):
            print(f"Date range:         {valid.min().date()} to {valid.max().date()}")
    if "vendor_name" in df.columns:
        print("\nTop 10 vendors by row count:")
        print(df["vendor_name"].value_counts().head(10).to_string())

    # Print actual columns found so user can update COLUMN_RENAME if needed
    unknown = [c for c in df.columns if c not in set(COLUMN_RENAME.values()) | {"source_file"}]
    if unknown:
        print(f"\nNote: these columns were not in COLUMN_RENAME and passed through as-is:")
        for c in unknown:
            print(f"  {c!r}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
