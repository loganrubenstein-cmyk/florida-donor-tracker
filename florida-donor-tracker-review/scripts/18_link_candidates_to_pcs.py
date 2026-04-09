# scripts/18_link_candidates_to_pcs.py
"""
Script 18: Link FL candidates to Political Committees (PCs) they are associated with.

In Florida, candidates raise money primarily through PCs rather than their own CCE
accounts. This script establishes that link two ways:

  1. Chair match    — candidate name matches the committee's registered chair
  2. Treasurer match — candidate name matches the committee's registered treasurer

Each pass runs exact matching first, then fuzzy matching (rapidfuzz token_sort_ratio ≥ 88)
blocked by first letter of last name to keep comparisons manageable.

Outputs
-------
  data/processed/candidate_pc_links.csv
      candidate_name, candidate_acct, pc_acct, pc_name, pc_type, link_type, confidence

  public/data/candidate_pc_links.json
      {candidate_acct: [{pc_acct, pc_name, pc_type, link_type, confidence}]}
      Used by the frontend for candidate profile pages and "The Connection" feature.

Usage (from project root, with .venv activated):
    python scripts/18_link_candidates_to_pcs.py
    python scripts/18_link_candidates_to_pcs.py --force
"""

import json
import re
import sys
from pathlib import Path

import pandas as pd
from rapidfuzz import fuzz

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR

FUZZY_THRESHOLD = 88  # token_sort_ratio score to accept a fuzzy match

OUTPUT_CSV  = PROCESSED_DIR / "candidate_pc_links.csv"
OUTPUT_JSON = Path(__file__).resolve().parent.parent / "public" / "data" / "candidate_pc_links.json"

_PUNCT = re.compile(r"[^A-Z0-9\s]")


def clean(name: str) -> str:
    """Uppercase, strip punctuation, collapse whitespace."""
    upper = str(name).upper()
    no_punct = _PUNCT.sub("", upper)
    return " ".join(no_punct.split())


def load_candidates(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, dtype=str).fillna("")
    df["candidate_name"] = (
        df["first_name"].str.strip() + " " + df["last_name"].str.strip()
    ).str.strip()
    df["candidate_name_clean"] = df["candidate_name"].apply(clean)
    df["last_initial"] = df["last_name"].str.strip().str.upper().str[:1]
    return df[["acct_num", "candidate_name", "candidate_name_clean", "last_initial",
               "office_desc", "party_code"]].rename(columns={"acct_num": "candidate_acct"})


def load_committees(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, dtype=str).fillna("")
    for role in ("chair", "treasurer"):
        df[f"{role}_name"] = (
            df[f"{role}_first"].str.strip() + " " + df[f"{role}_last"].str.strip()
        ).str.strip()
        df[f"{role}_name_clean"] = df[f"{role}_name"].apply(clean)
        df[f"{role}_last_initial"] = df[f"{role}_last"].str.strip().str.upper().str[:1]
    return df[["acct_num", "committee_name", "type_code",
               "chair_name", "chair_name_clean", "chair_last_initial",
               "treasurer_name", "treasurer_name_clean", "treasurer_last_initial"]].rename(
        columns={"acct_num": "pc_acct", "committee_name": "pc_name", "type_code": "pc_type"}
    )


def exact_matches(candidates: pd.DataFrame, committees: pd.DataFrame, role: str) -> list[dict]:
    """Find exact name matches between candidates and committee chair/treasurer."""
    cand_index = {row["candidate_name_clean"]: row for _, row in candidates.iterrows()}
    results = []
    for _, com in committees.iterrows():
        key = com[f"{role}_name_clean"]
        if not key:
            continue
        if key in cand_index:
            cand = cand_index[key]
            results.append({
                "candidate_name": cand["candidate_name"],
                "candidate_acct": cand["candidate_acct"],
                "pc_acct":        com["pc_acct"],
                "pc_name":        com["pc_name"],
                "pc_type":        com["pc_type"],
                "link_type":      role,
                "confidence":     1.0,
            })
    return results


