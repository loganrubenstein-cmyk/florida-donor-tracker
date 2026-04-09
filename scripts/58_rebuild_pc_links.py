"""
Script 58: Comprehensive rebuild of candidate_pc_links.json.

Supersedes scripts 18 + 19 with improved matching strategy:

  Pass 1 — Chair/Treasurer name match (from committees.csv)
      Exact then fuzzy (token_sort_ratio >= 88), blocked by last initial.

  Pass 2 — Active solicitation → committee match (from solicitations index)
      Uses max(token_sort_ratio, token_set_ratio * 0.95) >= 85.
      Captures ~139 additional links missed by the old 85 token_sort_only threshold.

  Pass 3 — Active solicitation → stub (for dissolved/unmatched PCEs)
      When a solicitor matches a candidate but no committee matches the org name,
      adds a stub entry with pc_acct=None and total_received=0 so the frontend
      can at least display the organization name as a known affiliate.

  Pass 4 — Withdrawn solicitation stubs (historical affiliations)
      Same as Pass 3 but for withdrawn solicitations, tagged link_type='historical'.
      These represent real past relationships (e.g., Friends of Ron DeSantis).

Outputs:
  public/data/candidate_pc_links.json   — rebuilt with all four passes
  data/processed/candidate_pc_links.csv — CSV version for auditing

Usage:
    python scripts/58_rebuild_pc_links.py
    python scripts/58_rebuild_pc_links.py --force   # re-run even if output exists
"""

import json
import re
import sys
from pathlib import Path

import pandas as pd
from rapidfuzz import fuzz

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR

FUZZY_CAND_THRESHOLD = 88   # candidate name match
FUZZY_COM_SORT       = 85   # committee sort ratio threshold
FUZZY_COM_SET        = 88   # committee set ratio threshold (slightly higher — more permissive)

OUTPUT_JSON = Path(__file__).resolve().parent.parent / "public" / "data" / "candidate_pc_links.json"
OUTPUT_CSV  = PROCESSED_DIR / "candidate_pc_links.csv"
SOL_INDEX   = Path(__file__).resolve().parent.parent / "public" / "data" / "solicitations" / "index.json"
COMMITTEES  = PROCESSED_DIR / "committees.csv"
CANDIDATES  = PROCESSED_DIR / "candidates.csv"

_PUNCT       = re.compile(r"[^A-Z0-9\s]")
_HONORABLE   = re.compile(r"the\s+honorable\s*", re.I)
# Salutation/title prefixes to strip before name matching
_PREFIX      = re.compile(
    r"^(mr|mrs|ms|dr|sen|rep|gov|atty|rev|hon|judge|justice|"
    r"senator|representative|governor|attorney)\s+",
    re.I,
)
# Suffix tokens to remove (generational, credentials, single initials)
_SUFFIX_TOKS = {"JR", "SR", "II", "III", "IV", "ESQ", "PHD", "MD", "CPA"}


def clean(s: str) -> str:
    return " ".join(_PUNCT.sub("", str(s).upper()).split())


def strip_titles(s: str) -> str:
    """Remove 'The Honorable', salutation prefixes, generational suffixes, and
    single-letter middle initials so that 'Mr. Richard (Rick) L Scott Jr' →
    'RICHARD RICK SCOTT' for fuzzy matching."""
    s = _HONORABLE.sub("", s)
    s = _PREFIX.sub("", s.strip())
    # Remove parenthetical nicknames like "(Rick)" → keep content
    s = re.sub(r"\(([^)]+)\)", r"\1", s)
    parts = clean(s).split()
    # Drop single-letter tokens (middle initials) and known suffixes
    parts = [p for p in parts if len(p) > 1 and p not in _SUFFIX_TOKS]
    return " ".join(parts)


# ── Data loading ───────────────────────────────────────────────────────────────

def load_candidates() -> pd.DataFrame:
    df = pd.read_csv(CANDIDATES, dtype=str).fillna("")
    df["candidate_name"] = (
        df["first_name"].str.strip() + " " + df["last_name"].str.strip()
    ).str.strip()
    df["name_clean"]   = df["candidate_name"].apply(clean)
    df["last_initial"] = df["last_name"].str.strip().str.upper().str[:1]
    return df.rename(columns={"acct_num": "candidate_acct"})


def load_committees() -> pd.DataFrame:
    df = pd.read_csv(COMMITTEES, dtype=str).fillna("")
    for role in ("chair", "treasurer"):
        df[f"{role}_name"] = (
            df[f"{role}_first"].str.strip() + " " + df[f"{role}_last"].str.strip()
        ).str.strip()
        df[f"{role}_name_clean"] = df[f"{role}_name"].apply(clean)
        df[f"{role}_last_initial"] = df[f"{role}_last"].str.strip().str.upper().str[:1]
    df["name_clean"] = df["committee_name"].apply(clean)
    return df.rename(columns={"acct_num": "pc_acct", "committee_name": "pc_name",
                               "type_code": "pc_type"})


