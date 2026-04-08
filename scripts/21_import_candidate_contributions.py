# scripts/21_import_candidate_contributions.py
"""
Script 21: Import candidate CCE/direct contribution files into a clean CSV.

Reads CandContrib_*.txt files scraped by script 20, joins each with
candidates.csv to attach election cycle metadata, tags corporate donors,
and outputs a single data/processed/candidate_contributions.csv.

This is the "hard money" dataset — direct contributions to candidates,
capped by FL law (~$3,000/person/cycle), reported quarterly.

Kept separate from contributions.csv (soft money — PAC/committee) so
hard vs soft comparisons are explicit. Script 22 will combine them into
per-candidate JSON for the frontend.

# TODO (future script): Add industry classifier to group contributor_occupation
# into ~15 buckets (Real Estate, Legal, Healthcare, Finance, Agriculture,
# Lobbyist, Political Committees, Construction, Retail, Tech, Education,
# Retired, Self-Employed, Other). Occupation field is free text from TreFin.exe.
# See memory note: "industry_classifier_todo" for design notes.

Usage (from project root, with .venv activated):
    python scripts/21_import_candidate_contributions.py
    python scripts/21_import_candidate_contributions.py --force
"""

import json
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR

CAND_RAW    = Path(__file__).resolve().parent.parent / "data" / "raw" / "candidate_contributions"
MANIFEST    = CAND_RAW / "manifest.json"
OUTPUT_FILE = PROCESSED_DIR / "candidate_contributions.csv"

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

# Keywords that indicate a corporate / PAC / organizational donor.
# Mirrors the logic in 09_deduplicate_donors.py.
_CORP_KEYWORDS = frozenset([
    "INC", "LLC", "CORP", "CO.", "COMPANY", "ASSOCIATION",
    "FOUNDATION", "PAC", "FUND", "TRUST", "GROUP", "ENTERPRISES",
    "SERVICES", "INDUSTRIES", "PARTNERS", "HOLDINGS",
    "COMMITTEE", "POLITICAL", "UNION", "COUNCIL", "ALLIANCE",
])

_OCCUPATION_CORP_SIGNALS = frozenset([
    "POLITICAL COMMITTEE", "PAC", "COMMITTEE",
])


def parse_amount(value) -> float:
    if pd.isna(value):
        return 0.0
    s = str(value).strip()
    if not s:
        return 0.0
    negative = s.startswith("(") and s.endswith(")")
    s = s.replace("$", "").replace(",", "").replace("(", "").replace(")", "")
    try:
        return -float(s) if negative else float(s)
    except ValueError:
        return 0.0


def is_corporate(name: str, occupation: str = "") -> bool:
    """Tag as corporate if name or occupation signals a non-individual donor."""
    name_words = set(str(name).upper().split())
    if name_words & _CORP_KEYWORDS:
        return True
    occ_upper = str(occupation).upper().strip()
    for signal in _OCCUPATION_CORP_SIGNALS:
        if signal in occ_upper:
            return True
    return False


def election_year(election_id: str) -> str:
    """Extract 4-digit year from election_id like '20261103-GEN' → '2026'."""
    m = re.match(r"^(\d{4})", str(election_id))
    return m.group(1) if m else ""


def load_candidates_index() -> dict:
    """
    Load candidates.csv and return a dict mapping acct_num → metadata dict.
    Each candidate may appear in multiple elections (separate acct_nums).
    """
    path = PROCESSED_DIR / "candidates.csv"
    if not path.exists():
        print(f"ERROR: {path} not found. Run 05_import_registry.py first.",
              file=sys.stderr)
        sys.exit(1)

    df = pd.read_csv(path, dtype=str, low_memory=False).fillna("")
    index = {}
    for _, row in df.iterrows():
        acct = row.get("acct_num", "").strip()
        if not acct:
            continue
        elec_id = row.get("election_id", "").strip()
        index[acct] = {
            "acct_num":     acct,
            "candidate_name": (
                row.get("first_name", "").strip() + " " +
                row.get("last_name", "").strip()
            ).strip(),
            "election_id":  elec_id,
            "election_year": election_year(elec_id),
            "office_code":  row.get("office_code", "").strip(),
            "office_desc":  row.get("office_desc", "").strip(),
            "party_code":   row.get("party_code", "").strip(),
            "district":     row.get("juris1", "").strip(),
            "status_desc":  row.get("status_desc", "").strip(),
        }
    return index


def load_manifest() -> dict:
    if not MANIFEST.exists():
        return {}
    return json.loads(MANIFEST.read_text())


