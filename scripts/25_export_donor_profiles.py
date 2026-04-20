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
import os
import re
import sys
from pathlib import Path
from collections import defaultdict

import pandas as pd
import psycopg2
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR, PROJECT_ROOT

load_dotenv(PROJECT_ROOT / ".env.local")
DB_URL = os.getenv("SUPABASE_DB_URL")

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


def _alias_key(name) -> str:
    if not isinstance(name, str):
        return ""
    return re.sub(r"\s+", " ", name.strip().upper())


def load_donor_slug_map() -> dict:
    """Return {alias_text: canonical_slug} from donor_aliases.

    Post-canonical-model, donor_aliases is the source of truth mapping every
    contributor-name variant → canonical_slug. Script 25 uses this to key
    donor profiles by the same slug that /donor/[slug] routes expect.
    """
    if not DB_URL:
        print("  [warn] SUPABASE_DB_URL not set — falling back to local slugify only")
        return {}
    print("  Loading donor slug map from donor_aliases…")
    conn = psycopg2.connect(DB_URL)
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT alias_text, canonical_slug
            FROM donor_aliases
            WHERE review_status IN ('auto','approved')
        """)
        m = {a: s for a, s in cur.fetchall() if a and s}
    finally:
        conn.close()
    print(f"  → {len(m):,} aliases")
    return m


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
    slug_map: dict,
) -> tuple[list, dict]:
    """
    Returns (index_rows, profiles_by_slug).
    index_rows  — lightweight dicts for the directory listing
    profiles_by_slug — full profile dicts keyed by slug
    """
    # Rewrite donor_slug on every row via donor_aliases (canonical model).
    # Multiple canonical_name variants can collapse to one slug (e.g., 43 FPL
    # variants → florida-power-light-company). Aggregating by donor_slug below
    # collapses them into a single profile.
    print("  Mapping contributions to canonical donor slugs…")
    soft = soft.copy()
    soft["donor_slug"] = soft["canonical_name"].apply(
        lambda n: slug_map.get(_alias_key(n)) or slugify(n)
    )
    soft = soft[soft["donor_slug"] != ""]

    if not hard.empty:
        hard = hard.copy()
        hard["donor_slug"] = hard["canonical_name"].apply(
            lambda n: slug_map.get(_alias_key(n)) or slugify(n)
        )
        hard = hard[hard["donor_slug"] != ""]

    # Vectorized aggregations: compute each pandas groupby once, then bucket
    # results into plain Python dicts keyed by donor_slug. The main loop then
    # performs only O(1) dict lookups per donor — no per-donor pandas calls.
    print("  Soft totals/counts per slug…")
    soft_totals = soft.groupby("donor_slug")["amount"].sum().to_dict()
    soft_counts = soft.groupby("donor_slug")["amount"].count().to_dict()

    print("  Display names per slug (most common canonical_name)…")
    slug_to_name = (
        soft.groupby(["donor_slug", "canonical_name"]).size()
        .reset_index(name="n")
        .sort_values(["donor_slug", "n"], ascending=[True, False])
        .drop_duplicates("donor_slug")
        .set_index("donor_slug")["canonical_name"].to_dict()
    )

    print("  Top occupation + location per slug…")
    top_occ_map = (
        soft.dropna(subset=["contributor_occupation"])
        .groupby(["donor_slug", "contributor_occupation"]).size()
        .reset_index(name="n")
        .sort_values(["donor_slug", "n"], ascending=[True, False])
        .drop_duplicates("donor_slug")
        .set_index("donor_slug")["contributor_occupation"].to_dict()
    )
    top_loc_map = (
        soft.dropna(subset=["contributor_city_state_zip"])
        .groupby(["donor_slug", "contributor_city_state_zip"]).size()
        .reset_index(name="n")
        .sort_values(["donor_slug", "n"], ascending=[True, False])
        .drop_duplicates("donor_slug")
        .set_index("donor_slug")["contributor_city_state_zip"].to_dict()
    )

    print("  Soft committee breakdown (top %d per slug)…" % TOP_COMMITTEES)
    soft_acct = (
        soft.groupby(["donor_slug", "acct_num"])["amount"]
        .agg(total="sum", num_contributions="count").reset_index()
    )
    num_committees_map = soft_acct.groupby("donor_slug")["acct_num"].nunique().to_dict()
    soft_acct_top = (
        soft_acct.sort_values(["donor_slug", "total"], ascending=[True, False])
        .groupby("donor_slug").head(TOP_COMMITTEES)
    )
    soft_acct_top_by_slug: dict[str, list] = defaultdict(list)
    for r in soft_acct_top.itertuples(index=False):
        soft_acct_top_by_slug[r.donor_slug].append(
            (str(r.acct_num), float(r.total), int(r.num_contributions))
        )

    print("  Soft year breakdown per slug…")
    soft_year = (
        soft.dropna(subset=["report_year"])
        .groupby(["donor_slug", "report_year"])["amount"].sum().reset_index()
    )
    soft_year_by_slug: dict[str, dict] = defaultdict(dict)
    for r in soft_year.itertuples(index=False):
        soft_year_by_slug[r.donor_slug][int(r.report_year)] = float(r.amount)

    # ── Hard-money (may be empty) ──
    hard_totals: dict = {}
    hard_counts: dict = {}
    hard_slugs_set: set = set()
    num_candidates_map: dict = {}
    hard_acct_top_by_slug: dict[str, list] = defaultdict(list)
    hard_acct_year_mode: dict = {}
    hard_year_by_slug: dict[str, dict] = defaultdict(dict)
    if not hard.empty:
        print("  Hard totals/counts per slug…")
        hard_totals = hard.groupby("donor_slug")["amount"].sum().to_dict()
        hard_counts = hard.groupby("donor_slug")["amount"].count().to_dict()
        hard_slugs_set = set(hard_totals.keys())

        print("  Hard candidate breakdown (top %d per slug)…" % TOP_CANDIDATES)
        hard_acct = (
            hard.groupby(["donor_slug", "acct_num"])["amount"]
            .agg(total="sum", num="count").reset_index()
        )
        num_candidates_map = hard_acct.groupby("donor_slug")["acct_num"].nunique().to_dict()
        hard_acct_top = (
            hard_acct.sort_values(["donor_slug", "total"], ascending=[True, False])
            .groupby("donor_slug").head(TOP_CANDIDATES)
        )
        for r in hard_acct_top.itertuples(index=False):
            hard_acct_top_by_slug[r.donor_slug].append(
                (str(r.acct_num), float(r.total))
            )

        print("  Hard per-(slug,acct) modal year…")
        hard_ym = (
            hard.dropna(subset=["report_year"])
            .groupby(["donor_slug", "acct_num", "report_year"]).size()
            .reset_index(name="n")
            .sort_values(["donor_slug", "acct_num", "n"], ascending=[True, True, False])
            .drop_duplicates(["donor_slug", "acct_num"])
        )
        for r in hard_ym.itertuples(index=False):
            hard_acct_year_mode[(r.donor_slug, str(r.acct_num))] = int(r.report_year)

        print("  Hard year breakdown per slug…")
        hard_year = (
            hard.dropna(subset=["report_year"])
            .groupby(["donor_slug", "report_year"])["amount"].sum().reset_index()
        )
        for r in hard_year.itertuples(index=False):
            hard_year_by_slug[r.donor_slug][int(r.report_year)] = float(r.amount)

    # ── Build records (dict-lookup loop — fast) ──
    all_slugs = list(soft_totals.keys())
    total = len(all_slugs)
    print(f"  Building profiles for {total:,} unique donors…")

    index_rows = []
    profiles = {}

    for i, slug in enumerate(all_slugs):
        if i and i % 100_000 == 0:
            print(f"    {i:,}/{total:,}…")
        if not slug:
            continue

        name = slug_to_name.get(slug) or slug
        s_total = float(soft_totals.get(slug, 0))
        s_count = int(soft_counts.get(slug, 0))
        h_total = float(hard_totals.get(slug, 0))
        h_count = int(hard_counts.get(slug, 0))
        combined = s_total + h_total
        corp = is_corporate(name)
        top_occ = top_occ_map.get(slug)
        top_loc = top_loc_map.get(slug)
        num_committees = int(num_committees_map.get(slug, 0))
        num_candidates = int(num_candidates_map.get(slug, 0))

        # Candidates (hard)
        cand_rows = []
        if slug in hard_slugs_set:
            for acct, cr_total in hard_acct_top_by_slug.get(slug, []):
                info = candidate_info.get(acct, {})
                yr = hard_acct_year_mode.get((slug, acct))
                cand_rows.append({
                    "acct_num": acct,
                    "candidate_name": info.get("name", ""),
                    "office": info.get("office", ""),
                    "party": info.get("party", ""),
                    "total": round(cr_total, 2),
                    "year": yr,
                })

        # Year merge
        years_soft = soft_year_by_slug.get(slug, {})
        years_hard = hard_year_by_slug.get(slug, {})
        year_keys = sorted(set(years_soft) | set(years_hard))
        by_year = []
        for y in year_keys:
            s = years_soft.get(y, 0.0)
            h = years_hard.get(y, 0.0)
            by_year.append({
                "year": y,
                "soft": round(s, 2),
                "hard": round(h, 2),
                "total": round(s + h, 2),
            })

        lobbyist_principals = principal_matches.get(name, [])

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

        if combined >= MIN_TOTAL:
            comm_list = [
                {
                    "acct_num": acct,
                    "committee_name": committee_names.get(acct, ""),
                    "total": round(total_amt, 2),
                    "num_contributions": n,
                }
                for acct, total_amt, n in soft_acct_top_by_slug.get(slug, [])
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

    slug_map = load_donor_slug_map()

    index_rows, profiles = build_donor_records(
        soft, hard, committee_names, candidate_info, principal_matches, slug_map
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
