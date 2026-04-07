# scripts/08_export_json.py
"""
Script 08: Export processed data to JSON files for the public website.

Reads from data/processed/ and writes to public/data/.

Outputs:
  public/data/top_donors.json           — top 100 donors by lifetime $
  public/data/top_corporate_donors.json — top 100 corporate donors
  public/data/donor_flows.json          — top 500 donor→committee pairs
  public/data/committees/{acct}.json    — per-committee: top 25 donors
  public/data/meta.json                 — generation timestamp + counts

Usage (from project root, with .venv activated):
    python scripts/08_export_json.py
    python scripts/08_export_json.py --force
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR, PROJECT_ROOT

PUBLIC_DIR = PROJECT_ROOT / "public" / "data"
COMMITTEES_DIR = PUBLIC_DIR / "committees"

# Corporate name keywords (case-insensitive match against full name)
_CORP_KEYWORDS = [
    "INC", "LLC", "CORP", "CO.", "COMPANY", "ASSOCIATION",
    "FOUNDATION", "PAC", "FUND", "TRUST", "GROUP", "ENTERPRISES",
    "SERVICES", "INDUSTRIES", "PARTNERS", "HOLDINGS",
]

# Maps known non-standard source filenames to committee acct_nums
_SOURCE_FILE_MAP: dict = {
    "Contrib_2024_rpof.txt": "4700",
}


def is_corporate(name) -> bool:
    """Return True if the donor name looks like a corporation."""
    if not isinstance(name, str):
        return False
    upper = name.upper()
    return any(kw in upper for kw in _CORP_KEYWORDS)


def build_donor_type(name: str, committees_df: pd.DataFrame) -> str:
    """
    Return 'committee', 'corporate', or 'individual' for a donor name.

    Checks against the normalized committee name list first (case-insensitive,
    strip whitespace). Falls back to is_corporate(), then 'individual'.
    """
    if not isinstance(name, str):
        return "individual"
    name_upper = name.strip().upper()
    committee_names = set(
        committees_df["committee_name"].str.strip().str.upper()
    )
    if name_upper in committee_names:
        return "committee"
    if is_corporate(name):
        return "corporate"
    return "individual"


def derive_committee_acct(source_file: str):
    """
    Extract committee acct_num from a source filename.

    Standard format: "Contrib_{acct_num}.txt" where acct_num may contain
    underscores representing spaces (e.g. "Contrib_PCO_00001.txt" → "PCO 00001").

    Special cases handled via _SOURCE_FILE_MAP.
    """
    if source_file in _SOURCE_FILE_MAP:
        return _SOURCE_FILE_MAP[source_file]
    stem = Path(source_file).stem  # e.g. "Contrib_4700"
    if stem.startswith("Contrib_"):
        raw = stem[len("Contrib_"):]
        return raw.replace("_", " ")
    return None


def build_top_donors(df: pd.DataFrame, committees_df: pd.DataFrame, n: int = 100) -> list:
    """
    Aggregate contributions by canonical_name, return top n by total $.

    Each item: {name, total_amount, num_contributions, is_corporate, type}
    """
    grouped = (
        df.groupby("canonical_name")["amount"]
        .agg(total_amount="sum", num_contributions="count")
        .reset_index()
        .rename(columns={"canonical_name": "name"})
        .sort_values("total_amount", ascending=False)
        .head(n)
    )
    result = []
    for _, row in grouped.iterrows():
        result.append({
            "name": row["name"],
            "total_amount": round(float(row["total_amount"]), 2),
            "num_contributions": int(row["num_contributions"]),
            "is_corporate": is_corporate(row["name"]),
            "type": build_donor_type(row["name"], committees_df),
        })
    return result


def build_top_corporate_donors(df: pd.DataFrame, committees_df: pd.DataFrame, n: int = 100) -> list:
    """Filter to corporate donors, then return top n by total $."""
    corp_df = df[df["canonical_name"].apply(is_corporate)]
    return build_top_donors(corp_df, committees_df, n=n)


def build_donor_flows(
    df: pd.DataFrame,
    committees_df: pd.DataFrame,
    n: int = 500,
) -> list:
    """
    Build donor→committee flow data.

    Derives committee acct_num from source_file column, joins to committees_df
    for the human-readable name. Returns top n pairs by total $.

    Each item: {donor, committee, committee_acct, total_amount, num_contributions}
    """
    work = df.copy()
    work["committee_acct"] = work["source_file"].apply(derive_committee_acct)
    work = work[work["committee_acct"].notna()]

    # Join to get committee_name
    acct_to_name = committees_df.set_index("acct_num")["committee_name"].to_dict()
    work["committee"] = work["committee_acct"].map(acct_to_name).fillna("Unknown")

    grouped = (
        work.groupby(["canonical_name", "committee_acct", "committee"])["amount"]
        .agg(total_amount="sum", num_contributions="count")
        .reset_index()
        .sort_values("total_amount", ascending=False)
        .head(n)
    )

    result = []
    for _, row in grouped.iterrows():
        result.append({
            "donor": row["canonical_name"],
            "committee": row["committee"],
            "committee_acct": row["committee_acct"],
            "total_amount": round(float(row["total_amount"]), 2),
            "num_contributions": int(row["num_contributions"]),
        })
    return result


def build_per_committee_files(
    df: pd.DataFrame,
    committees_df: pd.DataFrame,
) -> dict:
    """
    Build one summary dict per committee.

    Returns {acct_num: {acct_num, committee_name, total_received,
                        num_contributions, date_range, top_donors}}
    """
    work = df.copy()
    work["committee_acct"] = work["source_file"].apply(derive_committee_acct)
    work = work[work["committee_acct"].notna()]

    acct_to_name = committees_df.set_index("acct_num")["committee_name"].to_dict()

    results = {}
    for acct, group in work.groupby("committee_acct"):
        top_donors_grouped = (
            group.groupby("canonical_name")["amount"]
            .agg(total_amount="sum", num_contributions="count")
            .reset_index()
            .rename(columns={"canonical_name": "name"})
            .sort_values("total_amount", ascending=False)
            .head(100)
        )
        top_donors = [
            {
                "name": row["name"],
                "total_amount": round(float(row["total_amount"]), 2),
                "num_contributions": int(row["num_contributions"]),
                "type": build_donor_type(row["name"], committees_df),
            }
            for _, row in top_donors_grouped.iterrows()
        ]

        # Date range from contribution_date column (if present)
        if "contribution_date" in group.columns:
            dates = group["contribution_date"].dropna()
            date_range = {
                "earliest": str(dates.min()) if len(dates) else None,
                "latest":   str(dates.max()) if len(dates) else None,
            }
        else:
            date_range = {"earliest": None, "latest": None}

        results[acct] = {
            "acct_num": acct,
            "committee_name": acct_to_name.get(acct, "Unknown"),
            "total_received": round(float(group["amount"].sum()), 2),
            "num_contributions": int(len(group)),
            "date_range": date_range,
            "top_donors": top_donors,
        }
    return results


def write_json(data, path: Path) -> None:
    """Write data as pretty-printed JSON to path."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def main(force: bool = False) -> int:
    print("=== Script 08: Export JSON ===\n")

    # Load inputs
    deduped_path = PROCESSED_DIR / "contributions_deduped.csv"
    contribs_path = PROCESSED_DIR / "contributions.csv"
    committees_path = PROCESSED_DIR / "committees.csv"

    if deduped_path.exists():
        print(f"Using {deduped_path.name} (deduplicated)")
        df = pd.read_csv(deduped_path, dtype=str, low_memory=False)
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
        if "canonical_name" not in df.columns:
            df["canonical_name"] = df["contributor_name"]
    elif contribs_path.exists():
        print(f"Using {contribs_path.name} (not deduplicated — run 09_deduplicate_donors.py first for best results)")
        df = pd.read_csv(contribs_path, dtype=str, low_memory=False)
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
        df["canonical_name"] = df["contributor_name"]
    else:
        print("ERROR: No contributions data found. Run 01_import_finance.py first.", file=sys.stderr)
        return 1

    if not committees_path.exists():
        print("ERROR: committees.csv not found. Run 05_import_registry.py first.", file=sys.stderr)
        return 1

    committees_df = pd.read_csv(committees_path, dtype=str)
    print(f"Loaded {len(df):,} contributions, {len(committees_df):,} committees\n")

    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    COMMITTEES_DIR.mkdir(parents=True, exist_ok=True)

    # Top donors
    print("Building top_donors.json ...", flush=True)
    top_donors = build_top_donors(df, committees_df)
    write_json(top_donors, PUBLIC_DIR / "top_donors.json")
    print(f"  {len(top_donors)} donors")

    # Top corporate donors
    print("Building top_corporate_donors.json ...", flush=True)
    top_corp = build_top_corporate_donors(df, committees_df)
    write_json(top_corp, PUBLIC_DIR / "top_corporate_donors.json")
    print(f"  {len(top_corp)} corporate donors")

    # Donor flows
    print("Building donor_flows.json ...", flush=True)
    flows = build_donor_flows(df, committees_df)
    write_json(flows, PUBLIC_DIR / "donor_flows.json")
    print(f"  {len(flows)} donor→committee pairs")

    # Per-committee files
    print("Building per-committee files ...", flush=True)
    per_committee = build_per_committee_files(df, committees_df)
    for acct, data in per_committee.items():
        write_json(data, COMMITTEES_DIR / f"{acct}.json")
    print(f"  {len(per_committee)} committee files → public/data/committees/")

    # Meta
    meta = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_contributions": int(len(df)),
        "total_amount": round(float(df["amount"].sum()), 2),
        "total_committees_with_data": len(per_committee),
        "total_donors": int(df["canonical_name"].nunique()),
        "date_range": {
            "earliest": str(df["contribution_date"].min()) if "contribution_date" in df.columns else None,
            "latest":   str(df["contribution_date"].max()) if "contribution_date" in df.columns else None,
        },
    }
    write_json(meta, PUBLIC_DIR / "meta.json")
    print("Wrote meta.json")

    print(f"\nAll files written to {PUBLIC_DIR}")
    return 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(main(force=force))