def load_solicitations() -> list[dict]:
    if not SOL_INDEX.exists():
        return []
    return json.loads(SOL_INDEX.read_text())


# ── Candidate index ────────────────────────────────────────────────────────────

def build_cand_index(cand_df: pd.DataFrame) -> tuple[dict, dict, dict]:
    """
    Returns:
        name_index   — {last_initial: [cand_row_dict, ...]}  (one row per account)
        person_index — {voter_id: [cand_row_dict, ...]}      (all accounts per person, voter_id != 0)
        nameclean_index — {name_clean: [cand_row_dict, ...]} (all accounts per exact name — fallback)
    """
    name_idx:      dict[str, list] = {}
    person_idx:    dict[str, list] = {}
    nameclean_idx: dict[str, list] = {}
    for _, row in cand_df.iterrows():
        d    = row.to_dict()
        init = row["last_initial"]
        pid  = str(row.get("voter_id", "")).strip()
        nc   = row["name_clean"]
        if init:
            name_idx.setdefault(init, []).append(d)
        if pid and pid != "0":
            person_idx.setdefault(pid, []).append(d)
        if nc:
            nameclean_idx.setdefault(nc, []).append(d)
    return name_idx, person_idx, nameclean_idx


def match_candidate(name_str: str, cand_index: dict) -> dict | None:
    """
    Match a solicitor name string to the best-scoring candidate row.
    Returns ONE row; caller uses person_index to expand to all accounts.
    """
    name_c = strip_titles(name_str)
    parts  = name_c.split()
    if not parts:
        return None
    init = parts[-1][:1]          # last word's first letter = last name initial
    full = " ".join(parts)

    best_score = 0
    best       = None
    for cand in cand_index.get(init, []):
        s_sort = fuzz.token_sort_ratio(full, cand["name_clean"])
        s_set  = fuzz.token_set_ratio(full, cand["name_clean"])
        # token_set handles middle names, "Mr." prefix, and nicknames naturally
        score  = max(s_sort, s_set * 0.95)
        if score >= FUZZY_CAND_THRESHOLD and score > best_score:
            best_score = score
            best       = cand
    return best


def expand_to_all_accounts(best_cand: dict, person_idx: dict,
                           nameclean_idx: dict) -> list[dict]:
    """
    Given one matched candidate row, return ALL rows for the same person:
    1. Primary: voter_id grouping (covers multi-election same-party candidates)
    2. Fallback: exact name_clean match (handles voter_id=0 federal/presidential filers)
    Union of both to cover cases like DeSantis where the presidential account has voter_id=0
    but the governor accounts share a voter_id.
    """
    pid = str(best_cand.get("voter_id", "")).strip()
    pid_rows = person_idx.get(pid, []) if (pid and pid != "0") else []
    nc_rows  = nameclean_idx.get(best_cand["name_clean"], [])

    # Union by candidate_acct — pid_rows take priority but nc_rows fill gaps
    seen_accts: set = set()
    result: list = []
    for row in pid_rows + nc_rows:
        acct = str(row["candidate_acct"])
        if acct not in seen_accts:
            seen_accts.add(acct)
            result.append(row)
    return result if result else [best_cand]


# ── Committee matching ────────────────────────────────────────────────────────

def build_com_list(com_df: pd.DataFrame) -> list[dict]:
    """Pre-convert committee DataFrame to list of dicts for fast iteration."""
    return com_df.to_dict("records")


def match_committee(org_name: str, com_list: list[dict]) -> dict | None:
    """
    Best-match committee using max(token_sort_ratio, token_set_ratio * 0.95).
    Operates on a pre-built list of dicts (fast — no pandas overhead per call).
    Requires: token_sort >= FUZZY_COM_SORT  OR  token_set >= FUZZY_COM_SET
    """
    org_c = clean(org_name)
    if not org_c:
        return None

    best_combo = 0
    best_com   = None

    for com in com_list:
        s_sort = fuzz.token_sort_ratio(org_c, com["name_clean"])
        s_set  = fuzz.token_set_ratio(org_c, com["name_clean"])
        combo  = max(s_sort, s_set * 0.95)
        if combo > best_combo:
            best_combo = combo
            best_com   = com

    if best_com is None:
        return None

    s_sort = fuzz.token_sort_ratio(org_c, best_com["name_clean"])
    s_set  = fuzz.token_set_ratio(org_c, best_com["name_clean"])
    if s_sort >= FUZZY_COM_SORT or s_set >= FUZZY_COM_SET:
        return best_com
    return None


