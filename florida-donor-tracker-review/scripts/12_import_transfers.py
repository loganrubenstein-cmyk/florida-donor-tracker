# scripts/12_import_transfers.py
"""
Script 12: Import FL DOE fund transfer files into a single clean CSV.

Reads tab-delimited .txt files from data/raw/transfers/ (produced by
script 11) and consolidates them into data/processed/transfers.csv.

Fund transfers represent money moved from one political entity to another:
  PC → PC, PC → Candidate, Candidate → PC

These are the "laundering layer" — often the actual path money takes from
a donor to a candidate via one or more political committees as intermediaries.

Usage (from project root, with .venv activated):
    python scripts/12_import_transfers.py
"""

from pathlib import Path
import sys
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import TRANSFERS_RAW, PROCESSED_DIR, FL_ENCODING

OUTPUT_FILE = PROCESSED_DIR / "transfers.csv"

# Possible column names from FundXfers.exe (discovered from first downloaded file).
# Keys are raw FL DOE column names; values are our internal snake_case names.
# FundXfers.exe column names are not publicly documented so we handle variants.
COLUMN_RENAME = {
    # Transferor (sender)
    "Transferor Name":      "transferor_name",
    "From Name":            "transferor_name",
    "Candidate/Committee":  "transferor_name",
    "CanComName":           "transferor_name",
    # Transferee (recipient)
    "Transferee Name":      "transferee_name",
    "To Name":              "transferee_name",
    "Candidate/Com Name":   "transferee_name",
    "Name":                 "transferee_name",
    # Amount
    "Amount":               "amount",
    "Amt":                  "amount",
    # Date
    "Date":                 "transfer_date",
    "Xfer Date":            "transfer_date",
    # Report fields
    "Rpt Yr":               "report_year",
    "Rpt Type":             "report_type",
    # Address of transferee
    "Address":              "transferee_address",
    "City State Zip":       "transferee_city_state_zip",
    # Transfer type / purpose
    "Typ":                  "type_code",
    "Type":                 "type_code",
    "InKind Desc":          "in_kind_description",
}


def parse_amount(value) -> float:
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
    print(f"  reading {path.name} ...", flush=True)
    df = pd.read_csv(
        path,
        sep="\t",
        dtype=str,
        encoding=FL_ENCODING,
        on_bad_lines="warn",
    )
    df.columns = [c.strip() for c in df.columns]
    df = df.rename(columns={k: v for k, v in COLUMN_RENAME.items() if k in df.columns})

    if "transfer_date" in df.columns:
        df["transfer_date"] = pd.to_datetime(df["transfer_date"], errors="coerce")

    if "amount" in df.columns:
        df["amount"] = df["amount"].apply(parse_amount)

    df["source_file"] = path.name
    return df


def main() -> int:
    print(f"Looking for raw transfer files in: {TRANSFERS_RAW}")

    if not TRANSFERS_RAW.exists():
        print(f"  ERROR: {TRANSFERS_RAW} does not exist.", file=sys.stderr)
        print("  Run script 11 first to download transfer records.", file=sys.stderr)
        return 1

    files = sorted(TRANSFERS_RAW.glob("Transfer_*.txt"))
    if not files:
        print(f"  No Transfer_*.txt files found in {TRANSFERS_RAW}.", file=sys.stderr)
        print("  Run: python scripts/11_scrape_transfers.py", file=sys.stderr)
        return 1

    print(f"Found {len(files):,} file(s). Loading...")

    frames = []
    for f in files:
        try:
            df = load_one_file(f)
            if not df.empty:
                frames.append(df)
        except Exception as e:
            print(f"  WARNING: could not read {f.name}: {e}", file=sys.stderr)

    if not frames:
        print("ERROR: No usable data found in any transfer file.", file=sys.stderr)
        return 1

    combined = pd.concat(frames, ignore_index=True)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    combined.to_csv(OUTPUT_FILE, index=False)
    print(f"\nWrote {len(combined):,} rows to {OUTPUT_FILE}")

    print("\n=== SUMMARY ===")
    print(f"Total transfer records: {len(combined):,}")
    if "amount" in combined.columns:
        total = combined["amount"].sum()
        print(f"Total dollars transferred: ${total:,.2f}")
    if "transfer_date" in combined.columns:
        valid = combined["transfer_date"].dropna()
        if len(valid):
            print(f"Date range: {valid.min().date()} to {valid.max().date()}")
    if "transferor_name" in combined.columns:
        print(f"\nUnique transferors: {combined['transferor_name'].nunique():,}")
    if "transferee_name" in combined.columns:
        print(f"Unique transferees: {combined['transferee_name'].nunique():,}")
        print("\nTop 10 transfer recipients by row count:")
        print(combined["transferee_name"].value_counts().head(10).to_string())

    print(f"\nActual columns in data: {list(combined.columns)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
