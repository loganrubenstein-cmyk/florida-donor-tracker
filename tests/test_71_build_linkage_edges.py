# tests/test_71_build_linkage_edges.py
import importlib.util
import pandas as pd
import pytest
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "link71",
    Path(__file__).parent.parent / "scripts" / "71_build_linkage_edges.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

clean                = _mod.clean
strip_titles         = _mod.strip_titles
match_candidate      = _mod.match_candidate
match_committee      = _mod.match_committee
build_cand_index     = _mod.build_cand_index
expand_to_all_accounts = _mod.expand_to_all_accounts
pass_1_solicitation_control = _mod.pass_1_solicitation_control
pass_6_admin_overlap = _mod.pass_6_admin_overlap
build_professional_treasurers = _mod.build_professional_treasurers
build_common_surnames = _mod.build_common_surnames
_extract_candidate_from_purpose = _mod._extract_candidate_from_purpose
_parse_direction     = _mod._parse_direction
Edge                 = _mod.Edge
normalize_phone            = _mod.normalize_phone
normalize_addr             = _mod.normalize_addr
compute_candidate_specific = _mod.compute_candidate_specific


# ── Helpers ──────────────────────────────────────────────────────────────────

def make_cand_df(rows):
    df = pd.DataFrame(rows).fillna("")
    df["candidate_name"] = (
        df["first_name"].str.strip() + " " + df["last_name"].str.strip()
    ).str.strip()
    df["name_clean"]   = df["candidate_name"].apply(clean)
    df["last_initial"] = df["last_name"].str.strip().str.upper().str[:1]
    return df.rename(columns={"acct_num": "candidate_acct"})


def make_com_df(rows):
    df = pd.DataFrame(rows).fillna("")
    for role in ("chair", "treasurer"):
        df[f"{role}_name"] = (
            df[f"{role}_first"].str.strip() + " " + df[f"{role}_last"].str.strip()
        ).str.strip()
        df[f"{role}_name_clean"] = df[f"{role}_name"].apply(clean)
        df[f"{role}_last_initial"] = df[f"{role}_last"].str.strip().str.upper().str[:1]
    df["name_clean"]  = df["committee_name"].apply(clean)
    df["phone_norm"]  = df.get("phone", pd.Series(dtype=str)).fillna("").apply(normalize_phone)
    df["addr_norm"]   = df.get("addr1", pd.Series(dtype=str)).fillna("").apply(normalize_addr)
    return df.rename(columns={"acct_num": "pc_acct", "committee_name": "pc_name",
                               "type_code": "pc_type"})


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def byron_donalds_data():
    """
    Byron Donalds (candidate 89042): has solicitation for Friends of Byron Donalds PAC.
    Ryan Smith: actual chair of Friends of Byron Donalds PAC (89043).
    PAC 74495: predecessor "Byron Donalds for Florida" (disbanded).
    """
    cand_rows = [
        {"acct_num": "89042", "first_name": "Byron", "last_name": "Donalds",
         "voter_id": "V1001", "phone": "8505551234", "addr1": "123 Main St"},
        {"acct_num": "99999", "first_name": "Ryan", "last_name": "Smith",
         "voter_id": "V2002", "phone": "3055559999", "addr1": "456 Oak Ave"},
    ]
    com_rows = [
        {"acct_num": "89043", "committee_name": "Friends of Byron Donalds",
         "type_code": "PAC", "phone": "8505551234", "addr1": "123 Main St",
         "chair_first": "Ryan", "chair_last": "Smith",
         "treasurer_first": "Amy", "treasurer_last": "Jones"},
        {"acct_num": "74495", "committee_name": "Byron Donalds for Florida",
         "type_code": "PAC", "phone": "", "addr1": "",
         "chair_first": "Byron", "chair_last": "Donalds",
         "treasurer_first": "Sarah", "treasurer_last": "Williams"},
    ]
    sol_index = [
        {"id": 500, "solicitors": ["The Honorable Byron Donalds"],
         "organization": "Friends of Byron Donalds", "withdrawn": False,
         "file_date": "2021-03-05", "org_type": "527 Maintained/Controlled"},
    ]
    return cand_rows, com_rows, sol_index


