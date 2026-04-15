# scripts/01_import_finance.py
"""
Script 01: Import Florida Division of Elections campaign-finance contribution files.

Reads tab-delimited .txt files from data/raw/contributions/, normalizes them
into a single clean CSV at data/processed/contributions.csv, and prints a
summary so you can sanity-check the import.

Usage (from project root, with .venv activated):
    python scripts/01_import_finance.py
"""

from pathlib import Path
import csv
import sys
import pandas as pd

# --- Paths ---------------------------------------------------------------
PROJECT_ROOT  = Path(__file__).resolve().parent.parent
RAW_DIR       = PROJECT_ROOT / "data" / "raw" / "contributions"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
OUTPUT_FILE   = PROCESSED_DIR / "contributions.csv"

# --- Column mapping (raw FL DOE name → clean snake_case name) ------------
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

DATE_COLUMN   = "contribution_date"
AMOUNT_COLUMN = "amount"


def parse_amount(value) -> float:
    """Convert a string like '$1,250.00' or '(50.00)' to a float.
    Parentheses indicate a negative refund."""
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


# Raw column names in the correct order (for headerless files from closed-committee scrape)
_RAW_COLS = ["Rpt Yr", "Rpt Type", "Date", "Amount", "Contributor Name",
             "Address", "City State Zip", "Occupation", "Typ", "InKind Desc"]

_KNOWN_HEADER_STARTS = {"rpt yr", "rpt type", "date", "report_year", "report_type"}


def _has_header(path: Path) -> bool:
    """Return True if the file's first row looks like a header (not a data row)."""
    try:
        with open(path, encoding="latin-1", errors="replace") as f:
            first = f.readline().split("\t")[0].strip().lower()
        return first in _KNOWN_HEADER_STARTS
    except Exception:
        return True  # assume header on error


def load_one_file(path: Path) -> pd.DataFrame:
    """Read one FL DOE tab-delimited contributions file into a clean DataFrame."""
    print(f"  reading {path.name} ...", flush=True)

    has_hdr = _has_header(path)
    read_kwargs = dict(
        sep="\t",
        dtype=str,
        encoding="latin-1",
        on_bad_lines="warn",
        quoting=csv.QUOTE_NONE,
    )
    if not has_hdr:
        # Headerless files (e.g. closed-committee contribution exports from script 02b)
        read_kwargs["header"] = None
        read_kwargs["names"] = _RAW_COLS
        print(f"    (no header row detected — using fixed column names)", flush=True)

    df = pd.read_csv(path, **read_kwargs)

    # Strip whitespace from column names
    df.columns = [c.strip() for c in df.columns]

    # Rename to snake_case
    df = df.rename(columns=COLUMN_RENAME)

    # Parse date
    if DATE_COLUMN in df.columns:
        df[DATE_COLUMN] = pd.to_datetime(df[DATE_COLUMN], errors="coerce")

    # Parse amount
    if AMOUNT_COLUMN in df.columns:
        df[AMOUNT_COLUMN] = df[AMOUNT_COLUMN].apply(parse_amount)

    # Tag the source file so we know which download each row came from
    df["source_file"] = path.name

    return df


def main() -> int:
    print(f"Looking for raw contribution files in: {RAW_DIR}")
    if not RAW_DIR.exists():
        print(f"  ERROR: {RAW_DIR} does not exist.", file=sys.stderr)
        return 1

    files = sorted(RAW_DIR.glob("*.txt"))
    if not files:
        print(f"  ERROR: no .txt files found in {RAW_DIR}.", file=sys.stderr)
        return 1

    print(f"Found {len(files)} file(s):")
    for f in files:
        print(f"  - {f.name}")

    print("\nLoading files...")
    frames = [load_one_file(f) for f in files]
    df = pd.concat(frames, ignore_index=True)

    # Write cleaned output
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT_FILE, index=False)
    print(f"\nWrote {len(df):,} rows to {OUTPUT_FILE}")

    # Summary
    print("\n=== SUMMARY ===")
    print(f"Total contributions:  {len(df):,}")
    if AMOUNT_COLUMN in df.columns:
        total = df[AMOUNT_COLUMN].sum()
        print(f"Total dollar amount:  ${total:,.2f}")
    if DATE_COLUMN in df.columns:
        valid_dates = df[DATE_COLUMN].dropna()
        if len(valid_dates):
            print(f"Date range:           {valid_dates.min().date()} to {valid_dates.max().date()}")
    if "contributor_name" in df.columns:
        print("\nTop 10 contributor names by raw row count (no dedup yet):")
        print(df["contributor_name"].value_counts().head(10).to_string())

    return 0


if __name__ == "__main__":
    sys.exit(main())
