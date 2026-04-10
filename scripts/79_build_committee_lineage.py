"""
Script 72: Build predecessor/successor committee lineage groups.

Groups committee accounts that represent the same real-world entity over time
(e.g., a PAC that disbanded and re-registered under a new account number).

Algorithm:
  For each candidate with 2+ linked committees (from script 71 output),
  pairwise-compare all committees linked to that candidate.
  Score each pair on up to 3 signals:
    1. Name similarity ≥ 85 (token_sort_ratio)
    2. Shared officer (chair or treasurer name match)
    3. Account number gap suggests temporal succession (proxy for date)
  Require ≥ 2 signals to create a lineage link.
  Hard constraint: both committees must be linked to the SAME candidate.

Output:
  data/processed/committee_lineage.csv

Usage:
    python scripts/72_build_committee_lineage.py
    (Run AFTER script 71)
"""

import csv
import hashlib
import sys
from pathlib import Path

import pandas as pd
from rapidfuzz import fuzz

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR

EDGES_CSV  = PROCESSED_DIR / "candidate_pc_edges.csv"
COMMITTEES = PROCESSED_DIR / "committees.csv"
OUTPUT_CSV = PROCESSED_DIR / "committee_lineage.csv"

NAME_SIM_THRESHOLD  = 85    # token_sort_ratio for committee name similarity
OFFICER_SIM_THRESHOLD = 88  # officer name match threshold
ACCT_GAP_MAX        = 20000 # acct_num gap considered "temporal" (FL DoE assigns sequentially)


def clean(s: str) -> str:
    import re
    return " ".join(re.sub(r"[^A-Z0-9\s]", "", str(s).upper()).split())


def group_id(acct_a: str, acct_b: str) -> str:
    """Deterministic group ID for a pair of accounts."""
    key = "_".join(sorted([acct_a, acct_b]))
    return hashlib.md5(key.encode()).hexdigest()[:16]


def score_pair(com_a: dict, com_b: dict) -> tuple[int, list[str]]:
    """
    Score a committee pair on 3 signals. Returns (score, evidence_parts).
    Requires score >= 2 to create a lineage link.
    """
    score = 0
    evidence = []

    # Signal 1: Name similarity
    name_sim = fuzz.token_sort_ratio(
        clean(com_a.get("committee_name", "")),
        clean(com_b.get("committee_name", ""))
    )
    if name_sim >= NAME_SIM_THRESHOLD:
        score += 1
        evidence.append(f"name similarity {name_sim}%")

    # Signal 2: Shared officer (chair or treasurer)
    for role in ("chair", "treasurer"):
        name_a = clean(f"{com_a.get(f'{role}_first','')} {com_a.get(f'{role}_last','')}".strip())
        name_b = clean(f"{com_b.get(f'{role}_first','')} {com_b.get(f'{role}_last','')}".strip())
        if not name_a or not name_b or len(name_a) < 4 or len(name_b) < 4:
            continue
        sim = fuzz.token_sort_ratio(name_a, name_b)
        if sim >= OFFICER_SIM_THRESHOLD:
            score += 1
            evidence.append(f"shared {role} {name_a} ({sim}%)")
            break  # only count once even if both chair+treasurer match

    # Signal 3: Account gap (proxy for temporal succession)
    # FL DoE assigns acct_nums sequentially; a large gap suggests different eras
    try:
        a_num = int(com_a.get("acct_num", 0))
        b_num = int(com_b.get("acct_num", 0))
        gap = abs(a_num - b_num)
        if 0 < gap <= ACCT_GAP_MAX:
            score += 1
            role = "predecessor" if a_num < b_num else "successor"
            evidence.append(f"acct gap {gap} (suggests succession)")
    except (ValueError, TypeError):
        pass

    return score, evidence


def determine_roles(acct_a: str, acct_b: str) -> tuple[str, str]:
    """Lower acct_num = older = predecessor."""
    try:
        return ("predecessor", "successor") if int(acct_a) < int(acct_b) else ("successor", "predecessor")
    except (ValueError, TypeError):
        return ("predecessor", "successor")


