# scripts/17_export_lobbyists.py
"""
Script 17: Export lobbyist connection data to per-committee JSON sidecar files.

Answers "The Connection" question for each committee:
  "Which donors to this committee also employ lobbyists in Tallahassee?"

Joins:
  contributions (canonical_name) → principal_matches (contributor_name)
  → principal_matches (principal_name) → lobbyist_registrations (principal_name)

Output per committee (public/data/committees/{acct}.lobbyists.json):
  {
    "acct_num": "4700",
    "total_lobbying_principals": 5,
    "connection_alerts": [
      {
        "principal_name":   "Florida Power & Light Company",
        "contributor_name": "FLORIDA POWER & LIGHT COMPANY",
        "match_score":      100,
        "total_donated":    125000.00,
        "num_contributions": 3,
        "lobbyist_count":   12,
        "lobbyists":        ["SMITH JOHN", "JONES ALICE", ...],  // top 10 active
        "branches":         ["legislative", "executive"]
      }
    ]
  }

Also writes:
  public/data/lobbyist_summary.json — aggregate stats for the website

Usage (from project root, with .venv activated):
    python scripts/17_export_lobbyists.py
    python scripts/17_export_lobbyists.py --force
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR, PROJECT_ROOT


def _derive_acct(source_file: str):
    """Extract committee acct_num from Contrib_*.txt filename."""
    _MAP = {"Contrib_2024_rpof.txt": "4700"}
    if source_file in _MAP:
        return _MAP[source_file]
    stem = Path(source_file).stem
    if stem.startswith("Contrib_"):
        return stem[len("Contrib_"):].replace("_", " ")
    return None


PUBLIC_DIR     = PROJECT_ROOT / "public" / "data"
COMMITTEES_DIR = PUBLIC_DIR / "committees"

# Maximum lobbyists to list per alert (keeps JSON size reasonable)
MAX_LOBBYISTS_PER_ALERT = 10


def build_principal_lobbyist_index(regs_df: pd.DataFrame) -> dict:
    """
    Return {principal_name_upper: {lobbyist_count, lobbyists, branches}}
    using only active registrations.
    """
    active = regs_df[regs_df["is_active"].astype(str).str.lower().isin(["true", "1", "yes"])]

    index: dict = {}
    for prin_upper, group in active.groupby(
        active["principal_name"].str.strip().str.upper()
    ):
        lobbyists = group["lobbyist_name"].dropna().unique().tolist()
        branches  = sorted(group["branch"].dropna().unique().tolist())
        index[prin_upper] = {
            "lobbyist_count": len(lobbyists),
            "lobbyists":      lobbyists[:MAX_LOBBYISTS_PER_ALERT],
            "branches":       branches,
        }
    return index


_SOURCE_FILE_MAP = {"Contrib_2024_rpof.txt": "4700"}


def _derive_acct_vectorized(source_series: pd.Series) -> pd.Series:
    """
    Vectorized version of _derive_acct — processes entire column at once.
    Handles both standard Contrib_{acct}.txt and entries in _SOURCE_FILE_MAP.
    """
    # Start with the standard pattern: strip "Contrib_" prefix, replace _ with space
    stems = source_series.str.replace(r"\.txt$", "", regex=True)
    result = stems.where(
        ~stems.str.startswith("Contrib_"),
        stems.str.replace("^Contrib_", "", regex=True).str.replace("_", " "),
    )
    # Apply special cases
    for special, acct in _SOURCE_FILE_MAP.items():
        mask = source_series == special
        result = result.where(~mask, acct)
    # Non-Contrib_ files that weren't in the special map → None
    is_contrib = source_series.str.startswith("Contrib_") | source_series.isin(_SOURCE_FILE_MAP)
    result = result.where(is_contrib, None)
    return result


def build_committee_donation_index(
    contribs_df: pd.DataFrame,
) -> dict:
    """
    Return {(canonical_name_upper, acct_num): {total_donated, num_contributions}}.
    """
    work = contribs_df.copy()
    work["committee_acct"] = _derive_acct_vectorized(work["source_file"])
    work = work[work["committee_acct"].notna()]
    work["canon_upper"] = work["canonical_name"].str.strip().str.upper()

    grouped = (
        work.groupby(["canon_upper", "committee_acct"], sort=False)["amount"]
        .agg(total_donated="sum", num_contributions="count")
        .reset_index()
    )
    return {
        (row.canon_upper, row.committee_acct): {
            "total_donated":    round(float(row.total_donated), 2),
            "num_contributions": int(row.num_contributions),
        }
        for row in grouped.itertuples(index=False)
    }


def build_connection_alerts(
    matches_df: pd.DataFrame,
    donation_index: dict,
    lobbyist_index: dict,
) -> dict:
    """
    Return {acct_num: [connection_alert, ...]} sorted by total_donated desc.

    For each (contributor, principal) match, check if that contributor donated
    to any committee, and if that principal employs lobbyists.

    Uses an inverted contributor→[(acct, donation)] lookup to avoid O(n×m) scan.
    """
    # Build inverted lookup: contributor_upper → [(acct, donation_dict), ...]
    contrib_to_accts: dict[str, list] = {}
    for (canon_upper, acct), donation in donation_index.items():
        contrib_to_accts.setdefault(canon_upper, []).append((acct, donation))

    alerts: dict = {}

    for match_row in matches_df.itertuples(index=False):
        principal_name   = str(match_row.principal_name)
        contributor_name = str(match_row.contributor_name)
        match_score      = float(match_row.match_score)

        contrib_upper   = contributor_name.strip().upper()
        principal_upper = principal_name.strip().upper()

        lob_info = lobbyist_index.get(principal_upper)
        if not lob_info:
            continue  # principal has no active lobbyists

        acct_donations = contrib_to_accts.get(contrib_upper)
        if not acct_donations:
            continue  # this contributor never donated to any known committee

        for acct, donation in acct_donations:
            alert = {
                "principal_name":    principal_name,
                "contributor_name":  contributor_name,
                "match_score":       match_score,
                "total_donated":     donation["total_donated"],
                "num_contributions": donation["num_contributions"],
                "lobbyist_count":    lob_info["lobbyist_count"],
                "lobbyists":         lob_info["lobbyists"],
                "branches":          lob_info["branches"],
            }
            alerts.setdefault(acct, []).append(alert)

    # Sort each committee's alerts by total_donated descending
    for acct in alerts:
        alerts[acct].sort(key=lambda x: x["total_donated"], reverse=True)

    return alerts


def write_per_committee_lobbyist_files(alerts: dict) -> int:
    """
    Write public/data/committees/{acct}.lobbyists.json for every committee
    that has at least one connection alert. Returns count of files written.
    """
    COMMITTEES_DIR.mkdir(parents=True, exist_ok=True)
    count = 0
    for acct, alert_list in alerts.items():
        out = {
            "acct_num":                   acct,
            "total_lobbying_principals":  len(alert_list),
            "connection_alerts":          alert_list,
        }
        path = COMMITTEES_DIR / f"{acct}.lobbyists.json"
        path.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
        count += 1
    return count


def main(force: bool = False) -> int:
    print("=== Script 17: Export Lobbyist Connection Data ===\n")

    # Skip if any per-committee lobbyist file already exists (rough check)
    sample = COMMITTEES_DIR / "4700.lobbyists.json"
    if sample.exists() and not force:
        print("Skipped — lobbyist files already exist (use --force to rebuild)")
        return 0

    # Load inputs
    regs_path    = PROCESSED_DIR / "lobbyist_registrations.csv"
    matches_path = PROCESSED_DIR / "principal_matches.csv"
    deduped_path = PROCESSED_DIR / "contributions_deduped.csv"
    raw_path     = PROCESSED_DIR / "contributions.csv"

    for p in (regs_path, matches_path):
        if not p.exists():
            print(f"ERROR: {p.name} not found. Run scripts 15 + 16 first.", file=sys.stderr)
            return 1

    if deduped_path.exists():
        print(f"Loading {deduped_path.name} …", flush=True)
        name_col = "canonical_name"
        contribs_df = pd.read_csv(deduped_path, dtype=str, low_memory=False,
                                  usecols=[name_col, "amount", "source_file"])
    elif raw_path.exists():
        print(f"Loading {raw_path.name} …", flush=True)
        name_col = "contributor_name"
        contribs_df = pd.read_csv(raw_path, dtype=str, low_memory=False,
                                  usecols=[name_col, "amount", "source_file"])
        contribs_df = contribs_df.rename(columns={name_col: "canonical_name"})
    else:
        print("ERROR: No contributions data found.", file=sys.stderr)
        return 1

    contribs_df["amount"] = pd.to_numeric(contribs_df["amount"], errors="coerce").fillna(0.0)
    print(f"  {len(contribs_df):,} contributions loaded")

    regs_df    = pd.read_csv(regs_path,    dtype=str).fillna("")
    matches_df = pd.read_csv(matches_path, dtype=str)
    matches_df["match_score"] = pd.to_numeric(matches_df["match_score"], errors="coerce").fillna(0.0)
    print(f"  {len(regs_df):,} lobbyist registrations")
    print(f"  {len(matches_df):,} principal↔contributor matches\n")

    print("Building lobbyist index …", flush=True)
    lobbyist_index = build_principal_lobbyist_index(regs_df)
    print(f"  {len(lobbyist_index):,} principals with active lobbyists")

    print("Building committee donation index …", flush=True)
    donation_index = build_committee_donation_index(contribs_df)
    print(f"  {len(donation_index):,} (contributor, committee) donation pairs\n")

    print("Computing connection alerts …", flush=True)
    alerts = build_connection_alerts(matches_df, donation_index, lobbyist_index)
    total_alerts = sum(len(v) for v in alerts.values())
    print(f"  {total_alerts:,} alerts across {len(alerts):,} committees")

    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

    print("Writing per-committee lobbyist files …", flush=True)
    written = write_per_committee_lobbyist_files(alerts)
    print(f"  {written:,} files → public/data/committees/*.lobbyists.json")

    # Summary JSON for website-level stats
    summary = {
        "generated_at":          datetime.now(timezone.utc).isoformat(),
        "total_principals":      int(matches_df["principal_name"].nunique()),
        "total_matched_contributors": int(matches_df["contributor_name"].nunique()),
        "committees_with_alerts": len(alerts),
        "total_alerts":          total_alerts,
    }
    summary_path = PUBLIC_DIR / "lobbyist_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  Wrote {summary_path.name}")

    print(f"\n=== SUMMARY ===")
    print(f"  Committees with lobbyist connections: {len(alerts):,}")
    print(f"  Total connection alerts:              {total_alerts:,}")

    if alerts:
        # Top 10 committees by alert count
        top = sorted(alerts.items(), key=lambda x: len(x[1]), reverse=True)[:10]
        print(f"\n  Top 10 committees by lobbyist connection count:")
        for acct, alert_list in top:
            print(f"    {acct:10s}  {len(alert_list):3d} alerts")

    print("\nNext: npm run build")
    return 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(main(force=force))