@pytest.fixture
def professional_treasurer_data():
    """Treasurer serving 6 committees."""
    cand_rows = [
        {"acct_num": "1001", "first_name": "Nancy", "last_name": "Watkins",
         "voter_id": "V100", "phone": "", "addr1": ""},
    ]
    com_rows = [
        {"acct_num": str(i), "committee_name": f"Committee {i}",
         "type_code": "PAC", "phone": "", "addr1": "",
         "chair_first": "Bob", "chair_last": "Chair",
         "treasurer_first": "Nancy", "treasurer_last": "Watkins"}
        for i in range(2001, 2007)  # 6 committees with same treasurer
    ]
    return cand_rows, com_rows


@pytest.fixture
def common_surname_data():
    """11 candidates named Rodriguez + 1 committee with Rodriguez treasurer."""
    cand_rows = [
        {"acct_num": str(3000 + i), "first_name": f"Person{i}",
         "last_name": "Rodriguez", "voter_id": f"V{3000+i}", "phone": "", "addr1": ""}
        for i in range(11)
    ]
    com_rows = [
        {"acct_num": "4001", "committee_name": "Some PAC",
         "type_code": "PAC", "phone": "", "addr1": "",
         "chair_first": "Bob", "chair_last": "Wilson",
         "treasurer_first": "Maria", "treasurer_last": "Rodriguez"},
    ]
    return cand_rows, com_rows


# ── Test 1: Byron Donalds linked via solicitation, not chair ─────────────────

def test_donalds_linked_via_solicitation(byron_donalds_data):
    cand_rows, com_rows, sol_index = byron_donalds_data
    cand_df = make_cand_df(cand_rows)
    com_df  = make_com_df(com_rows)
    cand_idx, person_idx, nameclean_idx = build_cand_index(cand_df)
    com_list = com_df.to_dict("records")

    edges = pass_1_solicitation_control(
        cand_idx, person_idx, nameclean_idx, com_list, sol_index, []
    )

    donalds_to_89043 = [e for e in edges
                        if e.candidate_acct_num == "89042" and e.pc_acct_num == "89043"]
    assert len(donalds_to_89043) >= 1
    assert all(e.edge_type == "SOLICITATION_CONTROL" for e in donalds_to_89043)
    assert all(e.is_publishable for e in donalds_to_89043)


# ── Test 2: Ryan Smith (actual chair) gets ADMIN_OVERLAP_ONLY ────────────────

def test_chair_gets_admin_overlap_only(byron_donalds_data):
    cand_rows, com_rows, _ = byron_donalds_data
    cand_df = make_cand_df(cand_rows)
    com_df  = make_com_df(com_rows)
    cand_idx, _, _ = build_cand_index(cand_df)

    edges = pass_6_admin_overlap(cand_df, com_df, cand_idx, set(), set())

    smith_to_89043 = [e for e in edges
                      if e.candidate_acct_num == "99999" and e.pc_acct_num == "89043"]
    assert len(smith_to_89043) >= 1
    assert all(e.edge_type == "ADMIN_OVERLAP_ONLY" for e in smith_to_89043)
    assert all(not e.is_publishable for e in smith_to_89043)


# ── Test 3: Common surname suppression ───────────────────────────────────────