def main() -> int:
    print("=== Script 72: Build Committee Lineage Groups ===\n")

    if not EDGES_CSV.exists():
        print(f"ERROR: {EDGES_CSV.name} not found. Run script 71 first.", file=sys.stderr)
        return 1
    if not COMMITTEES.exists():
        print(f"ERROR: {COMMITTEES.name} not found.", file=sys.stderr)
        return 1

    edges_df = pd.read_csv(EDGES_CSV, dtype=str).fillna("")
    com_df   = pd.read_csv(COMMITTEES, dtype=str).fillna("")

    # Only consider publishable edges (ADMIN_OVERLAP_ONLY not eligible for lineage)
    pub_edges = edges_df[
        (edges_df["is_publishable"] == "true") &
        (edges_df["pc_acct_num"] != "")
    ]

    # Build committee info lookup
    com_info: dict[str, dict] = {}
    for _, row in com_df.iterrows():
        com_info[str(row["acct_num"])] = row.to_dict()

    # Group committees by candidate
    cand_to_pcs: dict[str, set] = {}
    for _, row in pub_edges.iterrows():
        cand = str(row["candidate_acct_num"])
        pc   = str(row["pc_acct_num"])
        cand_to_pcs.setdefault(cand, set()).add(pc)

    candidates_with_multiple = {c: pcs for c, pcs in cand_to_pcs.items() if len(pcs) >= 2}
    print(f"Candidates with 2+ linked committees: {len(candidates_with_multiple):,}")

    # Pairwise comparison
    lineage_records: list[dict] = []
    seen_groups: set[frozenset] = set()  # avoid duplicate pairs
    pairs_scored = 0
    pairs_linked = 0

    for cand_acct, pc_set in candidates_with_multiple.items():
        pc_list = sorted(pc_set)
        for i in range(len(pc_list)):
            for j in range(i + 1, len(pc_list)):
                acct_a, acct_b = pc_list[i], pc_list[j]
                pair_key = frozenset([acct_a, acct_b])
                if pair_key in seen_groups:
                    continue
                seen_groups.add(pair_key)

                com_a = com_info.get(acct_a)
                com_b = com_info.get(acct_b)
                if not com_a or not com_b:
                    continue

                pairs_scored += 1
                score, evidence = score_pair(com_a, com_b)

                if score < 2:
                    continue

                pairs_linked += 1
                gid = group_id(acct_a, acct_b)
                role_a, role_b = determine_roles(acct_a, acct_b)
                evidence_str = "; ".join(evidence)

                lineage_records.append({
                    "group_id": gid, "acct_num": acct_a,
                    "role": role_a, "evidence": evidence_str,
                })
                lineage_records.append({
                    "group_id": gid, "acct_num": acct_b,
                    "role": role_b, "evidence": evidence_str,
                })

    print(f"Pairs scored:  {pairs_scored:,}")
    print(f"Pairs linked:  {pairs_linked:,}")
    print(f"Lineage rows:  {len(lineage_records):,}")

    # Write output
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["group_id", "acct_num", "role", "evidence"])
        writer.writeheader()
        writer.writerows(lineage_records)

    print(f"\nWrote {len(lineage_records):,} rows to {OUTPUT_CSV.name}")

    if lineage_records:
        print("\n=== SAMPLE LINEAGE GROUPS ===")
        shown_groups: set = set()
        for rec in lineage_records:
            gid = rec["group_id"]
            if gid in shown_groups:
                continue
            shown_groups.add(gid)
            group = [r for r in lineage_records if r["group_id"] == gid]
            for r in group:
                com = com_info.get(r["acct_num"], {})
                print(f"  [{r['role']:<12}] {r['acct_num']} — {com.get('committee_name', '?')}")
            print(f"    Evidence: {group[0]['evidence']}")
            if len(shown_groups) >= 5:
                break

    return 0


if __name__ == "__main__":
    sys.exit(main())