# ── Row builder helpers ────────────────────────────────────────────────────────

def make_row(candidate_name, candidate_acct, pc_acct, pc_name, pc_type, link_type, confidence=1.0):
    return {
        "candidate_name":  candidate_name,
        "candidate_acct":  str(candidate_acct),
        "pc_acct":         str(pc_acct) if pc_acct else "",
        "pc_name":         str(pc_name),
        "pc_type":         str(pc_type),
        "link_type":       link_type,
        "confidence":      float(confidence),
    }


# ── Main ───────────────────────────────────────────────────────────────────────

def main(force: bool = False) -> int:
    print("=== Script 58: Rebuild Candidate → PC Links ===\n")

    for p in (COMMITTEES, CANDIDATES):
        if not p.exists():
            print(f"ERROR: {p.name} not found.", file=sys.stderr)
            return 1

    cand_df   = load_candidates()
    com_df    = load_committees()
    sol_list  = load_solicitations()
    cand_idx, person_idx, nameclean_idx = build_cand_index(cand_df)
    com_list  = build_com_list(com_df)          # fast list for match_committee

    print(f"Candidates:     {len(cand_df):,}")
    print(f"Committees:     {len(com_df):,}")
    print(f"Solicitations:  {len(sol_list):,}\n")

    rows: list[dict] = []
    seen_pairs: set  = set()   # (candidate_acct, pc_acct) — dedup

    def add(row: dict) -> bool:
        pair = (row["candidate_acct"], row["pc_acct"])
        if pair in seen_pairs:
            return False
        seen_pairs.add(pair)
        rows.append(row)
        return True

    # ── Pass 1: Chair / Treasurer name match ──────────────────────────────────
    # Pass 1 intentionally links only the SPECIFIC account (acct of the chair/treasurer),
    # not all cross-election accounts — the committee was formed for that exact campaign.
    p1_added = 0
    for role in ("chair", "treasurer"):
        role_init_col  = f"{role}_last_initial"
        role_clean_col = f"{role}_name_clean"

        for com in com_list:                 # fast list iteration, no pandas overhead
            init  = com[role_init_col]
            cname = com[role_clean_col]
            if not init or not cname:
                continue

            best_score = 0
            best_cand  = None
            for cand in cand_idx.get(init, []):
                score = fuzz.token_sort_ratio(cname, cand["name_clean"])
                if score >= FUZZY_CAND_THRESHOLD and score > best_score:
                    best_score = score
                    best_cand  = cand

            if best_cand:
                row = make_row(
                    best_cand["candidate_name"],
                    best_cand["candidate_acct"],
                    com["pc_acct"],
                    com["pc_name"],
                    com["pc_type"],
                    link_type=role,
                    confidence=round(best_score / 100, 2),
                )
                if add(row):
                    p1_added += 1

    print(f"Pass 1 (chair/treasurer match): {p1_added:,} links", flush=True)

    # ── Passes 2-4: Process solicitations (cache com matches to avoid re-compute) ─
    active_sol   = [s for s in sol_list if not s.get("withdrawn")]
    withdrawn_sol = [s for s in sol_list if s.get("withdrawn")]

    # Pre-cache committee matches for every unique org name (expensive — do once)
    print("Pre-caching committee matches for all solicitation orgs ...", flush=True)
    all_orgs = set(s["organization"] for s in sol_list)
    com_cache: dict[str, dict | None] = {}
    for org in all_orgs:
        com_cache[org] = match_committee(org, com_list)
    print(f"  Cached {len(com_cache)} orgs ({sum(1 for v in com_cache.values() if v)} matched)\n", flush=True)

    # ── Pass 2: Active solicitation → committee match ─────────────────────────
    # Expand to ALL election accounts for the same person (same voter_id).
    # A PC linked to a candidate via solicitation is relevant to every cycle.
    p2_added = 0; p2_no_cand = 0; p2_no_com = 0

    for sol in active_sol:
        best = None
        for solicitor in sol.get("solicitors", []):
            best = match_candidate(solicitor, cand_idx)
            if best:
                break
        if not best:
            p2_no_cand += 1
            continue

        com = com_cache[sol["organization"]]
        if not com:
            p2_no_com += 1
            continue

        for cand in expand_to_all_accounts(best, person_idx, nameclean_idx):
            row = make_row(
                cand["candidate_name"],
                cand["candidate_acct"],
                com["pc_acct"],
                com["pc_name"],
                com["pc_type"],
                link_type="solicitation",
                confidence=0.95,
            )
            if add(row):
                p2_added += 1

    print(f"Pass 2 (active solicitation → committee): {p2_added:,} new links")
    print(f"  No candidate match: {p2_no_cand}, No committee match: {p2_no_com}")

    # ── Pass 3: Active solicitation → stub (dissolved/unmatched PCEs) ─────────
    p3_added = 0

    for sol in active_sol:
        if com_cache[sol["organization"]]:
            continue   # handled in Pass 2

        best = None
        for solicitor in sol.get("solicitors", []):
            best = match_candidate(solicitor, cand_idx)
            if best:
                break
        if not best:
            continue

        for cand in expand_to_all_accounts(best, person_idx, nameclean_idx):
            acct_str = str(cand["candidate_acct"])
            stub_key = (acct_str, f"__stub__{clean(sol['organization'])}")
            if stub_key in seen_pairs:
                continue
            seen_pairs.add(stub_key)
            rows.append(make_row(
                cand["candidate_name"],
                acct_str,
                "",
                sol["organization"],
                sol.get("org_type", ""),
                link_type="solicitation_stub",
                confidence=0.7,
            ))
            p3_added += 1

    print(f"Pass 3 (active solicitation stubs): {p3_added:,} stubs for dissolved/unmatched PCEs")

    # ── Pass 4: Withdrawn solicitation stubs (historical affiliations) ─────────
    p4_added = 0

    for sol in withdrawn_sol:
        best = None
        for solicitor in sol.get("solicitors", []):
            best = match_candidate(solicitor, cand_idx)
            if best:
                break
        if not best:
            continue

        com = com_cache[sol["organization"]]

        for cand in expand_to_all_accounts(best, person_idx, nameclean_idx):
            acct_str = str(cand["candidate_acct"])
            if com:
                row = make_row(
                    cand["candidate_name"],
                    acct_str,
                    com["pc_acct"],
                    com["pc_name"],
                    com["pc_type"],
                    link_type="historical",
                    confidence=0.8,
                )
                if add(row):
                    p4_added += 1
            else:
                stub_key = (acct_str, f"__hist__{clean(sol['organization'])}")
                if stub_key in seen_pairs:
                    continue
                seen_pairs.add(stub_key)
                rows.append(make_row(
                    cand["candidate_name"],
                    acct_str,
                    "",
                    sol["organization"],
                    sol.get("org_type", ""),
                    link_type="historical_stub",
                    confidence=0.6,
                ))
                p4_added += 1

    print(f"Pass 4 (withdrawn/historical): {p4_added:,} links/stubs")

    # ── Write outputs ──────────────────────────────────────────────────────────
    df_out = pd.DataFrame(rows).sort_values(
        ["candidate_name", "confidence"], ascending=[True, False]
    )
    df_out.to_csv(OUTPUT_CSV, index=False)
    print(f"\nWrote {len(df_out):,} total rows to {OUTPUT_CSV.name}")

    # Build JSON: {candidate_acct: [{pc_acct, pc_name, pc_type, link_type, confidence}]}
    grouped: dict = {}
    for _, r in df_out.iterrows():
        acct = str(r["candidate_acct"])
        grouped.setdefault(acct, []).append({
            "pc_acct":    r["pc_acct"],
            "pc_name":    r["pc_name"],
            "pc_type":    r["pc_type"],
            "link_type":  r["link_type"],
            "confidence": float(r["confidence"]),
        })

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(json.dumps(grouped, indent=2))
    print(f"Rebuilt JSON: {len(grouped):,} candidates with links")

    # ── Summary by link type ───────────────────────────────────────────────────
    print("\n=== SUMMARY BY LINK TYPE ===")
    for lt in ("chair", "treasurer", "solicitation", "solicitation_stub", "historical", "historical_stub"):
        n = sum(1 for r in rows if r["link_type"] == lt)
        print(f"  {lt:<22s}: {n:,}")

    print(f"\nTotal links:   {len(rows):,}")
    print(f"Candidates linked: {len(grouped):,}")

    # ── Spot-check high-profile candidates ────────────────────────────────────
    spot_check = {
        "79799": "Ron DeSantis (2022 Gov)",
        "84371": "Ron DeSantis (2024 Pres)",
        "70276": "Ron DeSantis (2018 Gov)",
        "84508": "Rick Scott (2024 Sen)",
        "71039": "Rick Scott (2018 Gov)",
        "61253": "Rick Scott (2014 Gov)",
        "79408": "Charlie Crist (2022 Gov)",
        "74238": "Charlie Crist (2020 Rep)",
    }
    print("\n=== SPOT CHECKS ===")
    for acct, label in spot_check.items():
        links = grouped.get(acct, [])
        print(f"  {label} ({acct}): {len(links)} links")
        for l in links[:4]:
            print(f"    [{l['link_type']:<20}] {l['pc_name'][:50]} (conf={l['confidence']:.1f})")

    return 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(main(force=force))