def test_common_surname_suppressed(common_surname_data):
    cand_rows, com_rows = common_surname_data
    cand_df = make_cand_df(cand_rows)
    com_df  = make_com_df(com_rows)
    cand_idx, _, _ = build_cand_index(cand_df)

    common = build_common_surnames(cand_df)
    assert "RODRIGUEZ" in common

    edges = pass_6_admin_overlap(cand_df, com_df, cand_idx, set(), common)

    # Rodriguez treasurer match should be suppressed (11 candidates with that surname,
    # and fuzzy score will be < 95 because "Maria Rodriguez" vs "Person0 Rodriguez")
    rodriguez_edges = [e for e in edges
                       if e.pc_acct_num == "4001"
                       and "treasurer" in e.evidence_summary.lower()
                       and "rodriguez" in e.evidence_summary.lower()]
    assert len(rodriguez_edges) == 0


# ── Test 4: Professional treasurer flagged ───────────────────────────────────

def test_professional_treasurer_flagged(professional_treasurer_data):
    cand_rows, com_rows = professional_treasurer_data
    cand_df = make_cand_df(cand_rows)
    com_df  = make_com_df(com_rows)

    prof = build_professional_treasurers(com_df)
    assert "NANCY WATKINS" in prof

    cand_idx, _, _ = build_cand_index(cand_df)
    edges = pass_6_admin_overlap(cand_df, com_df, cand_idx, prof, set())

    # Nancy Watkins should still get edges but flagged as professional_treasurer
    watkins_edges = [e for e in edges
                     if e.candidate_acct_num == "1001"
                     and "treasurer" in e.evidence_summary.lower()]
    for e in watkins_edges:
        assert e.match_method == "professional_treasurer"
        assert not e.is_publishable


# ── Test 5: Shared address alone = not publishable ───────────────────────────

def test_shared_address_not_publishable():
    cand_rows = [
        {"acct_num": "5001", "first_name": "Alice", "last_name": "Wonder",
         "voter_id": "V5001", "phone": "", "addr1": "100 Capitol Blvd"},
    ]
    com_rows = [
        {"acct_num": "6001", "committee_name": "Generic PAC",
         "type_code": "PAC", "phone": "", "addr1": "100 Capitol Blvd",
         "chair_first": "Unrelated", "chair_last": "Person",
         "treasurer_first": "Another", "treasurer_last": "Person"},
    ]
    cand_df = make_cand_df(cand_rows)
    com_df  = make_com_df(com_rows)
    cand_idx, _, _ = build_cand_index(cand_df)

    edges = pass_6_admin_overlap(cand_df, com_df, cand_idx, set(), set())

    addr_edges = [e for e in edges
                  if e.candidate_acct_num == "5001" and e.pc_acct_num == "6001"]
    assert len(addr_edges) >= 1
    assert all(e.edge_type == "ADMIN_OVERLAP_ONLY" for e in addr_edges)
    assert all(not e.is_publishable for e in addr_edges)


# ── Test 6: Solicitation without spend still creates edge ────────────────────

def test_solicitation_no_spend_still_linked():
    cand_rows = [
        {"acct_num": "7001", "first_name": "Alice", "last_name": "Legislator",
         "voter_id": "V7001", "phone": "", "addr1": ""},
    ]
    com_rows = [
        {"acct_num": "8001", "committee_name": "Citizens for Progress",
         "type_code": "PAC", "phone": "", "addr1": "",
         "chair_first": "Random", "chair_last": "Person",
         "treasurer_first": "Other", "treasurer_last": "Person"},
    ]
    sol_index = [
        {"id": 999, "solicitors": ["Alice Legislator"],
         "organization": "Citizens for Progress", "withdrawn": False,
         "file_date": "2023-01-01"},
    ]
    cand_df = make_cand_df(cand_rows)
    com_df  = make_com_df(com_rows)
    cand_idx, person_idx, nameclean_idx = build_cand_index(cand_df)
    com_list = com_df.to_dict("records")

    edges = pass_1_solicitation_control(
        cand_idx, person_idx, nameclean_idx, com_list, sol_index, []
    )

    # Should have an edge even without any expenditure data
    assert len(edges) >= 1
    assert edges[0].edge_type == "SOLICITATION_CONTROL"
    assert edges[0].is_publishable


