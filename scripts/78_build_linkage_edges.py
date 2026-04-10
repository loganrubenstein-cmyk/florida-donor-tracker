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
FUZZY_CAND_STRICT      = 90   # higher bar for expenditure vendor→candidate matching
FUZZY_COM_SORT         = 85
FUZZY_COM_SET          = 88
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
    """Returns (best_committee, score) or (None, 0)."""
    org_c = clean(org_name)
    if not org_c:
        return None, 0

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


# ── Pass 2: DIRECT_CONTRIBUTION_TO_CANDIDATE ─────────────────────────────────

def pass_2_direct_contributions(
    exp_df: pd.DataFrame, cand_df: pd.DataFrame, cand_idx: dict,
    person_idx: dict, nameclean_idx: dict, com_df: pd.DataFrame,
) -> list[Edge]:
    """
    CAN-type expenditures = committee paying directly to a candidate campaign.
    vendor_name is the candidate/campaign name; source_file gives us the committee acct.
    """
    edges: list[Edge] = []
    seen_pairs: dict[tuple, dict] = {}   # (pc_acct, vendor_clean) → aggregation

    can_rows = exp_df[exp_df["type_code"] == "CAN"]
    print(f"Pass 2: {len(can_rows):,} CAN-type expenditure rows to process")

    # Build committee lookup by acct
    com_by_acct = {}
    for _, c in com_df.iterrows():
        com_by_acct[str(c["pc_acct"])] = c.to_dict()

    for _, row in can_rows.iterrows():
        # Extract source committee acct from source_file
        m = re.match(r"Expend_(\d+)\.txt", str(row.get("source_file", "")))
        if not m:
            continue
        pc_acct = m.group(1)
        vendor = str(row.get("vendor_name", "")).strip()
        if not vendor:
            continue

        try:
            amt = float(row.get("amount", 0))
        except (ValueError, TypeError):
            amt = 0

        vendor_clean = clean(vendor)
        key = (pc_acct, vendor_clean)
        if key not in seen_pairs:
            com = com_by_acct.get(pc_acct, {})
            seen_pairs[key] = {
                "pc_acct": pc_acct,
                "pc_name": com.get("pc_name", f"Committee {pc_acct}"),
                "pc_type": com.get("pc_type", ""),
                "vendor_name": vendor,
                "total_amount": 0,
                "count": 0,
                "latest_date": "",
            }
        seen_pairs[key]["total_amount"] += amt
        seen_pairs[key]["count"] += 1
        date_val = str(row.get("expenditure_date", ""))
        if date_val > seen_pairs[key]["latest_date"]:
            seen_pairs[key]["latest_date"] = date_val

    # Now we have aggregated (committee, vendor_campaign) pairs.
    # vendor_name is the candidate campaign name — we need to link back to a candidate_acct_num.
    cand_name_to_accts: dict[str, list] = {}
    for _, c in cand_df.iterrows():
        nc = c["name_clean"]
        if nc:
            cand_name_to_accts.setdefault(nc, []).append(str(c["candidate_acct"]))

    for key, agg in seen_pairs.items():
        vendor = agg["vendor_name"]
        # Try to match vendor to a candidate
        # Clean the vendor name: strip "CAMPAIGN", "FOR", "COMMITTEE" etc.
        vendor_stripped = re.sub(
            r"\b(CAMPAIGN|COMMITTEE|FOR|PAC|FUND|FRIENDS OF|CITIZENS FOR|"
            r"PEOPLE FOR|ELECT|ELECTION|ACCOUNT|RE-ELECT|REELECT)\b",
            "", clean(vendor)
        ).strip()
        vendor_stripped = " ".join(vendor_stripped.split())

        if not vendor_stripped:
            continue

        cand, score = match_candidate(vendor_stripped, cand_idx, threshold=FUZZY_CAND_STRICT)
        if not cand:
            # Try direct name_clean lookup
            if vendor_stripped in cand_name_to_accts:
                for ca in cand_name_to_accts[vendor_stripped]:
                    edges.append(Edge(
                        candidate_acct_num=ca,
                        pc_acct_num=agg["pc_acct"],
                        pc_name=agg["pc_name"],
                        pc_type=agg["pc_type"],
                        edge_type="DIRECT_CONTRIBUTION_TO_CANDIDATE",
                        direction="support",
                        evidence_summary=f"Committee contributed ${agg['total_amount']:,.2f} to {vendor} ({agg['count']} payments)",
                        source_type="committee_expenditure",
                        source_record_id=f"Expend_{agg['pc_acct']}.txt",
                        match_method="exact_name",
                        match_score="100.0",
                        amount=f"{agg['total_amount']:.2f}",
                        edge_date=agg["latest_date"],
                        is_publishable=True,
                    ))
            continue

        for c in expand_to_all_accounts(cand, person_idx, nameclean_idx):
            edges.append(Edge(
                candidate_acct_num=str(c["candidate_acct"]),
                pc_acct_num=agg["pc_acct"],
                pc_name=agg["pc_name"],
                pc_type=agg["pc_type"],
                edge_type="DIRECT_CONTRIBUTION_TO_CANDIDATE",
                direction="support",
                evidence_summary=f"Committee contributed ${agg['total_amount']:,.2f} to {vendor} ({agg['count']} payments)",
                source_type="committee_expenditure",
                source_record_id=f"Expend_{agg['pc_acct']}.txt",
                match_method="fuzzy_name",
                match_score=f"{score:.1f}",
                amount=f"{agg['total_amount']:.2f}",
                edge_date=agg["latest_date"],
                is_publishable=True,
            ))

    print(f"Pass 2 (DIRECT_CONTRIBUTION_TO_CANDIDATE): {len(edges)} edges")
    return edges


