"""
Script 71: Evidence-based candidate → committee linkage.

Replaces script 58 with a multi-source, typed-edge model.
Every edge carries provenance (source_type, source_record_id, match_method, match_score).
Publication rule: only edges with is_publishable=True are shown on the site.
ADMIN_OVERLAP_ONLY is never publishable alone.

Six passes:
  1  SOLICITATION_CONTROL        — DS-DE 102 / public solicitations
  2  DIRECT_CONTRIBUTION_TO_CAND — CAN-type expenditures (committee→candidate)
  3  OTHER_DISTRIBUTION_TO_CAND  — DIS-type expenditures
  4  IEC_FOR_OR_AGAINST          — Independent expenditures targeting candidate
  5  ECC_FOR_OR_AGAINST          — Electioneering communications targeting candidate
  6  ADMIN_OVERLAP_ONLY          — Shared treasurer/chair/phone/address/name (NOT publishable)

Outputs:
  data/processed/candidate_pc_edges.csv

Usage:
    python scripts/71_build_linkage_edges.py
"""

import csv
import json
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path

import pandas as pd
from rapidfuzz import fuzz

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR

# ── Paths ─────────────────────────────────────────────────────────────────────

ROOT         = Path(__file__).resolve().parent.parent
SOL_INDEX    = ROOT / "public" / "data" / "solicitations" / "index.json"
SOL_CSV      = PROCESSED_DIR.parent / "raw" / "solicitations" / "solicitations.csv"
COMMITTEES   = PROCESSED_DIR / "committees.csv"
CANDIDATES   = PROCESSED_DIR / "candidates.csv"
EXPENDITURES = PROCESSED_DIR / "expenditures.csv"
OUTPUT_CSV   = PROCESSED_DIR / "candidate_pc_edges.csv"

# ── Thresholds ────────────────────────────────────────────────────────────────

FUZZY_CAND_THRESHOLD   = 88
FUZZY_COM_SORT         = 90   # raised from 85; blocks near-synonyms like "Forward"↔"Onward"
FUZZY_COM_SET          = 90
FUZZY_COM_RATIO_FLOOR  = 65   # min character-level ratio to be eligible in match_committee()
PROF_TREASURER_MIN     = 5    # treasurer serving N+ committees = professional
COMMON_SURNAME_MIN     = 10   # surname shared by N+ candidates = common
COMMON_SURNAME_SCORE   = 95   # suppress admin-overlap if fuzzy + common name below this

# ── Text cleaning (reused from script 58) ─────────────────────────────────────

_PUNCT     = re.compile(r"[^A-Z0-9\s]")
_HONORABLE = re.compile(r"the\s+honorable\s*", re.I)
_PREFIX    = re.compile(
    r"^(mr|mrs|ms|dr|sen|rep|gov|atty|rev|hon|judge|justice|"
    r"senator|representative|governor|attorney)\s+",
    re.I,
)
_SUFFIX_TOKS = {"JR", "SR", "II", "III", "IV", "ESQ", "PHD", "MD", "CPA"}

# Legal entity suffixes to strip before name ratio checks.
# After clean(), punctuation is gone — match space-separated tokens at end.
_LEGAL_SUFFIX_RE = re.compile(
    r"\s+(COMMITTEE\s+INC|COMMITTEE\s+LLC|COMMITTEE|INCORPORATED|INC|LLC|CORP|"
    r"FOUNDATION|FEDERATION|ASSOCIATION|ASSOC|ASSN|ORGANIZATION)$"
)


def _strip_legal(s: str) -> str:
    """Strip leading 'THE' and trailing legal entity tokens for name matching."""
    s = re.sub(r"^THE\s+", "", s)
    return _LEGAL_SUFFIX_RE.sub("", s).strip()


def clean(s: str) -> str:
    return " ".join(_PUNCT.sub("", str(s).upper()).split())


def strip_titles(s: str) -> str:
    s = _HONORABLE.sub("", s)
    s = _PREFIX.sub("", s.strip())
    s = re.sub(r"\(([^)]+)\)", r"\1", s)
    parts = clean(s).split()
    parts = [p for p in parts if len(p) > 1 and p not in _SUFFIX_TOKS]
    return " ".join(parts)


def normalize_phone(p: str) -> str:
    return re.sub(r"\D", "", str(p).strip())


def normalize_addr(a: str) -> str:
    return clean(str(a).split(",")[0])  # first line, cleaned


# ── Edge data class ──────────────────────────────────────────────────────────

@dataclass
class Edge:
    candidate_acct_num: str
    pc_acct_num: str          # "" for stubs
    pc_name: str
    pc_type: str
    edge_type: str
    direction: str            # "support" | "opposition" | ""
    evidence_summary: str
    source_type: str
    source_record_id: str
    match_method: str
    match_score: str          # stored as string for CSV; "" if not applicable
    amount: str               # "" if not applicable
    edge_date: str            # "" if not applicable
    is_publishable: bool
    is_candidate_specific: bool = False  # True = PAC total attributed to candidate in soft money


# ── Data loading ─────────────────────────────────────────────────────────────

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
    df["phone_norm"] = df["phone"].apply(normalize_phone)
    df["addr_norm"]  = df["addr1"].apply(normalize_addr) if "addr1" in df.columns else ""
    return df.rename(columns={"acct_num": "pc_acct", "committee_name": "pc_name",
                               "type_code": "pc_type"})


def load_solicitations_index() -> list[dict]:
    if not SOL_INDEX.exists():
        return []
    return json.loads(SOL_INDEX.read_text())