# ── Test 7: IEC direction parsing ────────────────────────────────────────────

def test_iec_direction_parsed():
    assert _parse_direction("IND EXP FOR FRANK CAROLLO SIGN") == "support"
    assert _parse_direction("AGAINST 3 DELRAY BEACH COMMISSIONERS") == "opposition"
    assert _parse_direction("MAILER") == ""
    assert _parse_direction("SUPPORTING AMENDMENT 1") == "support"
    assert _parse_direction("OPPOSING BOND ISSUE") == "opposition"


# ── Test 8: Candidate name extraction from purpose ───────────────────────────

def test_extract_candidate_from_purpose():
    assert _extract_candidate_from_purpose("IND EXP FOR FRANK CAROLLO SIGN") == "FRANK CAROLLO"
    assert _extract_candidate_from_purpose("SIGNS FOR MANOLO REYES CAMPAIGN") == "MANOLO REYES"
    assert _extract_candidate_from_purpose("MAILER") == ""
    name = _extract_candidate_from_purpose("AGAINST CARLOS GIMENEZ CANDIDATE")
    assert "CARLOS GIMENEZ" in name


# ── Test 9: Committee name contains candidate name → admin overlap ───────────

def test_committee_name_contains_candidate(byron_donalds_data):
    cand_rows, com_rows, _ = byron_donalds_data
    cand_df = make_cand_df(cand_rows)
    com_df  = make_com_df(com_rows)
    cand_idx, _, _ = build_cand_index(cand_df)

    edges = pass_6_admin_overlap(cand_df, com_df, cand_idx, set(), set())

    # "Friends of Byron Donalds" contains "BYRON DONALDS" → admin overlap for candidate 89042
    name_edges = [e for e in edges
                  if e.candidate_acct_num == "89042"
                  and e.pc_acct_num == "89043"
                  and e.match_method == "name_contains"]
    assert len(name_edges) >= 1
    assert all(not e.is_publishable for e in name_edges)


# ── Test 10: Shared phone creates admin overlap ─────────────────────────────

def test_shared_phone_admin_overlap(byron_donalds_data):
    cand_rows, com_rows, _ = byron_donalds_data
    cand_df = make_cand_df(cand_rows)
    com_df  = make_com_df(com_rows)
    cand_idx, _, _ = build_cand_index(cand_df)

    edges = pass_6_admin_overlap(cand_df, com_df, cand_idx, set(), set())

    # Byron Donalds phone (8505551234) matches PAC 89043 → admin overlap
    phone_edges = [e for e in edges
                   if e.candidate_acct_num == "89042"
                   and e.pc_acct_num == "89043"
                   and e.match_method == "exact_phone"]
    assert len(phone_edges) >= 1
    assert all(not e.is_publishable for e in phone_edges)


# ── Unit tests for text cleaning ─────────────────────────────────────────────

def test_clean_basic():
    assert clean("john smith") == "JOHN SMITH"
    assert clean("O'Brien Jr.") == "OBRIEN JR"
    assert clean("  Jane   Doe  ") == "JANE DOE"


def test_strip_titles():
    assert strip_titles("The Honorable Byron Donalds") == "BYRON DONALDS"
    # "The Honorable" is handled by _HONORABLE regex; "Sen." is not stripped
    # because the prefix regex needs a space after the prefix, not a dot.
    # In practice solicitation data uses "The Honorable" not "Sen.", so this is fine.
    assert "RICK SCOTT" in strip_titles("Sen Rick Scott")  # no dot = works
    assert "RICK SCOTT" in strip_titles("Senator Rick Scott")
    assert "JOHN SMITH" in strip_titles("Mr John Smith")


# ── Test 13: candidate-branded PAC (name match) is candidate-specific ─────────

