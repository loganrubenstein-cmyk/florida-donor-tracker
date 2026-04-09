# scripts/25_export_donor_profiles.py
"""
Script 25: Export per-donor JSON profiles for the public website.

For every canonical donor name (from the deduplicated soft-money contributions)
we build a full profile and a lightweight index entry.  Hard-money totals from
candidate_contributions.csv are merged in where available.

Outputs
-------
  public/data/donors/index.json
      Lightweight listing for the donor directory page.
      [{slug, name, total_soft, total_hard, total_combined, num_contributions,
        is_corporate, top_occupation, top_location, num_committees, num_candidates}]

  public/data/donors/{slug}.json
      Full donor profile:
        slug, name, is_corporate,
        total_soft, total_hard, total_combined,
        num_contributions,
        top_occupation, top_location,
        committees: [{acct_num, committee_name, total, num_contributions}],
        candidates: [{acct_num, candidate_name, office, party, total, year}],
        by_year: [{year, soft, hard, total}],
        lobbyist_principals: [{principal_name, match_score}]  # if matched

Only donors with total_combined >= MIN_TOTAL are profiled individually.
All donors appear in the index.

Usage (from project root, with .venv activated):
    python scripts/25_export_donor_profiles.py
    python scripts/25_export_donor_profiles.py --force
"""

import json
import re
import sys
from pathlib import Path
from collections import defaultdict

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR, PROJECT_ROOT

PUBLIC_DIR       = PROJECT_ROOT / "public" / "data"
COMMITTEES_DIR   = PUBLIC_DIR / "committees"
CANDIDATES_DIR   = PUBLIC_DIR / "candidates"
OUTPUT_DIR       = PUBLIC_DIR / "donors"
INDEX_JSON       = OUTPUT_DIR / "index.json"

DEDUPED_CSV      = PROCESSED_DIR / "contributions_deduped.csv"
CAND_CONTRIB_CSV = PROCESSED_DIR / "candidate_contributions.csv"
COMMITTEES_CSV   = PROCESSED_DIR / "committees.csv"
PRINCIPAL_CSV    = PROCESSED_DIR / "principal_matches.csv"
CANDIDATE_STATS  = PUBLIC_DIR / "candidate_stats.json"

# Only write individual profile files for donors above this threshold
MIN_TOTAL        = 1_000   # $1,000 combined
TOP_COMMITTEES   = 25
TOP_CANDIDATES   = 20

# Corporate name keywords (shared with script 08)
_CORP_KEYWORDS = [
    "INC", "LLC", "CORP", "CO.", "COMPANY", "ASSOCIATION",
    "FOUNDATION", "PAC", "FUND", "TRUST", "GROUP", "ENTERPRISES",
    "SERVICES", "INDUSTRIES", "PARTNERS", "HOLDINGS",
]


def is_corporate(name: str) -> bool:
    if not isinstance(name, str):
        return False
    upper = name.upper()
    return any(kw in upper for kw in _CORP_KEYWORDS)


def slugify(name) -> str:
    """Convert a donor name to a URL-safe slug."""
    if not name:
        return ""
    s = str(name).lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_]+", "-", s).strip("-")
    s = re.sub(r"-{2,}", "-", s)
    return s[:120]  # cap length


def acct_from_source(source_file: str) -> str | None:
    """Extract committee acct_num from 'Contrib_12345.txt' filename."""
    if not isinstance(source_file, str):
        return None
    m = re.search(r"Contrib_(\d+)\.txt", source_file, re.IGNORECASE)
    return m.group(1) if m else None


def top_value(series: pd.Series) -> str | None:
    """Return most frequent non-null value in a Series."""
    s = series.dropna()
    if s.empty:
        return None
    return str(s.mode().iloc[0])


def write_json(data, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")


# ── Load helpers ──────────────────────────────────────────────────────────────

def load_committee_names() -> dict:
    """Return {acct_num: committee_name} from committees.csv."""
    try:
        df = pd.read_csv(COMMITTEES_CSV, dtype=str)
        col_acct = next((c for c in df.columns if "acct" in c.lower()), None)
        col_name = next((c for c in df.columns if "name" in c.lower()), None)
        if col_acct and col_name:
            return dict(zip(df[col_acct].str.strip(), df[col_name].str.strip()))
    except Exception:
        pass
    return {}


def load_candidate_names() -> dict:
    """Return {acct_num: {name, office, party}} from candidate_stats.json."""
    try:
        with open(CANDIDATE_STATS, encoding="utf-8") as f:
            stats = json.load(f)
        return {
            str(r["acct_num"]): {
                "name": r.get("candidate_name", ""),
                "office": r.get("office_desc", ""),
                "party": r.get("party_code", ""),
            }
            for r in stats
        }
    except Exception:
        return {}


def load_soft_money() -> pd.DataFrame:
    """Load deduplicated soft-money contributions."""
    df = pd.read_csv(
        DEDUPED_CSV,
        dtype={"report_year": str, "source_file": str, "canonical_name": str,
               "contributor_occupation": str, "contributor_city_state_zip": str},
        low_memory=False,
    )
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0)
    df["report_year"] = pd.to_numeric(df["report_year"], errors="coerce")
    df["acct_num"] = df["source_file"].apply(acct_from_source)
    df = df.dropna(subset=["canonical_name", "acct_num"])
    df = df[df["amount"] > 0]
    return df