# ── Pass 3: OTHER_DISTRIBUTION_TO_CANDIDATE ──────────────────────────────────

def pass_3_other_distributions(
    exp_df: pd.DataFrame, cand_idx: dict, com_df: pd.DataFrame,
) -> list[Edge]:
    edges: list[Edge] = []
    dis_rows = exp_df[exp_df["type_code"] == "DIS"]

    com_by_acct = {}
    for _, c in com_df.iterrows():
        com_by_acct[str(c["pc_acct"])] = c.to_dict()

    for _, row in dis_rows.iterrows():
        m = re.match(r"Expend_(\d+)\.txt", str(row.get("source_file", "")))
        if not m:
            continue
        pc_acct = m.group(1)
        vendor = str(row.get("vendor_name", "")).strip()
        purpose = str(row.get("purpose", "")).strip()
        if not vendor:
            continue

        # Try matching vendor or purpose to a candidate
        cand, score = match_candidate(vendor, cand_idx, threshold=FUZZY_CAND_STRICT)
        if not cand and purpose:
            cand, score = match_candidate(purpose, cand_idx, threshold=FUZZY_CAND_STRICT)

        if not cand:
            continue

        try:
            amt = float(row.get("amount", 0))
        except (ValueError, TypeError):
            amt = 0

        com = com_by_acct.get(pc_acct, {})
        edges.append(Edge(
            candidate_acct_num=str(cand["candidate_acct"]),
            pc_acct_num=pc_acct,
            pc_name=com.get("pc_name", f"Committee {pc_acct}"),
            pc_type=com.get("pc_type", ""),
            edge_type="OTHER_DISTRIBUTION_TO_CANDIDATE",
            direction="support",
            evidence_summary=f"Distribution to {vendor}: {purpose} (${amt:,.2f})",
            source_type="committee_expenditure",
            source_record_id=str(row.get("source_file", "")),
            match_method="fuzzy_name",
            match_score=f"{score:.1f}",
            amount=f"{amt:.2f}",
            edge_date=str(row.get("expenditure_date", "")),
            is_publishable=True,
        ))

    print(f"Pass 3 (OTHER_DISTRIBUTION_TO_CANDIDATE): {len(edges)} edges from {len(dis_rows)} DIS rows")
    return edges


# ── Pass 4/5: IEC and ECC ───────────────────────────────────────────────────

_DIRECTION_RE = re.compile(
    r"\b(FOR|SUPPORT|SUPPORTING|FAVOR|FAVORING|AGAINST|OPPOSE|OPPOSING|OPPOSITION)\b",
    re.I,
)
_CANDIDATE_RE = re.compile(
    r"(?:FOR|AGAINST|SUPPORT|OPPOSE)\s+([A-Z][A-Z\s,.'()-]+?)(?:\s*(?:CAMPAIGN|CANDIDATE|SIGNS?|MAILER|RADIO|TV|AD|ADVERTISEMENT)|$)",
    re.I,
)


