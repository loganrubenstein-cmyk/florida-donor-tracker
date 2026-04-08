# scripts/15_import_lobbyists.py
"""
Script 15: Import FL lobbyist registration files into processed CSVs.

Reads llob.txt (legislative) and elob.txt (executive) from data/raw/lobbyists/
and produces three normalized CSVs in data/processed/:

  lobbyist_registrations.csv — one row per lobbyist↔principal registration
      Fields: lobbyist_name, principal_name, firm_name, branch,
              eff_date, wd_date, is_active, principal_naics

  lobbyists.csv — one row per unique lobbyist
      Fields: lobbyist_name, lobbyist_last, lobbyist_first, lobbyist_middle,
              firm_name, city, state, phone

  principals.csv — one row per unique principal (the employers of lobbyists)
      Fields: principal_name, principal_naics, city, state, country
              total_lobbyists (count of registered lobbyists for this principal)

The "Connection" feature uses lobbyist_registrations.csv to answer:
  "Does Principal X fund Candidate Y AND retain lobbyists on bills before Y's committee?"

Usage (from project root, with .venv activated):
    python scripts/15_import_lobbyists.py
    python scripts/15_import_lobbyists.py --force
"""

import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import LOBBYIST_RAW, PROCESSED_DIR, FL_ENCODING

# Flat rename: pandas auto-suffixes duplicate column names (.1, .2 etc).
# Inspected from actual llob.txt / elob.txt (36 columns, 1 blank trailing).
_COLUMN_RENAME = {
    # Lobbyist
    "Last Name":           "lob_last",
    "First Name":          "lob_first",
    "Middle Name/Initial": "lob_middle",
    "Suffix":              "lob_suffix",
    "Address":             "lob_addr1",
    "Address.1":           "lob_addr2",
    "Address.2":           "lob_addr3",
    "City":                "lob_city",
    "State":               "lob_state",
    "ZIP":                 "lob_zip",
    "Phone":               "lob_phone",
    "Ext":                 "lob_phone_ext",
    "Suspended":           "suspended",
    # Registration / Principal
    "Principal Name":      "principal_name",
    "Eff Date":            "reg_eff_date",
    "WD Date":             "reg_wd_date",
    "Address.3":           "prin_addr1",
    "Address.4":           "prin_addr2",
    "City.1":              "prin_city",
    "State.1":             "prin_state",
    "ZIP.1":               "prin_zip",
    "Country":             "prin_country",
    "NAICS":               "principal_naics",
    # Firm
    "Firm Name":           "firm_name",
    "Address.5":           "firm_addr1",
    "Address.6":           "firm_addr2",
    "City.2":              "firm_city",
    "State.2":             "firm_state",
    "ZIP.2":               "firm_zip",
    "Country.1":           "firm_country",
    "Cntry Prefix":        "firm_phone_prefix",
    "Phone.1":             "firm_phone",
    "Ext.1":               "firm_phone_ext",
    "Eff Date.1":          "firm_eff_date",
    "WD Date.1":           "firm_wd_date",
}


def load_raw_file(path: Path, branch: str) -> pd.DataFrame:
    """
    Read one lobbyist file. File structure:
      Row 0: title ("2014 Legislative Registrations ...")
      Row 1: section grouping (Lobbyist / Registration / Firm)
      Row 2: column headers (tab-delimited)
      Row 3+: data
    pandas auto-suffixes duplicate column names (.1, .2, ...).
    """
    print(f"  Reading {path.name} ({branch}) ...", flush=True)
    df = pd.read_csv(
        path,
        sep="\t",
        dtype=str,
        encoding=FL_ENCODING,
        skiprows=2,
        header=0,
        on_bad_lines="warn",
    )
    df.columns = [c.strip() for c in df.columns]
    df = df.rename(columns=_COLUMN_RENAME)
    # Drop blank trailing column if present
    df = df.loc[:, df.columns != ""]
    df = df.fillna("").apply(lambda col: col.str.strip() if col.dtype == object else col)
    df["branch"] = branch
    return df


def build_lobbyist_name(row) -> str:
    """Combine last + first (+ middle if present) into a canonical full name."""
    parts = [row["lob_last"], row["lob_first"]]
    if row.get("lob_middle", ""):
        parts.append(row["lob_middle"])
    return " ".join(p for p in parts if p).upper()


def build_registrations(df: pd.DataFrame) -> pd.DataFrame:
    """
    Produce the lobbyist_registrations table: one row per lobbyist↔principal pair.
    Drops rows missing lobbyist name or principal name.
    """
    out = df.copy()
    out["lobbyist_name"] = out.apply(build_lobbyist_name, axis=1)
    out["is_active"] = out["reg_wd_date"].eq("")

    # Parse dates
    for col in ("reg_eff_date", "reg_wd_date", "firm_eff_date", "firm_wd_date"):
        out[col] = pd.to_datetime(out[col], format="%m/%d/%Y", errors="coerce")

    result = out[[
        "lobbyist_name", "principal_name", "firm_name", "branch",
        "reg_eff_date", "reg_wd_date", "is_active", "principal_naics",
        "lob_city", "lob_state",
    ]].rename(columns={"lob_city": "lobbyist_city", "lob_state": "lobbyist_state"})

    # Drop rows with no lobbyist name or principal
    result = result[result["lobbyist_name"].str.len() > 0]
    result = result[result["principal_name"].str.len() > 0]
    return result.reset_index(drop=True)


