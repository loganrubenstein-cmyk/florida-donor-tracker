# tests/test_19_import_solicitations.py
import importlib.util
import pandas as pd
import pytest
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "import19",
    Path(__file__).parent.parent / "scripts" / "19_import_solicitations.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

clean               = _mod.clean
active_solicitations = _mod.active_solicitations
build_candidate_index = _mod.build_candidate_index
match_candidate     = _mod.match_candidate
match_committee     = _mod.match_committee
CAND_FUZZY_THRESHOLD = _mod.CAND_FUZZY_THRESHOLD
ORG_FUZZY_THRESHOLD  = _mod.ORG_FUZZY_THRESHOLD


# ── clean ─────────────────────────────────────────────────────────────────────

def test_clean_uppercases():
    assert clean("shane abbott") == "SHANE ABBOTT"

def test_clean_strips_punctuation():
    assert clean("O'Brien, Jr.") == "OBRIEN JR"

def test_clean_collapses_whitespace():
    assert clean("  Jane   Doe  ") == "JANE DOE"

def test_clean_empty():
    assert clean("") == ""


# ── active_solicitations ──────────────────────────────────────────────────────

@pytest.fixture
def raw_sol_df():
    return pd.DataFrame([
        # Active: latest is Statement
        {"solicitor_name": "Abbott, Shane", "office": "Legislative",
         "received_date": "2021-03-05", "form_type": "Statement of Solicitation",
         "organization": "Prescription for Florida's Prosperity",
         "last_name": "Abbott", "first_name": "Shane"},
        # Update after statement — still active
        {"solicitor_name": "Abbott, Shane", "office": "Legislative",
         "received_date": "2021-03-26", "form_type": "Solicitation Update",
         "organization": "Prescription for Florida's Prosperity",
         "last_name": "Abbott", "first_name": "Shane"},
        # Withdrawn — should be excluded
        {"solicitor_name": "Abruzzo, Joseph", "office": "Legislative",
         "received_date": "2014-11-24", "form_type": "Solicitation Withdrawal",
         "organization": "Citizens for Integrity in Government",
         "last_name": "Abruzzo", "first_name": "Joseph"},
        # Different org — still active
        {"solicitor_name": "Abruzzo, Joseph", "office": "Legislative",
         "received_date": "2014-09-02", "form_type": "Statement of Solicitation",
         "organization": "Stand for Florida",
         "last_name": "Abruzzo", "first_name": "Joseph"},
    ])


def test_active_solicitations_excludes_withdrawn(raw_sol_df):
    active = active_solicitations(raw_sol_df)
    org_set = set(active["organization"])
    assert "Citizens for Integrity in Government" not in org_set

def test_active_solicitations_includes_updated(raw_sol_df):
    active = active_solicitations(raw_sol_df)
    org_set = set(active["organization"])
    assert "Prescription for Florida's Prosperity" in org_set

def test_active_solicitations_includes_different_org_for_same_solicitor(raw_sol_df):
    active = active_solicitations(raw_sol_df)
    abruzzo = active[active["last_name"] == "Abruzzo"]
    assert "Stand for Florida" in set(abruzzo["organization"])

def test_active_solicitations_deduplicates_per_org(raw_sol_df):
    # Abbott has 2 rows for same org — active should collapse to 1
    active = active_solicitations(raw_sol_df)
    abbott = active[(active["last_name"] == "Abbott") &
                    (active["organization"] == "Prescription for Florida's Prosperity")]
    assert len(abbott) == 1


# ── build_candidate_index / match_candidate ───────────────────────────────────

@pytest.fixture
def cand_df():
    df = pd.DataFrame([
        {"candidate_acct": "1001", "last_name": "Smith",  "first_name": "John",
         "candidate_name": "John Smith"},
        {"candidate_acct": "1002", "last_name": "Doe",    "first_name": "Jane",
         "candidate_name": "Jane Doe"},
        {"candidate_acct": "1003", "last_name": "Brown",  "first_name": "Robert",
         "candidate_name": "Robert Brown"},
    ])
    return df


def test_build_candidate_index_keys_by_initial(cand_df):
    idx = build_candidate_index(cand_df)
    assert "S" in idx
    assert "D" in idx
    assert "B" in idx

def test_match_candidate_exact(cand_df):
    idx = build_candidate_index(cand_df)
    result = match_candidate("Smith", "John", idx)
    assert result is not None
    assert result["candidate_acct"] == "1001"

def test_match_candidate_fuzzy_near_miss(cand_df):
    idx = build_candidate_index(cand_df)
    # "Jon Smith" should still fuzzy-match "John Smith"
    result = match_candidate("Smith", "Jon", idx)
    assert result is not None
    assert result["candidate_acct"] == "1001"

def test_match_candidate_no_match(cand_df):
    idx = build_candidate_index(cand_df)
    result = match_candidate("Zzzzz", "Qqqqq", idx)
    assert result is None

def test_match_candidate_empty_name(cand_df):
    idx = build_candidate_index(cand_df)
    result = match_candidate("", "", idx)
    assert result is None


# ── match_committee ───────────────────────────────────────────────────────────

@pytest.fixture
def com_df():
    return pd.DataFrame([
        {"acct_num": "2001", "committee_name": "Prescription for Florida's Prosperity",
         "type_code": "PCO"},
        {"acct_num": "2002", "committee_name": "Stand for Florida",
         "type_code": "ECO"},
        {"acct_num": "2003", "committee_name": "Unrelated Committee",
         "type_code": "PAC"},
    ])


def test_match_committee_exact(com_df):
    result = match_committee("Prescription for Florida's Prosperity", com_df)
    assert result is not None
    assert result["acct_num"] == "2001"

def test_match_committee_fuzzy(com_df):
    # Slight variation in org name
    result = match_committee("Stand For Florida PAC", com_df)
    assert result is not None
    assert result["acct_num"] == "2002"

def test_match_committee_no_match(com_df):
    result = match_committee("Completely Different Name XYZ", com_df)
    assert result is None

def test_match_committee_empty(com_df):
    result = match_committee("", com_df)
    assert result is None


# ── Threshold sanity guards ────────────────────────────────────────────────────

def test_cand_fuzzy_threshold_range():
    assert 80 <= CAND_FUZZY_THRESHOLD <= 95

def test_org_fuzzy_threshold_range():
    assert 75 <= ORG_FUZZY_THRESHOLD <= 95