def _parse_direction(purpose: str) -> str:
    m = _DIRECTION_RE.search(purpose)
    if not m:
        return ""
    word = m.group(1).upper()
    if word in ("FOR", "SUPPORT", "SUPPORTING", "FAVOR", "FAVORING"):
        return "support"
    return "opposition"


def _extract_candidate_from_purpose(purpose: str) -> str:
    """Try to extract a candidate name from purpose text."""
    m = _CANDIDATE_RE.search(purpose.upper())
    if m:
        name = m.group(1).strip().rstrip(",. ")
        if len(name) > 3 and len(name.split()) <= 5:
            return name
    # Also try: purpose contains a name-like string
    # e.g. "IND EXP FOR FRANK CAROLLO SIGN"
    parts = purpose.upper().split()
    # Look for "FOR NAME NAME" pattern
    for i, p in enumerate(parts):
        if p in ("FOR", "AGAINST") and i + 2 < len(parts):
            name_parts = []
            for j in range(i + 1, min(i + 4, len(parts))):
                if parts[j] in ("SIGN", "SIGNS", "MAILER", "CAMPAIGN", "RADIO", "TV",
                                "AD", "ADS", "ADVERTISEMENT", "PRINTING", "DECALS",
                                "BANNER", "BANNERS", "BUS", "BENCH"):
                    break
                name_parts.append(parts[j])
            if len(name_parts) >= 2:
                return " ".join(name_parts)
    return ""


def pass_4_5_iec_ecc(
    exp_df: pd.DataFrame, cand_idx: dict, com_df: pd.DataFrame,
    edge_type: str, type_codes: list[str],
) -> list[Edge]:
    edges: list[Edge] = []
    rows = exp_df[exp_df["type_code"].isin(type_codes)]

    com_by_acct = {}
    for _, c in com_df.iterrows():
        com_by_acct[str(c["pc_acct"])] = c.to_dict()

    for _, row in rows.iterrows():
        m = re.match(r"Expend_(\d+)\.txt", str(row.get("source_file", "")))
        if not m:
            continue
        pc_acct = m.group(1)
        purpose = str(row.get("purpose", "")).strip()
        vendor  = str(row.get("vendor_name", "")).strip()

        # Try to extract candidate name from purpose
        cand_name = _extract_candidate_from_purpose(purpose)
        cand = None
        score = 0

        if cand_name:
            cand, score = match_candidate(cand_name, cand_idx, threshold=FUZZY_CAND_THRESHOLD)

        if not cand:
            # Try vendor name as candidate (rare but possible)
            cand, score = match_candidate(vendor, cand_idx, threshold=FUZZY_CAND_STRICT)

        if not cand:
            continue

        direction = _parse_direction(purpose)
        try:
            amt = float(row.get("amount", 0))
        except (ValueError, TypeError):
            amt = 0

        com = com_by_acct.get(pc_acct, {})
        edges.append(Edge(
            candidate_acct_num=str(cand["candidate_acct"]),
            pc_acct_num=pc_acct,
            pc_name=com.get("pc_name", f"Committee {pc_acct}"),
            pc_type=com.get("pc_type", ""),
            edge_type=edge_type,
            direction=direction,
            evidence_summary=f"{edge_type.replace('_', ' ').title()}: {purpose[:80]} (${amt:,.2f})",
            source_type="committee_expenditure",
            source_record_id=str(row.get("source_file", "")),
            match_method="fuzzy_name",
            match_score=f"{score:.1f}",
            amount=f"{amt:.2f}",
            edge_date=str(row.get("expenditure_date", "")),
            is_publishable=True,
        ))

    print(f"Pass {'4' if 'IEC' in edge_type else '5'} ({edge_type}): {len(edges)} edges from {len(rows)} rows")
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

        # Sub-signal E: Committee name contains candidate name
        com_name_upper = clean(com["pc_name"])
        for _, cand in cand_df.iterrows():
            cand_nc = cand["name_clean"]
            if not cand_nc or len(cand_nc) < 5:
                continue
            if cand_nc in com_name_upper:
                acct = str(cand["candidate_acct"])
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
                        evidence_summary=f"Committee name contains candidate name: {cand['candidate_name']}",
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

