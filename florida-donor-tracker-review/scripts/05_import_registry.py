# scripts/05_import_registry.py
"""
Script 05: ETL for FL Division of Elections registry files.

Reads committees.txt and candidates.txt from data/raw/ and writes
clean CSVs to data/processed/. Mirrors the pattern of 01_import_finance.py.

Must be run after 02_download_registry.py.

Usage (from project root, with .venv activated):
    python scripts/05_import_registry.py
"""

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import (
    COMMITTEES_RAW, CANDIDATES_RAW,
    PROCESSED_DIR,
    COMMITTEE_TYPE_FILTER,
    FL_ENCODING,
)

COMMITTEE_RENAME = {
    "AcctNum":       "acct_num",
    "Name":          "committee_name",
    "Type":          "type_code",
    "TypeDesc":      "type_desc",
    "Addr1":         "addr1",
    "Addr2":         "addr2",
    "City":          "city",
    "State":         "state",
    "Zip":           "zip",
    "County":        "county",
    "Phone":         "phone",
    "ChrNameLast":   "chair_last",
    "ChrNameFirst":  "chair_first",
    "ChrNameMiddle": "chair_middle",
    "TrsNameLast":   "treasurer_last",
    "TrsNameFirst":  "treasurer_first",
    "TrsNameMiddle": "treasurer_middle",
}

CANDIDATE_RENAME = {
    "AcctNum":         "acct_num",
    "VoterID":         "voter_id",
    "ElectionID":      "election_id",
    "OfficeCode":      "office_code",
    "OfficeDesc":      "office_desc",
    "Juris1num":       "juris1",
    "Juris2num":       "juris2",
    "StatusCode":      "status_code",
    "StatusDesc":      "status_desc",
    "PartyCode":       "party_code",
    "PartyName":       "party_name",
    "NameLast":        "last_name",
    "NameFirst":       "first_name",
    "NameMiddle":      "middle_name",
    "SuppressAddress": "suppress_address",
    "Addr1":           "addr1",
    "Addr2":           "addr2",
    "City":            "city",
    "State":           "state",
    "Zip":             "zip",
    "CountyCode":      "county_code",
    "Phone":           "phone",
    "Email":           "email",
    "TrsNameLast":     "treasurer_last",
    "TrsNameFirst":    "treasurer_first",
    "TrsNameMiddle":   "treasurer_middle",
}


def load_registry_file(path: Path, rename_map: dict) -> pd.DataFrame:
    """Read a tab-delimited FL DOE registry file and rename columns to snake_case."""
    print(f"  Reading {path.name} ...", flush=True)
    df = pd.read_csv(
        path,
        sep="\t",
        dtype=str,
        encoding=FL_ENCODING,
        on_bad_lines="warn",
    )
    df.columns = [c.strip() for c in df.columns]
    # Only rename columns that actually exist in the file
    rename = {k: v for k, v in rename_map.items() if k in df.columns}
    df = df.rename(columns=rename)
    return df


def filter_committees(df: pd.DataFrame) -> pd.DataFrame:
    """Apply COMMITTEE_TYPE_FILTER and drop rows with null acct_num."""
    before = len(df)

    # Drop rows with no account number — can't use them for scraping
    df = df[df["acct_num"].notna() & (df["acct_num"].str.strip() != "")]

    if COMMITTEE_TYPE_FILTER:
        df = df[df["type_code"].isin(COMMITTEE_TYPE_FILTER)]
        print(f"  Type filter {COMMITTEE_TYPE_FILTER}: kept {len(df):,} of {before:,} rows")
    else:
        dropped = before - len(df)
        if dropped:
            print(f"  Dropped {dropped} rows with missing acct_num")

    return df


def main() -> int:
    print("=== Script 05: Import Registry Files ===\n")
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    # --- Committees ---
    committees_raw = COMMITTEES_RAW / "committees.txt"
    if not committees_raw.exists():
        print(f"ERROR: {committees_raw} not found. Run 02_download_registry.py first.", file=sys.stderr)
        return 1

    print("[committees]")
    df_committees = load_registry_file(committees_raw, COMMITTEE_RENAME)
    df_committees = filter_committees(df_committees)
    out = PROCESSED_DIR / "committees.csv"
    df_committees.to_csv(out, index=False)
    print(f"  Wrote {len(df_committees):,} rows to {out.name}")

    print("\n  Committee type breakdown:")
    if "type_code" in df_committees.columns and "type_desc" in df_committees.columns:
        type_summary = (
            df_committees.groupby(["type_code", "type_desc"])
            .size()
            .reset_index(name="count")
            .sort_values("count", ascending=False)
        )
        for _, row in type_summary.iterrows():
            print(f"    {row['type_code']:6s} {row['type_desc']:40s} {row['count']:>6,}")
    else:
        print(df_committees["type_code"].value_counts().to_string())

    # --- Candidates ---
    candidates_raw = CANDIDATES_RAW / "candidates.txt"
    if not candidates_raw.exists():
        print(f"\nERROR: {candidates_raw} not found. Run 02_download_registry.py first.", file=sys.stderr)
        return 1

    print("\n[candidates]")
    df_candidates = load_registry_file(candidates_raw, CANDIDATE_RENAME)
    # Drop candidates with no acct_num
    df_candidates = df_candidates[
        df_candidates["acct_num"].notna() & (df_candidates["acct_num"].str.strip() != "")
    ]
    out = PROCESSED_DIR / "candidates.csv"
    df_candidates.to_csv(out, index=False)
    print(f"  Wrote {len(df_candidates):,} rows to {out.name}")

    if "party_name" in df_candidates.columns:
        print("\n  Candidate party breakdown (top 10):")
        print(df_candidates["party_name"].value_counts().head(10).to_string())

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