def load_one_file(path: Path, cand_meta: dict) -> pd.DataFrame:
    """Read one CandContrib file, normalize columns, attach candidate metadata."""
    try:
        df = pd.read_csv(path, sep="\t", dtype=str,
                         encoding="latin-1", on_bad_lines="warn")
    except Exception as e:
        print(f"    WARNING: could not read {path.name}: {e}", file=sys.stderr)
        return pd.DataFrame()

    if df.empty:
        return pd.DataFrame()

    df.columns = [c.strip() for c in df.columns]
    df = df.rename(columns=COLUMN_RENAME)

    # Parse date and amount
    if "contribution_date" in df.columns:
        df["contribution_date"] = pd.to_datetime(
            df["contribution_date"], format="%m/%d/%Y", errors="coerce"
        )
    if "amount" in df.columns:
        df["amount"] = df["amount"].apply(parse_amount)

    # Attach candidate metadata
    for col, val in cand_meta.items():
        df[col] = val

    # Tag corporate donors
    df["is_corporate"] = df.apply(
        lambda r: is_corporate(
            r.get("contributor_name", ""),
            r.get("contributor_occupation", ""),
        ),
        axis=1,
    )

    df["source_file"] = path.name
    return df


def main(force: bool = False) -> int:
    print("=== Script 21: Import Candidate Contributions (Hard Money) ===\n")

    if OUTPUT_FILE.exists() and not force:
        print(f"Skipped — {OUTPUT_FILE.name} already exists (use --force to rebuild)")
        return 0

    if not CAND_RAW.exists():
        print(f"ERROR: {CAND_RAW} not found. Run 20_scrape_candidate_contributions.py first.",
              file=sys.stderr)
        return 1

    print("Loading candidate index ...", flush=True)
    cand_index = load_candidates_index()
    print(f"  {len(cand_index):,} candidate accounts indexed\n")

    manifest = load_manifest()
    complete_accts = {
        acct for acct, entry in manifest.items()
        if entry.get("status") == "complete"
    }
    print(f"Complete accounts in manifest: {len(complete_accts):,}")

    # Only import files that are complete in the manifest
    files = sorted(CAND_RAW.glob("CandContrib_*.txt"))
    print(f"Files on disk: {len(files):,}")

    frames = []
    loaded = skipped_no_manifest = skipped_no_meta = 0

    for f in files:
        acct = f.stem.replace("CandContrib_", "")

        if acct not in complete_accts:
            skipped_no_manifest += 1
            continue

        meta = cand_index.get(acct)
        if meta is None:
            skipped_no_meta += 1
            continue

        df = load_one_file(f, meta)
        if not df.empty:
            frames.append(df)
            loaded += 1

    print(f"\n  Loaded:                    {loaded:,} files")
    print(f"  Skipped (not in manifest): {skipped_no_manifest:,}")
    print(f"  Skipped (no candidate meta): {skipped_no_meta:,}")

    if not frames:
        print("ERROR: No contribution data loaded.", file=sys.stderr)
        return 1

    print("\nCombining ...", flush=True)
    df = pd.concat(frames, ignore_index=True)

    # Reorder columns for readability
    first_cols = [
        "acct_num", "candidate_name", "election_id", "election_year",
        "office_code", "office_desc", "party_code", "district",
        "report_year", "report_type", "contribution_date", "amount",
        "contributor_name", "contributor_address", "contributor_city_state_zip",
        "contributor_occupation", "type_code", "in_kind_description",
        "is_corporate", "source_file",
    ]
    existing = [c for c in first_cols if c in df.columns]
    extra    = [c for c in df.columns if c not in first_cols]
    df = df[existing + extra]

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT_FILE, index=False)

    # Summary
    print(f"\nWrote {len(df):,} rows to {OUTPUT_FILE.name}")
    print("\n=== SUMMARY ===")
    print(f"Total contributions:    {len(df):,}")
    total = df["amount"].sum() if "amount" in df.columns else 0
    print(f"Total dollar amount:    ${total:,.2f}")
    corp = df["is_corporate"].sum()
    print(f"Corporate / PAC:        {corp:,} ({corp/len(df)*100:.1f}%)")
    print(f"Individual:             {len(df)-corp:,} ({(len(df)-corp)/len(df)*100:.1f}%)")

    if "contribution_date" in df.columns:
        valid = df["contribution_date"].dropna()
        if len(valid):
            print(f"Date range:             {valid.min().date()} → {valid.max().date()}")

    print(f"\nBy election cycle:")
    by_cycle = (
        df.groupby("election_year")["amount"]
        .agg(total="sum", contributions="count")
        .sort_index()
    )
    for yr, row in by_cycle.iterrows():
        print(f"  {yr}: ${row['total']:>14,.2f}  ({row['contributions']:,} contributions)")

    print(f"\nTop 10 candidates by total hard money:")
    top_cands = (
        df.groupby(["candidate_name", "office_desc", "party_code"])["amount"]
        .sum()
        .sort_values(ascending=False)
        .head(10)
    )
    for (name, office, party), amt in top_cands.items():
        print(f"  {name:<28s} {party}  {office[:30]:<30s}  ${amt:>12,.2f}")

    return 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(main(force=force))