def load_hard_money() -> pd.DataFrame:
    """Load candidate (hard-money) contributions."""
    try:
        df = pd.read_csv(
            CAND_CONTRIB_CSV,
            dtype={"report_year": str, "acct_num": str, "contributor_name": str},
            low_memory=False,
        )
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0)
        df["report_year"] = pd.to_numeric(df["report_year"], errors="coerce")
        df = df[df["amount"] > 0]
        # Use contributor_name as canonical (no dedup on hard money yet)
        df["canonical_name"] = df["contributor_name"].str.strip().str.upper()
        return df
    except Exception:
        return pd.DataFrame(columns=["canonical_name", "acct_num", "amount", "report_year"])


def load_principal_matches() -> dict:
    """Return {contributor_name: [{principal_name, match_score}]} from principal_matches.csv."""
    try:
        df = pd.read_csv(PRINCIPAL_CSV, dtype=str)
        df["match_score"] = pd.to_numeric(df["match_score"], errors="coerce")
        out = defaultdict(list)
        for _, row in df.iterrows():
            cname = str(row["contributor_name"]).strip().upper()
            out[cname].append({
                "principal_name": str(row["principal_name"]).strip(),
                "match_score": round(float(row["match_score"]), 1),
            })
        return dict(out)
    except Exception:
        return {}


# ── Build donor records ───────────────────────────────────────────────────────

def build_donor_records(
    soft: pd.DataFrame,
    hard: pd.DataFrame,
    committee_names: dict,
    candidate_info: dict,
    principal_matches: dict,
) -> tuple[list, dict]:
    """
    Returns (index_rows, profiles_by_slug).
    index_rows  — lightweight dicts for the directory listing
    profiles_by_slug — full profile dicts keyed by slug
    """
    print("  Aggregating soft money by donor…")
    soft_by_donor = soft.groupby("canonical_name")
    soft_totals = soft_by_donor["amount"].sum().rename("total_soft")
    soft_counts = soft_by_donor["amount"].count().rename("soft_count")

    print("  Aggregating hard money by donor…")
    hard_by_donor = None
    hard_names_set = set()
    hard_totals_map: dict = {}
    hard_counts_map: dict = {}
    if not hard.empty:
        hard_by_donor = hard.groupby("canonical_name")
        hard_names_set = set(hard_by_donor.groups.keys())
        hard_totals_map = hard_by_donor["amount"].sum().to_dict()
        hard_counts_map = hard_by_donor["amount"].count().to_dict()

    # All unique canonical donor names from soft money (primary source)
    all_names = list(soft_totals.index)
    total = len(all_names)
    print(f"  Building profiles for {total:,} unique donors…")

    index_rows = []
    profiles = {}

    for i, name in enumerate(all_names):
        if i % 10_000 == 0 and i > 0:
            print(f"    {i:,}/{total:,}…")

        slug = slugify(name)
        if not slug:  # skip donors whose name produces an empty slug (e.g. bare backtick)
            continue
        s_total = float(soft_totals.get(name, 0))
        s_count = int(soft_counts.get(name, 0))

        # Hard money for same donor (match by uppercased name)
        h_total = float(hard_totals_map.get(name, 0))
        h_count = int(hard_counts_map.get(name, 0))

        combined = s_total + h_total
        corp = is_corporate(name)

        # Per-donor soft rows
        donor_soft = soft_by_donor.get_group(name)

        top_occ = top_value(donor_soft["contributor_occupation"])
        top_loc = top_value(donor_soft["contributor_city_state_zip"])

        # Committee breakdown (top N by amount)
        comm_grp = (
            donor_soft.groupby("acct_num")["amount"]
            .agg(total="sum", num_contributions="count")
            .reset_index()
            .sort_values("total", ascending=False)
            .head(TOP_COMMITTEES)
        )
        num_committees = len(donor_soft["acct_num"].unique())

        # Candidate breakdown from hard money
        num_candidates = 0
        cand_rows = []
        if hard_by_donor and name in hard_names_set:
            hg = hard_by_donor.get_group(name)
            cg = (
                hg.groupby("acct_num")["amount"]
                .agg(total="sum", num="count")
                .reset_index()
                .sort_values("total", ascending=False)
                .head(TOP_CANDIDATES)
            )
            num_candidates = len(hg["acct_num"].unique())
            hg_by_acct = hg.groupby("acct_num")
            for _, cr in cg.iterrows():
                acct = str(cr["acct_num"])
                info = candidate_info.get(acct, {})
                yr_series = hg_by_acct.get_group(cr["acct_num"])["report_year"].dropna()
                year = int(yr_series.mode().iloc[0]) if not yr_series.empty else None
                cand_rows.append({
                    "acct_num": acct,
                    "candidate_name": info.get("name", ""),
                    "office": info.get("office", ""),
                    "party": info.get("party", ""),
                    "total": round(float(cr["total"]), 2),
                    "year": year,
                })

        # Year-by-year soft breakdown
        year_soft = (
            donor_soft.groupby("report_year")["amount"].sum()
            .reset_index()
            .rename(columns={"amount": "soft"})
        )

        # Merge hard by year if available
        if hard_by_donor and name in hard_names_set:
            hg = hard_by_donor.get_group(name)
            year_hard = (
                hg.groupby("report_year")["amount"].sum()
                .reset_index()
                .rename(columns={"amount": "hard"})
            )
            year_df = pd.merge(year_soft, year_hard, on="report_year", how="outer").fillna(0)
        else:
            year_df = year_soft.copy()
            year_df["hard"] = 0.0

        year_df["total"] = year_df["soft"] + year_df["hard"]
        year_df = year_df.sort_values("report_year")
        by_year = [
            {
                "year": int(row["report_year"]),
                "soft": round(float(row["soft"]), 2),
                "hard": round(float(row.get("hard", 0)), 2),
                "total": round(float(row["total"]), 2),
            }
            for _, row in year_df.iterrows()
            if not pd.isna(row["report_year"])
        ]

        # Lobbyist principal cross-reference
        lobbyist_principals = principal_matches.get(name, [])

        # Index entry (lightweight — always written)
        index_rows.append({
            "slug": slug,
            "name": name,
            "is_corporate": corp,
            "total_soft": round(s_total, 2),
            "total_hard": round(h_total, 2),
            "total_combined": round(combined, 2),
            "num_contributions": s_count + h_count,
            "top_occupation": top_occ,
            "top_location": top_loc,
            "num_committees": num_committees,
            "num_candidates": num_candidates,
            "has_lobbyist_link": len(lobbyist_principals) > 0,
        })

        # Full profile (only for donors above MIN_TOTAL)
        if combined >= MIN_TOTAL:
            comm_list = [
                {
                    "acct_num": str(row["acct_num"]),
                    "committee_name": committee_names.get(str(row["acct_num"]), ""),
                    "total": round(float(row["total"]), 2),
                    "num_contributions": int(row["num_contributions"]),
                }
                for _, row in comm_grp.iterrows()
            ]
            profiles[slug] = {
                "slug": slug,
                "name": name,
                "is_corporate": corp,
                "total_soft": round(s_total, 2),
                "total_hard": round(h_total, 2),
                "total_combined": round(combined, 2),
                "num_contributions": s_count + h_count,
                "top_occupation": top_occ,
                "top_location": top_loc,
                "num_committees": num_committees,
                "num_candidates": num_candidates,
                "committees": comm_list,
                "candidates": cand_rows,
                "by_year": by_year,
                "lobbyist_principals": lobbyist_principals,
            }

    return index_rows, profiles