def fuzzy_matches(
    candidates: pd.DataFrame,
    committees: pd.DataFrame,
    role: str,
    already_matched: set,
) -> list[dict]:
    """
    Fuzzy-match candidates to committees for a given role (chair/treasurer).
    Blocks by first letter of last name. Skips pairs already matched exactly.
    """
    # Build index: last_initial → list of candidate rows
    cand_by_initial: dict[str, list] = {}
    for _, row in candidates.iterrows():
        initial = row["last_initial"]
        if initial:
            cand_by_initial.setdefault(initial, []).append(row)

    results = []
    for _, com in committees.iterrows():
        initial = com[f"{role}_last_initial"]
        com_clean = com[f"{role}_name_clean"]
        if not initial or not com_clean:
            continue

        for cand in cand_by_initial.get(initial, []):
            pair_key = (cand["candidate_acct"], com["pc_acct"], role)
            if pair_key in already_matched:
                continue

            score = fuzz.token_sort_ratio(cand["candidate_name_clean"], com_clean)
            if score >= FUZZY_THRESHOLD:
                results.append({
                    "candidate_name": cand["candidate_name"],
                    "candidate_acct": cand["candidate_acct"],
                    "pc_acct":        com["pc_acct"],
                    "pc_name":        com["pc_name"],
                    "pc_type":        com["pc_type"],
                    "link_type":      role,
                    "confidence":     round(score / 100, 2),
                })
                already_matched.add(pair_key)

    return results


def main(force: bool = False) -> int:
    print("=== Script 18: Link Candidates to Political Committees ===\n")

    if OUTPUT_CSV.exists() and not force:
        print(f"Skipped — {OUTPUT_CSV.name} already exists (use --force to rebuild)")
        return 0

    cand_path = PROCESSED_DIR / "candidates.csv"
    com_path  = PROCESSED_DIR / "committees.csv"

    for p in (cand_path, com_path):
        if not p.exists():
            print(f"ERROR: {p} not found. Run 02_download_registry.py + 05_import_registry.py first.",
                  file=sys.stderr)
            return 1

    print(f"Loading candidates from {cand_path.name} ...", flush=True)
    candidates = load_candidates(cand_path)
    print(f"  {len(candidates):,} candidates loaded")

    print(f"Loading committees from {com_path.name} ...", flush=True)
    committees = load_committees(com_path)
    print(f"  {len(committees):,} committees loaded\n")

    all_rows: list[dict] = []
    matched_pairs: set = set()

    for role in ("chair", "treasurer"):
        print(f"Pass 1 — exact {role} match ...", flush=True)
        exact = exact_matches(candidates, committees, role)
        for r in exact:
            matched_pairs.add((r["candidate_acct"], r["pc_acct"], role))
        all_rows.extend(exact)
        print(f"  {len(exact):,} exact {role} matches")

        print(f"Pass 2 — fuzzy {role} match (threshold={FUZZY_THRESHOLD}%) ...", flush=True)
        fuzzy = fuzzy_matches(candidates, committees, role, matched_pairs)
        all_rows.extend(fuzzy)
        print(f"  {len(fuzzy):,} fuzzy {role} matches\n")

    if not all_rows:
        print("WARNING: No candidate→PC links found. Check name field formatting.")
        return 1

    df = pd.DataFrame(all_rows).drop_duplicates(
        subset=["candidate_acct", "pc_acct", "link_type"]
    ).sort_values(["candidate_name", "confidence"], ascending=[True, False])

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT_CSV, index=False)
    print(f"Wrote {len(df):,} links to {OUTPUT_CSV.name}")

    # JSON for frontend
    grouped: dict = {}
    for _, row in df.iterrows():
        acct = str(row["candidate_acct"])
        grouped.setdefault(acct, []).append({
            "pc_acct":    row["pc_acct"],
            "pc_name":    row["pc_name"],
            "pc_type":    row["pc_type"],
            "link_type":  row["link_type"],
            "confidence": row["confidence"],
        })

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(json.dumps(grouped, indent=2))
    print(f"Wrote {len(grouped):,} candidates to {OUTPUT_JSON.name}")

    print("\n=== SUMMARY ===")
    print(f"Total links:        {len(df):,}")
    print(f"Unique candidates:  {df['candidate_acct'].nunique():,}")
    print(f"Unique PCs linked:  {df['pc_acct'].nunique():,}")
    print()
    for lt in ("chair", "treasurer"):
        subset = df[df["link_type"] == lt]
        exact_n = (subset["confidence"] == 1.0).sum()
        fuzzy_n = (subset["confidence"] < 1.0).sum()
        print(f"  {lt:10s}: {len(subset):4d} total  ({exact_n} exact, {fuzzy_n} fuzzy)")

    print("\nSample links:")
    for _, row in df.head(10).iterrows():
        print(f"  {row['candidate_name']:<30s} → {row['pc_name'][:40]:<40s}  [{row['link_type']}, {row['confidence']:.2f}]")

    return 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(main(force=force))