def build_lobbyists(df: pd.DataFrame) -> pd.DataFrame:
    """
    Deduplicated lobbyist table: one row per unique lobbyist name.
    Keeps the most recent firm association.
    """
    df["lobbyist_name"] = df.apply(build_lobbyist_name, axis=1)
    df["reg_eff_date"] = pd.to_datetime(df["reg_eff_date"], format="%m/%d/%Y", errors="coerce")

    # Keep most recent row per lobbyist (latest eff_date)
    latest = (
        df.sort_values("reg_eff_date", ascending=False)
          .drop_duplicates(subset="lobbyist_name", keep="first")
    )
    return latest[[
        "lobbyist_name", "lob_last", "lob_first", "lob_middle",
        "firm_name", "lob_city", "lob_state", "lob_phone",
    ]].rename(columns={
        "lob_last": "lobbyist_last", "lob_first": "lobbyist_first",
        "lob_middle": "lobbyist_middle", "lob_city": "city",
        "lob_state": "state", "lob_phone": "phone",
    }).reset_index(drop=True)


def build_principals(df: pd.DataFrame) -> pd.DataFrame:
    """
    Deduplicated principal table: one row per unique principal name.
    Includes NAICS code and total registered lobbyist count.
    """
    df["principal_name_upper"] = df["principal_name"].str.upper().str.strip()

    total_lobs = (
        df.groupby("principal_name_upper")
          .apply(lambda g: g.apply(build_lobbyist_name, axis=1).nunique())
          .reset_index()
          .rename(columns={0: "total_lobbyists", "principal_name_upper": "_key"})
    )

    latest = (
        df.sort_values("reg_eff_date", ascending=False)
          .drop_duplicates(subset="principal_name_upper", keep="first")
    )
    result = latest[[
        "principal_name", "principal_naics",
        "prin_city", "prin_state", "prin_country",
    ]].rename(columns={
        "prin_city": "city", "prin_state": "state", "prin_country": "country",
    }).copy()
    result["_key"] = result["principal_name"].str.upper().str.strip()
    result = result.merge(total_lobs, on="_key", how="left").drop(columns="_key")
    result["total_lobbyists"] = result["total_lobbyists"].fillna(1).astype(int)
    return result.reset_index(drop=True)


def main(force: bool = False) -> int:
    print("=== Script 15: Import Lobbyist Registrations ===\n")

    out_regs  = PROCESSED_DIR / "lobbyist_registrations.csv"
    out_lobs  = PROCESSED_DIR / "lobbyists.csv"
    out_prins = PROCESSED_DIR / "principals.csv"

    if all(p.exists() for p in (out_regs, out_lobs, out_prins)) and not force:
        print("Skipped — all lobbyist CSVs exist (use --force to rebuild)")
        return 0

    files = [
        (LOBBYIST_RAW / "llob.txt", "legislative"),
        (LOBBYIST_RAW / "elob.txt", "executive"),
    ]

    frames = []
    for path, branch in files:
        if not path.exists():
            print(f"  WARNING: {path.name} not found — skipping {branch} lobbyists.")
            print(f"  Run: python scripts/14_download_lobbyists.py")
            continue
        frames.append(load_raw_file(path, branch))

    if not frames:
        print("ERROR: No lobbyist files found. Run 14_download_lobbyists.py first.",
              file=sys.stderr)
        return 1

    df = pd.concat(frames, ignore_index=True)
    print(f"  Total raw rows: {len(df):,}\n")

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    print("Building lobbyist_registrations.csv ...", flush=True)
    regs = build_registrations(df)
    regs.to_csv(out_regs, index=False)
    print(f"  {len(regs):,} registrations → {out_regs.name}")

    print("Building lobbyists.csv ...", flush=True)
    lobs = build_lobbyists(df)
    lobs.to_csv(out_lobs, index=False)
    print(f"  {len(lobs):,} unique lobbyists → {out_lobs.name}")

    print("Building principals.csv ...", flush=True)
    prins = build_principals(df)
    prins.to_csv(out_prins, index=False)
    print(f"  {len(prins):,} unique principals → {out_prins.name}")

    print("\n=== SUMMARY ===")
    print(f"Total registrations:   {len(regs):,}")
    print(f"Active registrations:  {regs['is_active'].sum():,}")
    print(f"Unique lobbyists:      {regs['lobbyist_name'].nunique():,}")
    print(f"Unique principals:     {regs['principal_name'].nunique():,}")
    print(f"Unique firms:          {regs['firm_name'].nunique():,}")

    branch_counts = regs["branch"].value_counts()
    for branch, count in branch_counts.items():
        print(f"  {branch}: {count:,} registrations")

    print(f"\nTop 10 principals by lobbyist count:")
    top = prins.sort_values("total_lobbyists", ascending=False).head(10)
    for _, row in top.iterrows():
        print(f"  {row['total_lobbyists']:3d}  {row['principal_name'][:60]}")

    print("\nNext: python scripts/16_match_principals.py")
    return 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(main(force=force))