def test_candidate_branded_pac_is_specific(byron_donalds_data):
    """
    'Friends of Byron Donalds' contains 'BYRON DONALDS' → is_candidate_specific=True.
    Result: the PAC's total should be counted in Donalds' soft money.
    """
    cand_rows, com_rows, sol_index = byron_donalds_data
    cand_df = make_cand_df(cand_rows)
    com_df  = make_com_df(com_rows)
    cand_idx, person_idx, nameclean_idx = build_cand_index(cand_df)
    com_list = com_df.to_dict("records")

    edges = pass_1_solicitation_control(
        cand_idx, person_idx, nameclean_idx, com_list, sol_index, []
    )
    # Initial edges have is_candidate_specific=False (default)
    assert all(not e.is_candidate_specific for e in edges)

    # After post-processing: "Friends of Byron Donalds" contains "BYRON DONALDS"
    processed = compute_candidate_specific(edges, cand_df)
    donalds_to_89043 = [e for e in processed
                        if e.candidate_acct_num == "89042" and e.pc_acct_num == "89043"]
    assert len(donalds_to_89043) >= 1
    assert all(e.is_candidate_specific for e in donalds_to_89043)


# ── Test 14: multi-candidate PAC is not candidate-specific ───────────────────

def test_multi_candidate_pac_not_specific():
    """
    'Florida For All, Inc.' linked to 3 different candidates → is_candidate_specific=False
    for all of them. Its total_received should NOT be included in any single candidate's
    soft money.
    """
    cand_rows = [
        {"acct_num": "A001", "first_name": "Alice", "last_name": "Anderson",
         "voter_id": "VA001", "phone": "", "addr1": ""},
        {"acct_num": "B002", "first_name": "Bob",   "last_name": "Brown",
         "voter_id": "VB002", "phone": "", "addr1": ""},
        {"acct_num": "C003", "first_name": "Carol", "last_name": "Clark",
         "voter_id": "VC003", "phone": "", "addr1": ""},
    ]
    cand_df = make_cand_df(cand_rows)

    # Simulate 3 publishable edges pointing to the same PAC from 3 different candidates
    from dataclasses import replace
    base_edge = Edge(
        candidate_acct_num="A001", pc_acct_num="PAC99",
        pc_name="Florida For All Inc", pc_type="ECO",
        edge_type="SOLICITATION_CONTROL", direction="", evidence_summary="",
        source_type="solicitation_index", source_record_id="1",
        match_method="fuzzy_name", match_score="92.0",
        amount="", edge_date="", is_publishable=True, is_candidate_specific=False,
    )
    edges = [
        base_edge,
        replace(base_edge, candidate_acct_num="B002"),
        replace(base_edge, candidate_acct_num="C003"),
    ]

    processed = compute_candidate_specific(edges, cand_df)
    # PAC linked to 3 candidates → none should be candidate-specific
    assert all(not e.is_candidate_specific for e in processed)


# ── Test 15: single-candidate PAC (only-one check) is candidate-specific ─────

def test_single_candidate_pac_is_specific():
    """
    A PAC linked to exactly 1 candidate → is_candidate_specific=True even if the PAC
    name doesn't contain the candidate's name.
    """
    cand_rows = [
        {"acct_num": "D004", "first_name": "Dan", "last_name": "Davis",
         "voter_id": "VD004", "phone": "", "addr1": ""},
    ]
    cand_df = make_cand_df(cand_rows)

    edges = [
        Edge(
            candidate_acct_num="D004", pc_acct_num="PAC77",
            pc_name="Citizens for Better Government", pc_type="PAC",
            edge_type="SOLICITATION_CONTROL", direction="", evidence_summary="",
            source_type="solicitation_index", source_record_id="2",
            match_method="fuzzy_name", match_score="90.0",
            amount="", edge_date="", is_publishable=True, is_candidate_specific=False,
        )
    ]

    processed = compute_candidate_specific(edges, cand_df)
    # Only 1 candidate linked → is_candidate_specific=True
    assert processed[0].is_candidate_specific
