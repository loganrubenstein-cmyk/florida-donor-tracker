"""
Script 58: Comprehensive rebuild of candidate_pc_links.json.

Supersedes scripts 18 + 19 with improved matching strategy and dual-signal
evidence model for confidence tiering:

  Pass 1 — Chair/Treasurer name match (from committees.csv)
      Exact then fuzzy (token_sort_ratio >= 88), blocked by last initial.
      Records signal_role=True for this pair.

  Pass 2 — Active solicitation → committee match (from solicitations index)
      Uses max(token_sort_ratio, token_set_ratio * 0.95) >= 85.
      Records signal_solicitation=True for this pair.

  Pass 3 — Active solicitation → stub (for dissolved/unmatched PCEs)
      When a solicitor matches a candidate but no committee matches the org name,
      adds a stub entry with pc_acct=None. confidence_tier="possible".

  Pass 4 — Withdrawn solicitation stubs (historical affiliations)
      Same as Pass 3 but for withdrawn solicitations, tagged link_type='historical'.

CONFIDENCE TIER MODEL:
  "strong"  — both signal_role AND signal_solicitation present for same (cand, pc) pair
  "possible" — only ONE signal (chair-only OR solicitation-only)
  Stubs are always "possible" since they lack a confirmed committee match.

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
FUZZY_COM_SET        = 88   # committee set ratio threshold

OUTPUT_JSON = Path(__file__).resolve().parent.parent / "public" / "data" / "candidate_pc_links.json"
OUTPUT_CSV  = PROCESSED_DIR / "candidate_pc_links.csv"
SOL_INDEX   = Path(__file__).resolve().parent.parent / "public" / "data" / "solicitations" / "index.json"
COMMITTEES  = PROCESSED_DIR / "committees.csv"
CANDIDATES  = PROCESSED_DIR / "candidates.csv"

_PUNCT       = re.compile(r"[^A-Z0-9\s]")
_HONORABLE   = re.compile(r"the\s+honorable\s*", re.I)
_PREFIX      = re.compile(
    r"^(mr|mrs|ms|dr|sen|rep|gov|atty|rev|hon|judge|justice|"
    r"senator|representative|governor|attorney)\s+",
    re.I,
)
_SUFFIX_TOKS = {"JR", "SR", "II", "III", "IV", "ESQ", "PHD", "MD", "CPA"}


def clean(s: str) -> str:
    return " ".join(_PUNCT.sub("", str(s).upper()).split())


def strip_titles(s: str) -> str:
    s = _HONORABLE.sub("", s)
    s = _PREFIX.sub("", s.strip())
    s = re.sub(r"\(([^)]+)\)", r"\1", s)
    parts = clean(s).split()
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
    name_c = strip_titles(name_str)
    parts  = name_c.split()
    if not parts:
        return None
    init = parts[-1][:1]
    full = " ".join(parts)

    best_score = 0
    best       = None
    for cand in cand_index.get(init, []):
        s_sort = fuzz.token_sort_ratio(full, cand["name_clean"])
        s_set  = fuzz.token_set_ratio(full, cand["name_clean"])
        score  = max(s_sort, s_set * 0.95)
        if score >= FUZZY_CAND_THRESHOLD and score > best_score:
            best_score = score
            best       = cand
    return best


def expand_to_all_accounts(best_cand: dict, person_idx: dict,
                           nameclean_idx: dict) -> list[dict]:
    pid = str(best_cand.get("voter_id", "")).strip()
    pid_rows = person_idx.get(pid, []) if (pid and pid != "0") else []
    nc_rows  = nameclean_idx.get(best_cand["name_clean"], [])

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
    return com_df.to_dict("records")


def match_committee(org_name: str, com_list: list[dict]) -> dict | None:
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


# ── Signal tracking ───────────────────────────────────────────────────────────

def make_signal_key(candidate_acct: str, pc_acct: str) -> tuple:
    return (str(candidate_acct), str(pc_acct) if pc_acct else "")


def record_signal(signals: dict, candidate_name: str, candidate_acct: str,
                  pc_acct: str, pc_name: str, pc_type: str,
                  signal_type: str, score: float,
                  sol_org: str = "", sol_date: str = ""):
    """
    Record a signal for a (candidate_acct, pc_acct) pair.
    signal_type: "role_chair" | "role_treasurer" | "solicitation"
    Accumulates multiple signals; confidence_tier computed later.
    """
    key = make_signal_key(candidate_acct, pc_acct)
    if key not in signals:
        signals[key] = {
            "candidate_name":    candidate_name,
            "candidate_acct":    str(candidate_acct),
            "pc_acct":           str(pc_acct) if pc_acct else "",
            "pc_name":           pc_name,
            "pc_type":           pc_type,
            "has_role":          False,
            "has_solicitation":  False,
            "role_detail":       "",     # "chair" or "treasurer"
            "role_score":        0.0,
            "sol_org":           "",
            "sol_date":          "",
        }
    sig = signals[key]
    if signal_type.startswith("role_"):
        role_name = signal_type[5:]   # "chair" or "treasurer"
        if score > sig["role_score"]:
            sig["has_role"]    = True
            sig["role_detail"] = role_name
            sig["role_score"]  = score
    elif signal_type == "solicitation":
        sig["has_solicitation"] = True
        if sol_org and not sig["sol_org"]:
            sig["sol_org"]  = sol_org
            sig["sol_date"] = sol_date


def build_evidence_note(sig: dict) -> str:
    """Human-readable evidence string for tooltip display."""
    parts = []
    if sig["has_role"]:
        parts.append(f"{sig['role_detail']} of committee (name match score {sig['role_score']:.0f}%)")
    if sig["has_solicitation"]:
        sol_note = f"statement of solicitation filed"
        if sig["sol_org"]:
            sol_note += f" by {sig['sol_org']}"
        if sig["sol_date"]:
            sol_note += f" ({sig['sol_date'][:7]})"
        parts.append(sol_note)
    return "; ".join(parts) if parts else "matched by name"


def compute_confidence_tier(sig: dict) -> str:
    """strong = both role + solicitation; possible = only one."""
    if sig["has_role"] and sig["has_solicitation"]:
        return "strong"
    return "possible"


def determine_link_type(sig: dict) -> str:
    """Primary link_type for display (keep legacy values)."""
    if sig["has_role"] and sig["has_solicitation"]:
        return sig["role_detail"]   # "chair" or "treasurer" (the stronger display label)
    if sig["has_role"]:
        return sig["role_detail"]
    return "solicitation"


# ── Stub row builder ──────────────────────────────────────────────────────────

def make_stub_row(candidate_name: str, candidate_acct: str, pc_name: str,
                  pc_type: str, link_type: str) -> dict:
    """Stub rows have no pc_acct — always confidence_tier=possible."""
    return {
        "candidate_name":   candidate_name,
        "candidate_acct":   str(candidate_acct),
        "pc_acct":          "",
        "pc_name":          pc_name,
        "pc_type":          pc_type,
        "link_type":        link_type,
        "confidence":       0.7 if "historical" not in link_type else 0.6,
        "confidence_tier":  "possible",
        "signal_evidence":  f"solicitation statement filed for {pc_name}; committee not found in registry",
    }


# ── Main ───────────────────────────────────────────────────────────────────────

def main(force: bool = False) -> int:
    print("=== Script 58: Rebuild Candidate → PC Links (dual-signal model) ===\n")

    for p in (COMMITTEES, CANDIDATES):
        if not p.exists():
            print(f"ERROR: {p.name} not found.", file=sys.stderr)
            return 1

    cand_df   = load_candidates()
    com_df    = load_committees()
    sol_list  = load_solicitations()
    cand_idx, person_idx, nameclean_idx = build_cand_index(cand_df)
    com_list  = build_com_list(com_df)

    print(f"Candidates:     {len(cand_df):,}")
    print(f"Committees:     {len(com_df):,}")
    print(f"Solicitations:  {len(sol_list):,}\n")

    # Central signal store — keyed by (candidate_acct, pc_acct)
    signals: dict[tuple, dict] = {}

    # Stub rows (no pc_acct) — tracked separately
    stubs: list[dict] = []
    seen_stubs: set   = set()

    # ── Pass 1: Chair / Treasurer name match ──────────────────────────────────
    p1_added = 0
    for role in ("chair", "treasurer"):
        role_init_col  = f"{role}_last_initial"
        role_clean_col = f"{role}_name_clean"

        for com in com_list:
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
                key = make_signal_key(best_cand["candidate_acct"], com["pc_acct"])
                if key not in signals:
                    p1_added += 1
                record_signal(
                    signals,
                    best_cand["candidate_name"], best_cand["candidate_acct"],
                    com["pc_acct"], com["pc_name"], com["pc_type"],
                    signal_type=f"role_{role}", score=best_score,
                )

    print(f"Pass 1 (chair/treasurer match): {p1_added:,} pairs", flush=True)

    # ── Pre-cache committee matches for solicitation orgs ────────────────────
    print("Pre-caching committee matches for solicitation orgs ...", flush=True)
    all_orgs = set(s["organization"] for s in sol_list)
    com_cache: dict[str, dict | None] = {}
    for org in all_orgs:
        com_cache[org] = match_committee(org, com_list)
    matched_orgs = sum(1 for v in com_cache.values() if v)
    print(f"  Cached {len(com_cache)} orgs ({matched_orgs} matched)\n", flush=True)

    active_sol    = [s for s in sol_list if not s.get("withdrawn")]
    withdrawn_sol = [s for s in sol_list if s.get("withdrawn")]

    # ── Pass 2: Active solicitation → committee match ─────────────────────────
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
            key = make_signal_key(cand["candidate_acct"], com["pc_acct"])
            is_new = key not in signals
            record_signal(
                signals,
                cand["candidate_name"], cand["candidate_acct"],
                com["pc_acct"], com["pc_name"], com["pc_type"],
                signal_type="solicitation", score=0.0,
                sol_org=sol["organization"],
                sol_date=sol.get("received_date", ""),
            )
            if is_new:
                p2_added += 1

    print(f"Pass 2 (active solicitation → committee): {p2_added:,} new pairs")
    print(f"  No candidate match: {p2_no_cand}, No committee match: {p2_no_com}")

    # Count how many pairs got BOTH signals (will be "strong")
    strong_count = sum(1 for s in signals.values() if s["has_role"] and s["has_solicitation"])
    print(f"  Pairs with BOTH signals (will be 'strong'): {strong_count:,}")

    # ── Pass 3: Active solicitation → stub ────────────────────────────────────
    p3_added = 0
    for sol in active_sol:
        if com_cache[sol["organization"]]:
            continue  # handled in Pass 2

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
            if stub_key in seen_stubs:
                continue
            seen_stubs.add(stub_key)
            stubs.append(make_stub_row(
                cand["candidate_name"], acct_str,
                sol["organization"], sol.get("org_type", ""),
                link_type="solicitation_stub",
            ))
            p3_added += 1

    print(f"Pass 3 (active solicitation stubs): {p3_added:,} stubs")

    # ── Pass 4: Withdrawn solicitation stubs ─────────────────────────────────
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
                key = make_signal_key(acct_str, com["pc_acct"])
                is_new = key not in signals
                record_signal(
                    signals,
                    cand["candidate_name"], acct_str,
                    com["pc_acct"], com["pc_name"], com["pc_type"],
                    signal_type="solicitation", score=0.0,
                    sol_org=sol["organization"],
                    sol_date=sol.get("received_date", ""),
                )
                # Mark as historical in the signal record for link_type override
                signals[key].setdefault("is_historical", True)
                if is_new:
                    p4_added += 1
            else:
                stub_key = (acct_str, f"__hist__{clean(sol['organization'])}")
                if stub_key in seen_stubs:
                    continue
                seen_stubs.add(stub_key)
                stubs.append(make_stub_row(
                    cand["candidate_name"], acct_str,
                    sol["organization"], sol.get("org_type", ""),
                    link_type="historical_stub",
                ))
                p4_added += 1

    print(f"Pass 4 (withdrawn/historical): {p4_added:,} links/stubs")

    # ── Materialize signal rows ───────────────────────────────────────────────
    rows: list[dict] = []
    for sig in signals.values():
        confidence_tier = compute_confidence_tier(sig)
        is_historical   = sig.get("is_historical", False)

        link_type = determine_link_type(sig)
        if is_historical and not (sig["has_role"] and sig["has_solicitation"]):
            link_type = "historical"

        confidence = 1.0 if confidence_tier == "strong" else (
            round(sig["role_score"] / 100, 2) if sig["has_role"] else 0.85
        )

        rows.append({
            "candidate_name":   sig["candidate_name"],
            "candidate_acct":   sig["candidate_acct"],
            "pc_acct":          sig["pc_acct"],
            "pc_name":          sig["pc_name"],
            "pc_type":          sig["pc_type"],
            "link_type":        link_type,
            "confidence":       confidence,
            "confidence_tier":  confidence_tier,
            "signal_evidence":  build_evidence_note(sig),
        })

    rows.extend(stubs)
    print(f"\nTotal rows: {len(rows):,} ({len(signals):,} committee links + {len(stubs):,} stubs)")

    # ── Write CSV ─────────────────────────────────────────────────────────────
    df_out = pd.DataFrame(rows).sort_values(
        ["candidate_name", "confidence"], ascending=[True, False]
    )
    df_out.to_csv(OUTPUT_CSV, index=False)
    print(f"Wrote {len(df_out):,} rows to {OUTPUT_CSV.name}")

    # ── Write JSON ────────────────────────────────────────────────────────────
    grouped: dict = {}
    for _, r in df_out.iterrows():
        acct = str(r["candidate_acct"])
        grouped.setdefault(acct, []).append({
            "pc_acct":          r["pc_acct"],
            "pc_name":          r["pc_name"],
            "pc_type":          r["pc_type"],
            "link_type":        r["link_type"],
            "confidence":       float(r["confidence"]),
            "confidence_tier":  r["confidence_tier"],
            "signal_evidence":  r["signal_evidence"],
        })

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(json.dumps(grouped, indent=2))
    print(f"Rebuilt JSON: {len(grouped):,} candidates with links")

    # ── Summary ───────────────────────────────────────────────────────────────
    print("\n=== SUMMARY BY LINK TYPE ===")
    for lt in ("chair", "treasurer", "solicitation", "historical", "solicitation_stub", "historical_stub"):
        n = sum(1 for r in rows if r["link_type"] == lt)
        print(f"  {lt:<22s}: {n:,}")

    print("\n=== CONFIDENCE TIER BREAKDOWN ===")
    strong  = sum(1 for r in rows if r.get("confidence_tier") == "strong")
    possible = sum(1 for r in rows if r.get("confidence_tier") == "possible")
    print(f"  strong  (both signals): {strong:,}")
    print(f"  possible (one signal):  {possible:,}")
    print(f"  Total links:            {len(rows):,}")
    print(f"  Candidates linked:      {len(grouped):,}")

    # ── Spot checks ───────────────────────────────────────────────────────────
    spot_check = {
        "79799": "Ron DeSantis (2022 Gov)",
        "84371": "Ron DeSantis (2024 Pres)",
        "70276": "Ron DeSantis (2018 Gov)",
        "84508": "Rick Scott (2024 Sen)",
        "71039": "Rick Scott (2018 Gov)",
        "79408": "Charlie Crist (2022 Gov)",
        "74238": "Charlie Crist (2020 Rep)",
    }
    print("\n=== SPOT CHECKS ===")
    for acct, label in spot_check.items():
        links = grouped.get(acct, [])
        print(f"  {label} ({acct}): {len(links)} links")
        for lk in links[:4]:
            print(f"    [{lk['confidence_tier']:<8}] [{lk['link_type']:<12}] "
                  f"{lk['pc_name'][:45]} | {lk['signal_evidence'][:60]}")

    return 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(main(force=force))