# ── Main ──────────────────────────────────────────────────────────────────────

def main(force: bool = False) -> int:
    if not force and INDEX_JSON.exists():
        print("donor index already exists — skipping (use --force to rebuild)")
        return 0

    print("=== Script 25: Export Donor Profiles ===")

    print("Loading data…")
    committee_names = load_committee_names()
    print(f"  {len(committee_names):,} committee names loaded")
    candidate_info = load_candidate_names()
    print(f"  {len(candidate_info):,} candidate records loaded")
    principal_matches = load_principal_matches()
    print(f"  {len(principal_matches):,} lobbyist principal matches loaded")

    print("Loading soft-money contributions…")
    soft = load_soft_money()
    print(f"  {len(soft):,} soft-money rows")

    print("Loading hard-money contributions…")
    hard = load_hard_money()
    print(f"  {len(hard):,} hard-money rows")

    index_rows, profiles = build_donor_records(
        soft, hard, committee_names, candidate_info, principal_matches
    )

    # Sort index by combined total descending
    index_rows.sort(key=lambda r: r["total_combined"], reverse=True)

    print(f"\nWriting index ({len(index_rows):,} donors)…")
    write_json(index_rows, INDEX_JSON)

    print(f"Writing {len(profiles):,} donor profile files…")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for slug, profile in profiles.items():
        write_json(profile, OUTPUT_DIR / f"{slug}.json")

    print("\n=== Done ===")
    print(f"  Index:    {INDEX_JSON}")
    print(f"  Profiles: {len(profiles):,} files in {OUTPUT_DIR}/")
    print(f"  Total donors in index: {len(index_rows):,}")
    profiled = sum(1 for r in index_rows if r["total_combined"] >= MIN_TOTAL)
    print(f"  Donors with full profile (>= ${MIN_TOTAL:,}): {profiled:,}")

    return 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(main(force=force))