def load_solicitations_csv() -> list[dict]:
    if not SOL_CSV.exists():
        return []
    rows = []
    with open(SOL_CSV, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


# ── Candidate index & matching ───────────────────────────────────────────────

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


def match_candidate(name_str: str, cand_index: dict,
                    threshold: int = FUZZY_CAND_THRESHOLD) -> tuple[dict | None, float]:
    """Returns (best_candidate, score) or (None, 0)."""
    name_c = strip_titles(name_str)
    parts  = name_c.split()
    if not parts:
        return None, 0
    init = parts[-1][:1]
    full = " ".join(parts)

    best_score = 0
    best       = None
    for cand in cand_index.get(init, []):
        s_sort = fuzz.token_sort_ratio(full, cand["name_clean"])
        s_set  = fuzz.token_set_ratio(full, cand["name_clean"])
        score  = max(s_sort, s_set * 0.95)
        if score >= threshold and score > best_score:
            best_score = score
            best       = cand
    return best, best_score


def expand_to_all_accounts(best_cand: dict, person_idx: dict,
                           nameclean_idx: dict) -> list[dict]:
    pid = str(best_cand.get("voter_id", "")).strip()
    pid_rows = person_idx.get(pid, []) if (pid and pid != "0") else []
    nc_rows  = nameclean_idx.get(best_cand["name_clean"], [])

    seen: set = set()
    result: list = []
    for row in pid_rows + nc_rows:
        acct = str(row["candidate_acct"])
        if acct not in seen:
            seen.add(acct)
            result.append(row)
    return result if result else [best_cand]


# ── Committee matching ───────────────────────────────────────────────────────

def match_committee(org_name: str, com_list: list[dict]) -> tuple[dict | None, float]:
    """Returns (best_committee, score) or (None, 0).

    Selection uses token_sort/token_set but penalises candidates whose
    character-level ratio is below 65. This prevents word-transposition
    false positives (e.g. "Forward Florida" vs "Florida Forward", ratio≈47%)
    from winning the selection and then either passing or displacing the
    correct match. The ratio penalty is applied during selection, not just
    as a post-filter, so that a failing candidate can never push aside a
    better-ratio match.
    """
    org_c = clean(org_name)
    if not org_c:
        return None, 0

    best_combo  = 0
    best_com    = None

    for com in com_list:
        s_sort  = fuzz.token_sort_ratio(org_c, com["name_clean"])
        s_set   = fuzz.token_set_ratio(org_c, com["name_clean"])
        s_ratio = fuzz.ratio(org_c, com["name_clean"])
        # Exclude candidates that fail the ratio floor — they cannot be
        # best_com regardless of their token scores.
        if s_ratio < FUZZY_COM_RATIO_FLOOR:
            continue
        combo = max(s_sort, s_set * 0.95)
        if combo > best_combo:
            best_combo = combo
            best_com   = com

    if best_com is None:
        return None, 0

    s_sort = fuzz.token_sort_ratio(org_c, best_com["name_clean"])
    s_set  = fuzz.token_set_ratio(org_c, best_com["name_clean"])
    if s_sort >= FUZZY_COM_SORT or s_set >= FUZZY_COM_SET:
        return best_com, best_combo
    return None, 0


# ── False-positive filter data ───────────────────────────────────────────────

def build_professional_treasurers(com_df: pd.DataFrame) -> set[str]:
    """Treasurer name_clean values appearing as treasurer of 5+ committees."""
    counts = com_df["treasurer_name_clean"].value_counts()
    return set(counts[counts >= PROF_TREASURER_MIN].index) - {""}


def build_common_surnames(cand_df: pd.DataFrame) -> set[str]:
    """Last-initial groups with 10+ candidates."""
    counts = cand_df["last_initial"].value_counts()
    # Actually need last-name counts, not initial counts
    last_names = cand_df["last_name"].str.strip().str.upper()
    name_counts = last_names.value_counts()
    return set(name_counts[name_counts >= COMMON_SURNAME_MIN].index)


# ── Pass 1: SOLICITATION_CONTROL ─────────────────────────────────────────────

def pass_1_solicitation_control(
    cand_idx: dict, person_idx: dict, nameclean_idx: dict,
    com_list: list[dict], sol_index: list[dict], sol_csv: list[dict],
) -> list[Edge]:
    edges: list[Edge] = []
    seen: set[tuple] = set()   # (candidate_acct, pc_acct_or_org) dedup

    # ── Sub-source A: solicitations/index.json ────────────────────────────────
    # Pre-cache committee matches
    all_orgs = set(s["organization"] for s in sol_index)
    com_cache: dict[str, tuple] = {}
    for org in all_orgs:
        com_cache[org] = match_committee(org, com_list)

    for sol in sol_index:
        best_cand = None
        best_score = 0
        for solicitor in sol.get("solicitors", []):
            cand, score = match_candidate(solicitor, cand_idx)
            if cand:
                best_cand = cand
                best_score = score
                break
        if not best_cand:
            continue

        com, com_score = com_cache[sol["organization"]]
        is_withdrawn = sol.get("withdrawn", False)
        sol_date = sol.get("file_date", sol.get("received_date", ""))

        for cand in expand_to_all_accounts(best_cand, person_idx, nameclean_idx):
            acct = str(cand["candidate_acct"])
            if com:
                key = (acct, str(com["pc_acct"]))
                if key in seen:
                    continue
                seen.add(key)
                withdrawn_note = " (withdrawn)" if is_withdrawn else ""
                edges.append(Edge(
                    candidate_acct_num=acct,
                    pc_acct_num=str(com["pc_acct"]),
                    pc_name=com["pc_name"],
                    pc_type=com.get("pc_type", ""),
                    edge_type="SOLICITATION_CONTROL",
                    direction="",
                    evidence_summary=f"Statement of solicitation filed{withdrawn_note} for {sol['organization']} ({sol_date})",
                    source_type="solicitation_index",
                    source_record_id=str(sol.get("id", "")),
                    match_method="fuzzy_name",
                    match_score=f"{best_score:.1f}",
                    amount="",
                    edge_date=sol_date,
                    is_publishable=True,
                ))
            else:
                # Stub: solicitation exists but committee not found in registry
                stub_key = (acct, f"__stub__{clean(sol['organization'])}")
                if stub_key in seen:
                    continue
                seen.add(stub_key)
                edges.append(Edge(
                    candidate_acct_num=acct,
                    pc_acct_num="",
                    pc_name=sol["organization"],
                    pc_type=sol.get("org_type", ""),
                    edge_type="SOLICITATION_CONTROL",
                    direction="",
                    evidence_summary=f"Solicitation filed for {sol['organization']}; committee not found in registry",
                    source_type="solicitation_index",
                    source_record_id=str(sol.get("id", "")),
                    match_method="fuzzy_name",
                    match_score=f"{best_score:.1f}",
                    amount="",
                    edge_date=sol_date,
                    is_publishable=True,
                ))

    p1a_count = len(edges)

    # ── Sub-source B: solicitations.csv (structured name fields) ─────────────
    # Build exact lookup by (LAST, FIRST) → candidate records
    exact_lookup: dict[tuple, list] = {}
    for _, row in pd.DataFrame([c for bucket in cand_idx.values() for c in bucket]).iterrows():
        last = str(row.get("last_name", "")).strip().upper()
        first = str(row.get("first_name", "")).strip().upper()
        if last:
            exact_lookup.setdefault((last, first), []).append(row.to_dict())

    # Group CSV rows by (solicitor, org) — take latest non-withdrawal
    from collections import defaultdict
    sol_groups: dict[tuple, list] = defaultdict(list)
    for row in sol_csv:
        key = (row.get("last_name", "").strip().upper(),
               row.get("first_name", "").strip().upper(),
               row.get("organization", "").strip())
        sol_groups[key].append(row)

    for (last, first, org), filings in sol_groups.items():
        # Check if latest filing is a withdrawal
        filings_sorted = sorted(filings, key=lambda r: r.get("received_date", ""))
        latest = filings_sorted[-1]
        is_withdrawn = "withdrawal" in latest.get("form_type", "").lower()

        cands = exact_lookup.get((last, first), [])
        if not cands:
            continue

        com, com_score = match_committee(org, com_list)

        for cand in cands:
            acct = str(cand["candidate_acct"])
            if com:
                key = (acct, str(com["pc_acct"]))
                if key in seen:
                    continue
                seen.add(key)
                withdrawn_note = " (withdrawn)" if is_withdrawn else ""
                edges.append(Edge(
                    candidate_acct_num=acct,
                    pc_acct_num=str(com["pc_acct"]),
                    pc_name=com["pc_name"],
                    pc_type=com.get("pc_type", ""),
                    edge_type="SOLICITATION_CONTROL",
                    direction="",
                    evidence_summary=f"Solicitation CSV: {first} {last} → {org}{withdrawn_note} ({latest.get('received_date', '')})",
                    source_type="solicitation_csv",
                    source_record_id=f"{last}_{first}_{org}",
                    match_method="exact_name",
                    match_score="100.0",
                    amount="",
                    edge_date=latest.get("received_date", ""),
                    is_publishable=True,
                ))
            else:
                stub_key = (acct, f"__stub_csv__{clean(org)}")
                if stub_key in seen:
                    continue
                seen.add(stub_key)
                edges.append(Edge(
                    candidate_acct_num=acct,
                    pc_acct_num="",
                    pc_name=org,
                    pc_type="",
                    edge_type="SOLICITATION_CONTROL",
                    direction="",
                    evidence_summary=f"Solicitation CSV: {first} {last} → {org}; committee not in registry",
                    source_type="solicitation_csv",
                    source_record_id=f"{last}_{first}_{org}",
                    match_method="exact_name",
                    match_score="100.0",
                    amount="",
                    edge_date=latest.get("received_date", ""),
                    is_publishable=True,
                ))

    p1b_count = len(edges) - p1a_count
    print(f"Pass 1 (SOLICITATION_CONTROL): {len(edges)} edges ({p1a_count} from index, {p1b_count} from CSV)")
    return edges


# ── Pass 2 + 3: DIRECT_CONTRIBUTION / OTHER_DISTRIBUTION ────────────────────

def _acct_from_expend_file(source_file: str) -> str:
    """Extract acct_num from 'Expend_12345.txt' → '12345'."""
    m = re.search(r"Expend_(\w+)\.txt", source_file, re.I)
    return m.group(1) if m else ""


# Regex to strip informal campaign name suffixes before candidate matching.
# "DOROTHY HUKILL CAMPAIGN" → "DOROTHY HUKILL", "GIMENEZ FOR MAYOR" → "GIMENEZ"
_CAMP_SUFFIX_RE = re.compile(
    r"\s+(?:CAMPAIGN|CAMP|CMPN|FOR\s+\w[\w\s]{0,30})?$", re.I
)
_FOR_ROLE_RE = re.compile(r"\s+FOR\s+\w[\w\s]{0,30}$", re.I)


def _strip_campaign_suffix(name: str) -> str:
    """Strip 'CAMPAIGN', 'FOR MAYOR', 'FOR STATE SENATOR' etc. from vendor_name."""
    n = _CAMP_SUFFIX_RE.sub("", name.strip()).strip()
    n = _FOR_ROLE_RE.sub("", n).strip()
    return n


def pass_2_direct_contribution(
    com_df: pd.DataFrame,
    cand_df: pd.DataFrame,
    expend_csv: Path,
) -> list[Edge]:
    """
    Pass 2: PAC → candidate direct contributions (type_code CAN).

    Source: data/processed/expenditures.csv
    CAN rows: vendor_name is an INFORMAL candidate campaign name
    (e.g. "DOROTHY HUKILL CAMPAIGN", "GIMENEZ FOR MAYOR"), NOT a registered
    committee name. committees.csv only has PAC-type committees; candidate
    campaign accounts are in candidates.csv.

    Approach:
    1. Strip campaign suffixes from vendor_name to get a personal name.
    2. Fuzzy-match the stripped name against cand_df via match_candidate().
    3. Emit edge: source_acct (spending PAC) → matched candidate.
    """
    if not expend_csv.exists():
        print("Pass 2 (DIRECT_CONTRIBUTION_TO_CAND): expenditures.csv not found, skipping")
        return []

    df = pd.read_csv(expend_csv, dtype=str, low_memory=False)
    can_rows = df[df["type_code"] == "CAN"].copy()
    if can_rows.empty:
        print("Pass 2 (DIRECT_CONTRIBUTION_TO_CAND): no CAN rows, skipping")
        return []

    # Build acct-number → committee map for source PAC name lookup
    com_acct_map: dict[str, dict] = {
        str(row["pc_acct"]): row.to_dict() for _, row in com_df.iterrows()
    }

    # Build candidate index for name matching
    cand_idx, person_idx, nameclean_idx = build_cand_index(cand_df)

    edges: list[Edge] = []
    seen: set[tuple] = set()
    matched = 0
    skipped = 0

    for _, row in can_rows.iterrows():
        source_acct = _acct_from_expend_file(str(row.get("source_file", "")))
        if not source_acct:
            skipped += 1
            continue

        vendor = str(row.get("vendor_name", "")).strip()
        if not vendor:
            skipped += 1
            continue

        # Strip campaign suffixes to get a matchable personal name
        stripped = _strip_campaign_suffix(vendor)
        if len(stripped) < 4:
            skipped += 1
            continue

        best_cand, score = match_candidate(stripped, cand_idx, threshold=88)
        if not best_cand:
            skipped += 1
            continue

        candidate_acct = str(best_cand["candidate_acct"])
        key = (source_acct, candidate_acct)
        if key in seen:
            continue
        seen.add(key)

        source_com      = com_acct_map.get(source_acct, {})
        source_pac_name = source_com.get("pc_name", f"Committee {source_acct}")
        amount_str      = str(row.get("amount", "")).strip()

        edges.append(Edge(
            candidate_acct_num   = candidate_acct,
            pc_acct_num          = source_acct,
            pc_name              = source_pac_name,
            pc_type              = source_com.get("pc_type", ""),
            edge_type            = "DIRECT_CONTRIBUTION_TO_CAND",
            direction            = "support",
            evidence_summary     = f"{source_pac_name} paid ${amount_str} directly to {vendor} ({best_cand['candidate_name']}, score {score:.0f}%)",
            source_type          = "EXPENDITURE_RECORD",
            source_record_id     = str(row.get("source_file", "")),
            match_method         = "vendor_name_candidate_match",
            match_score          = f"{score:.1f}",
            amount               = amount_str,
            edge_date            = str(row.get("expenditure_date", "")),
            is_publishable       = True,
            is_candidate_specific= False,
        ))
        matched += 1

    print(f"Pass 2 (DIRECT_CONTRIBUTION_TO_CAND): {len(can_rows):,} CAN rows → {matched:,} edges ({skipped:,} skipped)")
    return edges


# ── Pass 4+5: IEC_FOR_OR_AGAINST / ECC_FOR_OR_AGAINST ───────────────────────

# Common patterns in IEC purpose fields that contain candidate names.
_IEC_FOR_RE  = re.compile(r"IND\s+EXP\s+FOR\s+(.+?)(?:\s*[,;]|\s+SIGN|\s+CAMP|\s+MAILER|\s+AD|\s+RADIO|\s+TV|$)", re.I)
_IEC_AGN_RE  = re.compile(r"IND\s+EXP\s+AGAINST\s+(.+?)(?:\s*[,;]|\s+SIGN|\s+CAMP|\s+MAILER|\s+AD|\s+RADIO|\s+TV|$)", re.I)
_CAMP_RE     = re.compile(r"([A-Z][A-Z\s]+?)\s+(?:CAMPAIGN|CAMP|CMPN)(?:\s|$|,)", re.I)
_NAME_SIGN_RE = re.compile(r"([A-Z][A-Z\s]{3,30}?)\s+SIGNS?(?:\s|,|$)", re.I)


def _extract_cand_name_from_purpose(purpose: str) -> tuple[str, str]:
    """
    Try to extract a candidate name and direction from an IEC/ECC purpose field.
    Returns (candidate_name, direction) where direction is 'support' | 'opposition' | 'support'.
    Returns ('', '') if no reliable extraction possible.
    """
    p = purpose.strip()
    # Pattern 1: "IND EXP FOR [NAME]..."
    m = _IEC_FOR_RE.search(p)
    if m:
        return m.group(1).strip(), "support"
    # Pattern 2: "IND EXP AGAINST [NAME]..."
    m = _IEC_AGN_RE.search(p)
    if m:
        return m.group(1).strip(), "opposition"
    # Pattern 3: "[NAME] CAMPAIGN" or "[NAME] CMPN"
    m = _CAMP_RE.search(p)
    if m:
        return m.group(1).strip(), "support"
    # Pattern 4: "[NAME] SIGNS"
    m = _NAME_SIGN_RE.search(p)
    if m:
        return m.group(1).strip(), "support"
    return "", ""


def pass_4_5_iec_ecc(
    com_df: pd.DataFrame,
    cand_df: pd.DataFrame,
    cand_idx: dict,
    expend_csv: Path,
) -> list[Edge]:
    """
    Pass 4: IEC_FOR_OR_AGAINST — independent expenditures (IEC/IEI type_codes).
    Pass 5: ECC_FOR_OR_AGAINST — electioneering communications (ECC/ECI type_codes).

    Strategy:
    - ECC/ECI: vendor_name often IS a candidate committee name → same approach as pass 2.
    - IEC/IEI: purpose field contains candidate name text → regex extract → fuzzy match.

    Direction:
    - IEC / ECC = "for" / support
    - IEI / ECI = "against" / opposition
    """
    if not expend_csv.exists():
        print("Pass 4/5 (IEC/ECC): expenditures.csv not found, skipping")
        return []

    df = pd.read_csv(expend_csv, dtype=str, low_memory=False)
    ie_rows = df[df["type_code"].isin(["IEC", "IEI", "ECC", "ECI"])].copy()
    if ie_rows.empty:
        print("Pass 4/5 (IEC/ECC): no IEC/IEI/ECC/ECI rows, skipping")
        return []

    # Committee name map for vendor_name matching (ECC path)
    com_name_map: dict[str, dict] = {
        row["name_clean"]: row.to_dict() for _, row in com_df.iterrows()
    }
    com_acct_map: dict[str, dict] = {
        str(row["pc_acct"]): row.to_dict() for _, row in com_df.iterrows()
    }
    cand_accts: set[str] = {str(r["candidate_acct"]) for _, r in cand_df.iterrows()}

    direction_map = {"IEC": "support", "ECC": "support", "IEI": "opposition", "ECI": "opposition"}

    edges: list[Edge] = []
    seen: set[tuple] = set()
    matched_ecc = matched_iec = skipped = 0

    for _, row in ie_rows.iterrows():
        source_acct = _acct_from_expend_file(str(row.get("source_file", "")))
        if not source_acct:
            skipped += 1
            continue

        type_code  = str(row.get("type_code", "")).strip()
        direction  = direction_map.get(type_code, "support")
        edge_label = "IEC_FOR_OR_AGAINST" if type_code in ("IEC", "IEI") else "ECC_FOR_OR_AGAINST"
        amount_str = str(row.get("amount", "")).strip()

        source_com      = com_acct_map.get(source_acct, {})
        source_pac_name = source_com.get("pc_name", f"Committee {source_acct}")

        vendor      = str(row.get("vendor_name", "")).strip()
        purpose_raw = str(row.get("purpose", "")).strip()

        candidate_acct = ""
        matched_name   = ""

        # ── ECC path: try vendor_name as committee name ──────────────────────
        if type_code in ("ECC", "ECI") and vendor:
            vendor_clean = clean(vendor)
            recipient = None
            if vendor_clean in com_name_map:
                recipient = com_name_map[vendor_clean]
            else:
                first5 = vendor_clean[:5]
                cands_here = [c for cn, c in com_name_map.items() if cn[:5] == first5]
                best_com, score = match_committee(vendor, cands_here)
                if best_com and score >= 90:
                    recipient = best_com

            if recipient:
                r_acct = str(recipient.get("pc_acct", ""))
                r_type = str(recipient.get("pc_type", ""))
                if r_type in ("CCE", "CAO") and r_acct in cand_accts:
                    candidate_acct = r_acct
                    matched_name   = recipient.get("pc_name", vendor)
                    matched_ecc   += 1

        # ── IEC path: parse candidate name from purpose ───────────────────────
        if not candidate_acct and type_code in ("IEC", "IEI") and purpose_raw:
            parsed_name, parsed_dir = _extract_cand_name_from_purpose(purpose_raw)
            if parsed_dir:
                direction = parsed_dir
            if parsed_name and len(parsed_name) >= 4:
                best_cand, score = match_candidate(parsed_name, cand_idx, threshold=88)
                if best_cand:
                    candidate_acct = str(best_cand["candidate_acct"])
                    matched_name   = best_cand["candidate_name"]
                    matched_iec   += 1

        if not candidate_acct:
            skipped += 1
            continue

        key = (source_acct, candidate_acct)
        if key in seen:
            continue
        seen.add(key)

        edges.append(Edge(
            candidate_acct_num   = candidate_acct,
            pc_acct_num          = source_acct,
            pc_name              = source_pac_name,
            pc_type              = source_com.get("pc_type", ""),
            edge_type            = edge_label,
            direction            = direction,
            evidence_summary     = f"{source_pac_name} filed {type_code} re: {matched_name} (${amount_str})",
            source_type          = "EXPENDITURE_RECORD",
            source_record_id     = str(row.get("source_file", "")),
            match_method         = "vendor_name_match" if type_code in ("ECC", "ECI") else "purpose_text_parse",
            match_score          = "",
            amount               = amount_str,
            edge_date            = str(row.get("expenditure_date", "")),
            is_publishable       = True,
            is_candidate_specific= False,
        ))

    total_ie = len(ie_rows)
    print(f"Pass 4/5 (IEC/ECC): {total_ie:,} rows → {len(edges):,} edges "
          f"(ECC vendor match: {matched_ecc:,}, IEC purpose parse: {matched_iec:,}, skipped: {skipped:,})")
    return edges


# ── Pass 6: ADMIN_OVERLAP_ONLY ───────────────────────────────────────────────

def pass_6_admin_overlap(
    cand_df: pd.DataFrame, com_df: pd.DataFrame,
    cand_idx: dict,
    prof_treasurers: set[str], common_surnames: set[str],
) -> list[Edge]:
    edges: list[Edge] = []
    seen: set[tuple] = set()

    # Precompute candidate phone/address for overlap detection
    cand_phones: dict[str, set] = {}    # phone_norm → set of candidate_acct
    cand_addrs:  dict[str, set] = {}    # addr_norm  → set of candidate_acct
    for _, c in cand_df.iterrows():
        acct = str(c["candidate_acct"])
        phone = normalize_phone(str(c.get("phone", "")))
        if len(phone) >= 7:
            cand_phones.setdefault(phone, set()).add(acct)
        addr = normalize_addr(str(c.get("addr1", "")))
        if len(addr) >= 5:
            cand_addrs.setdefault(addr, set()).add(acct)

    com_list = com_df.to_dict("records")

    # Pre-compute name_contains lookup: list of (name_clean, acct, candidate_name)
    # Avoids 1,887 × 11,586 iterrows() calls — O(n) build, O(k) per committee
    name_contains_list = [
        (row["name_clean"], str(row["candidate_acct"]), row["candidate_name"])
        for _, row in cand_df.iterrows()
        if row["name_clean"] and len(row["name_clean"]) >= 5
    ]

    for com in com_list:
        evidence_parts: dict[str, list] = {}   # candidate_acct → [evidence strings]

        # Sub-signal A/B: Chair/Treasurer name matches candidate
        for role in ("chair", "treasurer"):
            init_col  = f"{role}_last_initial"
            clean_col = f"{role}_name_clean"
            init  = com[init_col]
            cname = com[clean_col]
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
                acct = str(best_cand["candidate_acct"])
                last_name = str(best_cand.get("last_name", "")).strip().upper()

                # Common surname filter
                if last_name in common_surnames and best_score < COMMON_SURNAME_SCORE:
                    continue

                is_prof = cname in prof_treasurers if role == "treasurer" else False
                method = "professional_treasurer" if is_prof else "fuzzy_name"
                evidence_parts.setdefault(acct, []).append(
                    f"{role} match ({best_score}%){' [professional treasurer]' if is_prof else ''}"
                )
                key = (acct, str(com["pc_acct"]), f"role_{role}")
                if key not in seen:
                    seen.add(key)
                    edges.append(Edge(
                        candidate_acct_num=acct,
                        pc_acct_num=str(com["pc_acct"]),
                        pc_name=com["pc_name"],
                        pc_type=com.get("pc_type", ""),
                        edge_type="ADMIN_OVERLAP_ONLY",
                        direction="",
                        evidence_summary=f"{role} name match: {com[f'{role}_name']} ↔ {best_cand['candidate_name']} (score {best_score}%)",
                        source_type="registry",
                        source_record_id=f"committees.csv:{com['pc_acct']}",
                        match_method=method,
                        match_score=f"{best_score:.1f}",
                        amount="",
                        edge_date="",
                        is_publishable=False,
                    ))

        # Sub-signal C: Shared phone
        com_phone = com.get("phone_norm", "")
        if len(com_phone) >= 7 and com_phone in cand_phones:
            for acct in cand_phones[com_phone]:
                key = (acct, str(com["pc_acct"]), "phone")
                if key not in seen:
                    seen.add(key)
                    edges.append(Edge(
                        candidate_acct_num=acct,
                        pc_acct_num=str(com["pc_acct"]),
                        pc_name=com["pc_name"],
                        pc_type=com.get("pc_type", ""),
                        edge_type="ADMIN_OVERLAP_ONLY",
                        direction="",
                        evidence_summary=f"Shared phone: {com_phone}",
                        source_type="registry",
                        source_record_id=f"committees.csv:{com['pc_acct']}",
                        match_method="exact_phone",
                        match_score="",
                        amount="",
                        edge_date="",
                        is_publishable=False,
                    ))

        # Sub-signal D: Shared address
        com_addr = com.get("addr_norm", "")
        if len(com_addr) >= 5 and com_addr in cand_addrs:
            for acct in cand_addrs[com_addr]:
                key = (acct, str(com["pc_acct"]), "addr")
                if key not in seen:
                    seen.add(key)
                    edges.append(Edge(
                        candidate_acct_num=acct,
                        pc_acct_num=str(com["pc_acct"]),
                        pc_name=com["pc_name"],
                        pc_type=com.get("pc_type", ""),
                        edge_type="ADMIN_OVERLAP_ONLY",
                        direction="",
                        evidence_summary=f"Shared address: {com_addr}",
                        source_type="registry",
                        source_record_id=f"committees.csv:{com['pc_acct']}",
                        match_method="exact_address",
                        match_score="",
                        amount="",
                        edge_date="",
                        is_publishable=False,
                    ))

        # Sub-signal E: Committee name contains candidate name (vectorized)
        com_name_upper = clean(com["pc_name"])
        for cand_nc, acct, cand_name in name_contains_list:
            if cand_nc in com_name_upper:
                key = (acct, str(com["pc_acct"]), "name_contains")
                if key not in seen:
                    seen.add(key)
                    edges.append(Edge(
                        candidate_acct_num=acct,
                        pc_acct_num=str(com["pc_acct"]),
                        pc_name=com["pc_name"],
                        pc_type=com.get("pc_type", ""),
                        edge_type="ADMIN_OVERLAP_ONLY",
                        direction="",
                        evidence_summary=f"Committee name contains candidate name: {cand_name}",
                        source_type="registry",
                        source_record_id=f"committees.csv:{com['pc_acct']}",
                        match_method="name_contains",
                        match_score="",
                        amount="",
                        edge_date="",
                        is_publishable=False,
                    ))

    print(f"Pass 6 (ADMIN_OVERLAP_ONLY): {len(edges)} edges (never publishable)")
    return edges


# ── Post-processing: is_candidate_specific ──────────────────────────────────

_NAME_SUFFIXES = {"JR", "SR", "II", "III", "IV", "V"}

def _check_name_in_pac(cand_nc: str, pac_nc: str) -> bool:
    """Candidate's last name (≥5 chars) appears as a whole word in the PAC name.

    Strips common suffixes (JR, SR, II–V) so 'ALBRITTON BEN JR' → 'BEN'
    doesn't match — we want 'ALBRITTON'.
    """
    parts = cand_nc.split() if cand_nc else []
    # Strip trailing suffixes to find the actual surname
    while parts and parts[-1] in _NAME_SUFFIXES:
        parts.pop()
    last_name = parts[-1] if parts else ""
    return bool(
        last_name and len(last_name) >= 5 and
        re.search(r'\b' + re.escape(last_name) + r'\b', pac_nc)
    )


def compute_candidate_specific(
    all_edges: list,
    cand_df: pd.DataFrame,
    sol_csv: list[dict] = None,    # kept for signature compatibility — not used directly
    sol_index: list[dict] = None,  # kept for signature compatibility — not used directly
    com_df: pd.DataFrame = None,   # optional — for diagnostic output
) -> list:
    """
    Mark each publishable edge as is_candidate_specific=True.

    Attribution standard: a PAC is candidate-specific only when there is
    verifiable evidence of candidate control — a DS-DE 102 filing or the
    PAC being named after the candidate.  Spending patterns (which candidates
    the PAC gave money to) indicate support, not control, and do not qualify.

    For SOLICITATION_CONTROL edges, a PAC is candidate-specific when:
      (a) The candidate's last name (≥5 chars) appears as a whole word in the PAC name, OR
      (b) This candidate is the ONLY person who ever filed a solicitation for this PAC
          (determined from the edges themselves, not raw org-name text — avoids matching
          failures when committees are renamed, e.g. "Empower Parents PAC" vs
          "Friends of Ron DeSantis (now Empower Parents PAC)").

    Running-mate pairs (e.g. DeSantis + Nunez both filed for "Friends of Ron DeSantis"):
      DeSantis → specific (name in PAC), Nunez → affiliated (name not in PAC, not sole filer).
    Sole-filer PACs without candidate name (e.g. "Florida Green PAC" / Simpson):
      Simpson → specific (sole filer).
    Multi-candidate PACs (e.g. "Watchdog PAC" / 5 filers):
      → affiliated for all (neither condition met).

    For all other edge types (DIRECT_CONTRIBUTION, IEC, ECC, etc.):
      (a) Same (candidate, PAC) pair has a specific SOLICITATION_CONTROL edge, OR
      (b) Candidate's last name (≥5 chars) in PAC name AND direction != 'opposition'

    is_candidate_specific=True means script 81 will include this PAC's total_received
    in the candidate's soft_money_total.
    """
    # Build candidate name lookups
    cand_names: dict[str, str] = {str(r["candidate_acct"]): r["name_clean"]
                                   for r in cand_df.to_dict("records")}
    # Last-name lookup used for sole_filer identity check
    cand_last: dict[str, str] = {
        str(r["candidate_acct"]): clean(str(r.get("last_name", "")))
        for r in cand_df.to_dict("records")
    }
    # Committee chair last-name lookup: pc_acct_num → cleaned chair_last.
    # Used to grant is_candidate_specific when the candidate is the registered
    # chair of the matched committee but a co-filer (e.g. a running-mate) blocks
    # the sole_filer path. Chair status plus a solicitation filing = direct control.
    com_chair_last: dict[str, str] = {}
    if com_df is not None:
        for r in com_df.to_dict("records"):
            acct = str(r.get("pc_acct", ""))   # load_committees() renames acct_num→pc_acct
            last = clean(str(r.get("chair_last", "")))
            if acct and last:
                com_chair_last[acct] = last

    # Count distinct filers per normalized org name using the raw sol_csv.
    # We key by org name (not pc_acct_num) because fuzzy committee matching can map
    # many differently-named orgs to the same acct_num, making a sole-filer PAC
    # (e.g. "Conservative Florida" / McClure) appear multi-candidate.
    # Using the org name directly avoids that pollution.
    #
    # Recency rule: when an org has multiple filers, only count filers whose
    # most recent filing is within 6 years of the newest filing for that org.
    # This handles committee succession (e.g. Hukill 2013 → DeSantis 2024 for
    # Florida Freedom Fund) where old filings are never retroactively marked
    # withdrawn in the source data even though the committee changed hands.
    from collections import defaultdict
    from datetime import datetime, timedelta

    # Build candidate last-name set so sole_filer only counts candidate filers.
    # Non-candidate filers (staffers, treasurers) should not block sole_filer.
    # We match on last name only — first names in solicitation CSV often include
    # middle names (e.g. "Charlie Joseph" vs "Charlie"), making exact (last, first)
    # matching too strict. The final sf_last == cand_last_nc check still gates attribution.
    cand_last_names: set[str] = set()
    for _, row in cand_df.iterrows():
        last = str(row.get("last_name", "")).strip().upper()
        if last:
            cand_last_names.add(last)

    # Index-based sole_filer override: the SolicitationsReport index is the
    # authoritative published FL DoE record. When it lists exactly one candidate-
    # solicitor for an org, that overrides the CSV-based count (which includes
    # amendment filings and later officers that don't represent original control).
    #
    # Running-mate rule: when exactly 2 candidate filers exist for the same org
    # and one filed as Governor and the other as Lt. Governor (or equivalent top-
    # vs. running-mate ticket pairing), the Governor/top-ticket filer is the
    # principal. We reduce to that one candidate so sole_filer can fire.
    _HONORABLE_RE = re.compile(r"the\s+honorable\s*", re.I)
    # Build per-org list of (last, sol_type) for all candidate solicitors in index
    _index_org_entries: dict[str, list] = defaultdict(list)  # norm_org → [(last, sol_type)]
    for sol in (sol_index or []):
        org = clean(sol.get("organization", "") or sol.get("org_name", ""))
        if not org:
            continue
        sol_type = sol.get("type", "")
        for solicitor in sol.get("solicitors", []):
            s_stripped = _HONORABLE_RE.sub("", solicitor).strip()
            parts = s_stripped.split()
            if parts:
                last = parts[-1].upper()
                if last in cand_last_names:
                    _index_org_entries[org].append((last, sol_type))

    # Reduce running-mate pairs: if all entries for an org are from the same
    # gubernatorial ticket (one Governor, one Lt. Governor), keep only the
    # top-of-ticket (Governor) filer so sole_filer can attribute to them.
    _TOP_TICKET_RE = re.compile(r"\bgovernor\b", re.I)
    _RUNNING_MATE_RE = re.compile(r"\blt\.?\s*governor\b", re.I)
    _index_org_filers: dict[str, set] = defaultdict(set)  # norm_org → set of last_name (str)
    for org, entries in _index_org_entries.items():
        if len(entries) == 2:
            tops  = [(l, t) for l, t in entries if _TOP_TICKET_RE.search(t) and not _RUNNING_MATE_RE.search(t)]
            mates = [(l, t) for l, t in entries if _RUNNING_MATE_RE.search(t)]
            if len(tops) == 1 and len(mates) == 1:
                # Running-mate pair — attribute to top-of-ticket only
                _index_org_filers[org].add(tops[0][0])
                continue
        for last, _ in entries:
            _index_org_filers[org].add(last)

    # Step 1: collect (last, first, date) per org
    _org_filer_dates: dict[str, list] = defaultdict(list)  # norm_org → [(last, first, date)]
    for row in (sol_csv or []):
        ft = row.get("form_type", "")
        if "statement of solicitation" not in ft.lower():
            continue
        org  = clean(row.get("organization", ""))
        last = row.get("last_name", "").strip().upper()
        frst = row.get("first_name", "").strip().upper()
        raw_date = row.get("received_date", "") or ""
        try:
            filing_date = datetime.strptime(raw_date[:10], "%Y-%m-%d")
        except ValueError:
            filing_date = datetime.min
        if org and last:
            _org_filer_dates[org].append((last, frst, filing_date))

    # Step 2: for each org, find the most recent filing date, then keep only
    # filers whose latest filing is within 6 years of that most-recent date.
    _RECENCY_WINDOW = timedelta(days=6 * 365)
    _sol_org_filers: dict[str, set] = defaultdict(set)  # norm_org → set of (last, first)
    for org, entries in _org_filer_dates.items():
        most_recent = max(e[2] for e in entries)
        cutoff = most_recent - _RECENCY_WINDOW
        # Keep only filers whose latest filing for this org is on or after cutoff
        filer_latest: dict[tuple, datetime] = {}
        for last, frst, dt in entries:
            key = (last, frst)
            if key not in filer_latest or dt > filer_latest[key]:
                filer_latest[key] = dt
        for (last, frst), latest_dt in filer_latest.items():
            if latest_dt >= cutoff and last in cand_last_names:
                _sol_org_filers[org].add((last, frst))

    def _extract_org_from_evidence(evidence: str) -> str:
        """Pull org name from 'Statement of solicitation filed for ORG (DATE)'."""
        import re as _re
        m = _re.search(r"filed(?:\s*\(withdrawn\))?\s+for\s+(.+?)\s*\(", evidence or "", _re.I)
        return clean(m.group(1)) if m else ""

    # ── Pre-pass: identify (candidate, PAC) pairs with specific solicitation edges ──
    # Specificity rules (applied to ALL solicitation edges, including withdrawn):
    #   name_in_pac — candidate's last name (≥5 chars) is in the PAC name. Withdrawal
    #                 doesn't un-name the PAC, so this check is withdrawal-agnostic.
    #   sole_filer  — only one person ever filed a solicitation for this exact org name
    #                 (non-withdrawn filings only, keyed by normalized org name).
    #
    # Exclusion: if a PAC's registered name contains another candidate's last name
    # (i.e. it's a "named PAC"), sole_filer does not override for a different candidate.
    # This prevents e.g. Ingoglia from claiming Friends of Ron DeSantis via sole_filer
    # on "Empower Parents PAC" (the renamed version of the same acct).

    # First, identify which PAC acct_nums are "named" (contain a candidate's surname ≥5 chars)
    # and which candidate name is embedded.
    named_pac_accts: dict[str, str] = {}  # pc_acct_num → name_clean of the naming candidate
    for e in all_edges:
        if e.edge_type != "SOLICITATION_CONTROL" or not e.is_publishable or not e.pc_acct_num:
            continue
        cand_nc = cand_names.get(e.candidate_acct_num, "")
        pac_nc  = clean(e.pc_name)
        if _check_name_in_pac(cand_nc, pac_nc):
            named_pac_accts[e.pc_acct_num] = cand_nc

    # Track specificity candidates with metadata for the tie-breaking pass.
    # Maps (cand_acct, pc_acct) → {'via_name': bool, 'date': datetime}
    _spec_candidates: dict[tuple, dict] = {}

    def _parse_edge_date(evidence: str) -> "datetime":
        """Extract filing date from evidence string '... (MM/DD/YYYY)'."""
        import re as _re
        m = _re.search(r"\((\d{2}/\d{2}/\d{4})\)", evidence or "")
        if m:
            try:
                return datetime.strptime(m.group(1), "%m/%d/%Y")
            except ValueError:
                pass
        return datetime.min

    for e in all_edges:
        if e.edge_type != "SOLICITATION_CONTROL" or not e.is_publishable or not e.pc_acct_num:
            continue
        cand_nc = cand_names.get(e.candidate_acct_num, "")
        pac_nc  = clean(e.pc_name)
        name_in_pac = _check_name_in_pac(cand_nc, pac_nc)

        # sole_filer: check against the specific org name in the evidence, not the acct_num.
        # Suppressed when the PAC is a named PAC and this candidate's name isn't the one in it.
        is_withdrawn = "(withdrawn)" in (e.evidence_summary or "").lower()
        pac_is_named_for_other = (
            e.pc_acct_num in named_pac_accts and
            named_pac_accts[e.pc_acct_num] != cand_nc
        )
        if not is_withdrawn and not pac_is_named_for_other:
            org_key    = _extract_org_from_evidence(e.evidence_summary)
            # Also require the org name to genuinely match the registered committee name.
            # fuzz.ratio (not token_set_ratio) prevents subset false-positives like
            # "Conservative Principles for Florida" matching to "Conservative Florida".
            # _strip_legal removes leading "THE" and trailing legal suffixes (INC, LLC,
            # COMMITTEE, etc.) before comparison — handles cases like "All About Florida"
            # (sol filing) vs "All About Florida Committee, Inc." (registered name).
            _org_norm = _strip_legal(org_key) if org_key else org_key
            _pac_norm = _strip_legal(clean(e.pc_name))
            org_matches_pac = bool(
                org_key and fuzz.ratio(_org_norm, _pac_norm) >= 90
            )
            filers = _sol_org_filers.get(org_key, set())
            # Prefer index-based filers when the org appears in the authoritative
            # SolicitationsReport index — the index is more precise than the CSV
            # (it shows the current registered solicitors, not historical amendments).
            index_filers = _index_org_filers.get(org_key, None)
            if index_filers is not None and len(index_filers) > 0:
                # Index available: use it as the authoritative filer set.
                # Convert to (last, "") tuples to match the sole_filer path below.
                filers = {(last, "") for last in index_filers}
            if org_matches_pac and len(filers) == 1:
                # Verify this candidate IS the sole filer (not just that one exists).
                # Prevents e.g. Powell from claiming Edmonds's PAC after recency excludes Powell.
                (sf_last, _sf_first) = next(iter(filers))
                cand_last_nc = cand_last.get(e.candidate_acct_num, "")
                sole_filer = bool(sf_last and cand_last_nc and sf_last == cand_last_nc)
            else:
                sole_filer = False
        else:
            sole_filer = False

        # Chair-specific: candidate is the registered chair of the matched committee
        # AND has a solicitation filing for it. Handles the case where a running-mate
        # (e.g. a Lt. Governor pick) also filed a solicitation, blocking sole_filer,
        # but the committee chair clearly identifies the primary candidate.
        chair_specific = False
        if not name_in_pac and not sole_filer and e.pc_acct_num:
            chair_last_com = com_chair_last.get(e.pc_acct_num, "")
            cand_last_nc   = cand_last.get(e.candidate_acct_num, "")
            if (chair_last_com and cand_last_nc
                    and len(chair_last_com) >= 4
                    and chair_last_com == cand_last_nc):
                chair_specific = True

        if name_in_pac or sole_filer or chair_specific:
            key = (e.candidate_acct_num, e.pc_acct_num)
            filing_date = _parse_edge_date(e.evidence_summary)
            existing = _spec_candidates.get(key)
            if existing is None:
                _spec_candidates[key] = {"via_name": name_in_pac, "date": filing_date}
            else:
                # Keep the name_in_pac flag and the most recent date seen for this pair
                _spec_candidates[key] = {
                    "via_name": existing["via_name"] or name_in_pac,
                    "date": max(existing["date"], filing_date),
                }

    # ── Tie-breaking pass: sole_filer collision resolution ───────────────────
    # When multiple candidates are both specific for the same pc_acct_num purely
    # via sole_filer (org name variants like "True Conservative" vs "True Conservatives"
    # both fuzzy-matching to the same registered committee), keep only the candidate
    # with the most recent filing. Candidates with name_in_pac are never removed.
    from collections import defaultdict as _dd
    pac_specific_cands: dict[str, list] = _dd(list)
    for (cand_acct, pc_acct), meta in _spec_candidates.items():
        pac_specific_cands[pc_acct].append((cand_acct, meta))

    specific_sol_pairs: set[tuple] = set()
    for pc_acct, entries in pac_specific_cands.items():
        named_entries    = [(c, m) for c, m in entries if m["via_name"]]
        sole_only_entries = [(c, m) for c, m in entries if not m["via_name"]]

        # Always include name_in_pac entries
        for cand_acct, _ in named_entries:
            specific_sol_pairs.add((cand_acct, pc_acct))

        if sole_only_entries:
            # Group by person (last name) — same person across election cycles is not a collision
            by_person: dict[str, list] = _dd(list)
            for cand_acct, meta in sole_only_entries:
                person_key = cand_last.get(cand_acct, cand_acct)
                by_person[person_key].append((cand_acct, meta))

            if len(by_person) == 1:
                # Only one person (possibly multiple cycles) — keep all their entries
                for cand_acct, _ in sole_only_entries:
                    specific_sol_pairs.add((cand_acct, pc_acct))
            else:
                # Multiple different people via sole_filer → keep only the person
                # whose most recent filing for this PAC is the latest overall.
                # This resolves org-name variant collisions (e.g. "True Conservative"
                # vs "True Conservatives") by deferring to the current controller.
                winning_person = max(
                    by_person.items(),
                    key=lambda kv: max(m["date"] for _, m in kv[1])
                )[0]
                for cand_acct, _ in by_person[winning_person]:
                    specific_sol_pairs.add((cand_acct, pc_acct))

    # ── Main pass: compute specificity for all edges ─────────────────────────
    from dataclasses import replace
    result = []
    for e in all_edges:
        if not e.is_publishable or not e.pc_acct_num:
            result.append(e)
            continue

        if e.edge_type == "SOLICITATION_CONTROL":
            is_specific = (e.candidate_acct_num, e.pc_acct_num) in specific_sol_pairs
        else:
            # Signal 1: this (candidate, PAC) pair also has a specific solicitation edge
            has_specific_sol = (e.candidate_acct_num, e.pc_acct_num) in specific_sol_pairs
            # Signal 2: PAC is named after the candidate (non-opposition only)
            cand_nc = cand_names.get(e.candidate_acct_num, "")
            pac_nc  = clean(e.pc_name)
            name_in_pac = _check_name_in_pac(cand_nc, pac_nc)
            is_specific = has_specific_sol or (name_in_pac and e.direction != "opposition")

        result.append(replace(e, is_candidate_specific=is_specific))

    specific_count   = sum(1 for e in result if e.is_publishable and e.is_candidate_specific)
    affiliated_count = sum(1 for e in result if e.is_publishable and not e.is_candidate_specific)
    print(f"\nCandidate-specific publishable edges: {specific_count:,}")
    print(f"Affiliated (multi-candidate) edges:   {affiliated_count:,}")

    # ── Diagnostic: compare with old only_one logic ──────────────────────────
    # Compute what the old heuristic would have produced for non-solicitation edges
    pac_to_people: dict[str, set] = {}
    for e in all_edges:
        if e.is_publishable and e.pc_acct_num:
            person_id = cand_names.get(e.candidate_acct_num, e.candidate_acct_num)
            pac_to_people.setdefault(e.pc_acct_num, set()).add(person_id)

    old_specific = 0
    new_specific = 0
    lost_pairs: dict[tuple, str] = {}   # (cand, pac) → pc_name
    gained_pairs: dict[tuple, str] = {}
    for e in result:
        if not e.is_publishable or not e.pc_acct_num or e.edge_type == "SOLICITATION_CONTROL":
            continue
        pair = (e.candidate_acct_num, e.pc_acct_num)
        old_val = len(pac_to_people.get(e.pc_acct_num, set())) == 1
        new_val = e.is_candidate_specific
        if old_val:
            old_specific += 1
        if new_val:
            new_specific += 1
        if old_val and not new_val and pair not in lost_pairs:
            lost_pairs[pair] = e.pc_name
        if new_val and not old_val and pair not in gained_pairs:
            gained_pairs[pair] = e.pc_name

    print(f"\n  ── Diagnostic: old vs new (non-solicitation edges) ──")
    print(f"  Old (only_one) specific:  {old_specific:,}")
    print(f"  New (sol+name) specific:  {new_specific:,}")
    print(f"  Pairs LOST specificity:   {len(lost_pairs):,}")
    print(f"  Pairs GAINED specificity: {len(gained_pairs):,}")

    if lost_pairs and com_df is not None:
        com_totals = {str(r["pc_acct"]): float(r.get("total_received", 0) or 0)
                      for r in com_df.to_dict("records")}
        lost_sorted = sorted(lost_pairs.items(),
                             key=lambda x: com_totals.get(x[0][1], 0), reverse=True)
        total_lost_dollars = sum(com_totals.get(p[1], 0) for p, _ in lost_sorted)
        print(f"  Total $ losing attribution: ${total_lost_dollars:,.0f}")
        print(f"  Top 10 PACs losing specificity:")
        for (cand, pac), name in lost_sorted[:10]:
            cand_name = cand_names.get(cand, cand)
            tr = com_totals.get(pac, 0)
            print(f"    {name[:50]:<50s} → {cand_name[:25]:<25s} ${tr:>14,.0f}")

    if gained_pairs:
        print(f"  PACs GAINING specificity (name-in-PAC on non-solicitation edges):")
        for (cand, pac), name in list(gained_pairs.items())[:10]:
            cand_name = cand_names.get(cand, cand)
            print(f"    {name[:50]:<50s} → {cand_name[:25]}")

    return result


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    print("=== Script 71: Evidence-Based Candidate → Committee Linkage ===\n")

    for p in (COMMITTEES, CANDIDATES):
        if not p.exists():
            print(f"ERROR: {p.name} not found at {p}", file=sys.stderr)
            return 1

    # Load data
    cand_df   = load_candidates()
    com_df    = load_committees()
    sol_index = load_solicitations_index()
    sol_csv   = load_solicitations_csv()

    cand_idx, person_idx, nameclean_idx = build_cand_index(cand_df)
    com_list = com_df.to_dict("records")

    prof_treasurers = build_professional_treasurers(com_df)
    common_surnames = build_common_surnames(cand_df)

    print(f"Candidates:            {len(cand_df):,}")
    print(f"Committees:            {len(com_df):,}")
    print(f"Solicitations (index): {len(sol_index):,}")
    print(f"Solicitations (CSV):   {len(sol_csv):,}")
    print(f"Prof treasurers:       {len(prof_treasurers):,}")
    print(f"Common surnames:       {len(common_surnames):,}")
    print()

    # Run passes
    all_edges: list[Edge] = []

    all_edges.extend(pass_1_solicitation_control(
        cand_idx, person_idx, nameclean_idx, com_list, sol_index, sol_csv
    ))

    all_edges.extend(pass_2_direct_contribution(com_df, cand_df, EXPENDITURES))

    all_edges.extend(pass_4_5_iec_ecc(com_df, cand_df, cand_idx, EXPENDITURES))

    all_edges.extend(pass_6_admin_overlap(
        cand_df, com_df, cand_idx, prof_treasurers, common_surnames
    ))

    print(f"\n{'='*60}")
    print(f"Total edges: {len(all_edges):,}")

    # ── Post-processing: mark candidate-specific edges ────────────────────────
    all_edges = compute_candidate_specific(all_edges, cand_df, sol_csv, sol_index, com_df)

    # ── Write CSV ────────────────────────────────────────────────────────────
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "candidate_acct_num", "pc_acct_num", "pc_name", "pc_type",
            "edge_type", "direction", "evidence_summary", "source_type",
            "source_record_id", "match_method", "match_score", "amount",
            "edge_date", "is_publishable", "is_candidate_specific",
        ])
        writer.writeheader()
        for edge in all_edges:
            d = asdict(edge)
            d["is_publishable"] = "true" if d["is_publishable"] else "false"
            d["is_candidate_specific"] = "true" if d["is_candidate_specific"] else "false"
            writer.writerow(d)

    print(f"Wrote {len(all_edges):,} edges to {OUTPUT_CSV.name}")

    # ── Summary ──────────────────────────────────────────────────────────────
    print("\n=== SUMMARY BY EDGE TYPE ===")
    from collections import Counter
    type_counts = Counter(e.edge_type for e in all_edges)
    for et, cnt in sorted(type_counts.items(), key=lambda x: -x[1]):
        pub = sum(1 for e in all_edges if e.edge_type == et and e.is_publishable)
        print(f"  {et:<42s}: {cnt:>6,} total, {pub:>6,} publishable")

    pub_total = sum(1 for e in all_edges if e.is_publishable)
    sup_total = sum(1 for e in all_edges if not e.is_publishable)
    cands_with_pub = len(set(e.candidate_acct_num for e in all_edges if e.is_publishable))
    cands_with_sup = len(set(e.candidate_acct_num for e in all_edges if not e.is_publishable))
    print(f"\n  Public links:     {pub_total:,} ({cands_with_pub:,} candidates)")
    print(f"  Suppressed links: {sup_total:,} ({cands_with_sup:,} candidates)")

    # ── Sample evidence ──────────────────────────────────────────────────────
    print("\n=== 5 SAMPLE PUBLISHABLE EDGES ===")
    pub_edges = [e for e in all_edges if e.is_publishable]
    for e in pub_edges[:5]:
        print(f"  [{e.edge_type}] cand={e.candidate_acct_num} → pc={e.pc_acct_num}")
        print(f"    {e.evidence_summary[:90]}")

    print("\n=== 5 SAMPLE SUPPRESSED EDGES ===")
    sup_edges = [e for e in all_edges if not e.is_publishable]
    for e in sup_edges[:5]:
        print(f"  [{e.edge_type}] cand={e.candidate_acct_num} → pc={e.pc_acct_num}")
        print(f"    {e.evidence_summary[:90]}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