def compute_candidate_specific(all_edges: list, cand_df: pd.DataFrame) -> list:
    """
    Mark each publishable edge as is_candidate_specific=True when:
      (a) The PAC name contains the candidate's cleaned name (≥5 chars), OR
      (b) This PAC has publishable edges for only ONE candidate across the entire dataset.

    is_candidate_specific=True means script 74 will include this PAC's total_received
    in the candidate's soft_money_total. False = affiliated PAC shown on profile but
    NOT included in the soft money total (avoids attributing $14M multi-candidate PAC
    to a single candidate based on one solicitation filing).
    """
    # Build candidate name lookup
    cand_names: dict[str, str] = {}  # candidate_acct → name_clean
    for _, row in cand_df.iterrows():
        cand_names[str(row["candidate_acct"])] = row["name_clean"]

    # Count how many distinct candidates each PAC is linked to via publishable edges
    pac_to_candidates: dict[str, set] = {}
    for e in all_edges:
        if e.is_publishable and e.pc_acct_num:
            pac_to_candidates.setdefault(e.pc_acct_num, set()).add(e.candidate_acct_num)

    result = []
    for e in all_edges:
        if not e.is_publishable or not e.pc_acct_num:
            result.append(e)
            continue

        cand_nc = cand_names.get(e.candidate_acct_num, "")
        pac_nc  = clean(e.pc_name)

        # (a) PAC name contains candidate name token
        name_in_pac = bool(cand_nc and len(cand_nc) >= 5 and cand_nc in pac_nc)

        # (b) PAC is linked to exactly 1 candidate
        only_one = len(pac_to_candidates.get(e.pc_acct_num, set())) == 1

        from dataclasses import replace
        result.append(replace(e, is_candidate_specific=(name_in_pac or only_one)))

    specific_count = sum(1 for e in result if e.is_publishable and e.is_candidate_specific)
    affiliated_count = sum(1 for e in result if e.is_publishable and not e.is_candidate_specific)
    print(f"\nCandidate-specific publishable edges: {specific_count:,}")
    print(f"Affiliated (multi-candidate) edges:   {affiliated_count:,}")
    return result


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    print("=== Script 71: Evidence-Based Candidate → Committee Linkage ===\n")

    for p in (COMMITTEES, CANDIDATES, EXPENDITURES):
        if not p.exists():
            print(f"ERROR: {p.name} not found at {p}", file=sys.stderr)
            return 1

    # Load data
    cand_df   = load_candidates()
    com_df    = load_committees()
    sol_index = load_solicitations_index()
    sol_csv   = load_solicitations_csv()
    exp_df    = pd.read_csv(EXPENDITURES, dtype=str).fillna("")

    cand_idx, person_idx, nameclean_idx = build_cand_index(cand_df)
    com_list = com_df.to_dict("records")

    prof_treasurers = build_professional_treasurers(com_df)
    common_surnames = build_common_surnames(cand_df)

    print(f"Candidates:            {len(cand_df):,}")
    print(f"Committees:            {len(com_df):,}")
    print(f"Solicitations (index): {len(sol_index):,}")
    print(f"Solicitations (CSV):   {len(sol_csv):,}")
    print(f"Expenditures:          {len(exp_df):,}")
    print(f"Prof treasurers:       {len(prof_treasurers):,}")
    print(f"Common surnames:       {len(common_surnames):,}")
    print()

    # Run all passes
    all_edges: list[Edge] = []

    all_edges.extend(pass_1_solicitation_control(
        cand_idx, person_idx, nameclean_idx, com_list, sol_index, sol_csv
    ))

    all_edges.extend(pass_2_direct_contributions(
        exp_df, cand_df, cand_idx, person_idx, nameclean_idx, com_df
    ))

    all_edges.extend(pass_3_other_distributions(exp_df, cand_idx, com_df))

    all_edges.extend(pass_4_5_iec_ecc(
        exp_df, cand_idx, com_df,
        edge_type="IEC_FOR_OR_AGAINST", type_codes=["IEC", "IEI"]
    ))

    all_edges.extend(pass_4_5_iec_ecc(
        exp_df, cand_idx, com_df,
        edge_type="ECC_FOR_OR_AGAINST", type_codes=["ECC", "ECI"]
    ))

    all_edges.extend(pass_6_admin_overlap(
        cand_df, com_df, cand_idx, prof_treasurers, common_surnames
    ))

    print(f"\n{'='*60}")
    print(f"Total edges: {len(all_edges):,}")

    # ── Post-processing: mark candidate-specific edges ────────────────────────
    all_edges = compute_candidate_specific(all_edges, cand_df)

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
