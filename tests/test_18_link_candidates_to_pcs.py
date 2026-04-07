# tests/test_18_link_candidates_to_pcs.py
import importlib.util
import pandas as pd
import pytest
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "link18",
    Path(__file__).parent.parent / "scripts" / "18_link_candidates_to_pcs.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

clean          = _mod.clean
load_candidates = _mod.load_candidates
load_committees = _mod.load_committees
exact_matches  = _mod.exact_matches
fuzzy_matches  = _mod.fuzzy_matches
FUZZY_THRESHOLD = _mod.FUZZY_THRESHOLD


# ── clean ─────────────────────────────────────────────────────────────────────

def test_clean_uppercases():
    assert clean("john smith") == "JOHN SMITH"

def test_clean_strips_punctuation():
    assert clean("O'Brien Jr.") == "OBRIEN JR"

def test_clean_collapses_whitespace():
    assert clean("  Jane   Doe  ") == "JANE DOE"

def test_clean_empty():
    assert clean("") == ""


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def sample_candidates(tmp_path):
    df = pd.DataFrame([
        {"acct_num": "1001", "first_name": "John",  "last_name": "Smith",
         "office_desc": "State Representative", "party_code": "REP",
         "treasurer_last": "Jones", "treasurer_first": "Bob"},
        {"acct_num": "1002", "first_name": "Jane",  "last_name": "Doe",
         "office_desc": "State Senator", "party_code": "DEM",
         "treasurer_last": "", "treasurer_first": ""},
        {"acct_num": "1003", "first_name": "Robert", "last_name": "Brown",
         "office_desc": "Governor", "party_code": "REP",
         "treasurer_last": "", "treasurer_first": ""},
    ])
    p = tmp_path / "candidates.csv"
    df.to_csv(p, index=False)
    return load_candidates(p)


@pytest.fixture
def sample_committees(tmp_path):
    df = pd.DataFrame([
        # John Smith is chair of this one
        {"acct_num": "2001", "committee_name": "Friends of John Smith",
         "type_code": "PCO",
         "chair_last": "Smith",  "chair_first": "John",  "chair_middle": "",
         "treasurer_last": "Jones", "treasurer_first": "Bob", "treasurer_middle": ""},
        # Jane Doe is treasurer of this one
        {"acct_num": "2002", "committee_name": "Progress Florida",
         "type_code": "ECO",
         "chair_last": "Green",  "chair_first": "Alice", "chair_middle": "",
         "treasurer_last": "Doe", "treasurer_first": "Jane", "treasurer_middle": ""},
        # Nobody from candidates list
        {"acct_num": "2003", "committee_name": "Unrelated PAC",
         "type_code": "PAC",
         "chair_last": "Wilson", "chair_first": "Carl", "chair_middle": "",
         "treasurer_last": "Hunt", "treasurer_first": "Sara", "treasurer_middle": ""},
    ])
    p = tmp_path / "committees.csv"
    df.to_csv(p, index=False)
    return load_committees(p)


# ── load_candidates ───────────────────────────────────────────────────────────

def test_load_candidates_columns(sample_candidates):
    assert "candidate_name" in sample_candidates.columns
    assert "candidate_name_clean" in sample_candidates.columns
    assert "last_initial" in sample_candidates.columns
    assert "candidate_acct" in sample_candidates.columns

def test_load_candidates_name_assembly(sample_candidates):
    names = sample_candidates["candidate_name"].tolist()
    assert "John Smith" in names
    assert "Jane Doe" in names

def test_load_candidates_last_initial(sample_candidates):
    row = sample_candidates[sample_candidates["candidate_name"] == "John Smith"].iloc[0]
    assert row["last_initial"] == "S"


# ── load_committees ───────────────────────────────────────────────────────────

def test_load_committees_columns(sample_committees):
    assert "chair_name" in sample_committees.columns
    assert "chair_name_clean" in sample_committees.columns
    assert "chair_last_initial" in sample_committees.columns
    assert "treasurer_name" in sample_committees.columns
    assert "pc_acct" in sample_committees.columns
    assert "pc_name" in sample_committees.columns

def test_load_committees_chair_name_assembly(sample_committees):
    row = sample_committees[sample_committees["pc_acct"] == "2001"].iloc[0]
    assert row["chair_name"] == "John Smith"

def test_load_committees_chair_last_initial(sample_committees):
    row = sample_committees[sample_committees["pc_acct"] == "2001"].iloc[0]
    assert row["chair_last_initial"] == "S"


# ── exact_matches ─────────────────────────────────────────────────────────────

def test_exact_chair_match(sample_candidates, sample_committees):
    results = exact_matches(sample_candidates, sample_committees, "chair")
    assert len(results) == 1
    assert results[0]["candidate_name"] == "John Smith"
    assert results[0]["pc_acct"] == "2001"
    assert results[0]["link_type"] == "chair"
    assert results[0]["confidence"] == 1.0

def test_exact_treasurer_match(sample_candidates, sample_committees):
    results = exact_matches(sample_candidates, sample_committees, "treasurer")
    # Jane Doe is treasurer of 2002
    assert any(r["pc_acct"] == "2002" for r in results)

def test_exact_match_no_false_positives(sample_candidates, sample_committees):
    chair_results = exact_matches(sample_candidates, sample_committees, "chair")
    pc_accts = [r["pc_acct"] for r in chair_results]
    assert "2003" not in pc_accts  # Unrelated PAC should not match

def test_exact_match_empty_committee_name(sample_candidates, tmp_path):
    """Empty chair_last should not produce matches."""
    df = pd.DataFrame([{
        "acct_num": "9001", "committee_name": "Empty Chair PAC", "type_code": "PCO",
        "chair_last": "", "chair_first": "", "chair_middle": "",
        "treasurer_last": "", "treasurer_first": "", "treasurer_middle": "",
    }])
    p = tmp_path / "committees.csv"
    df.to_csv(p, index=False)
    committees = load_committees(p)
    results = exact_matches(sample_candidates, committees, "chair")
    assert len(results) == 0


# ── fuzzy_matches ─────────────────────────────────────────────────────────────

def test_fuzzy_matches_near_miss(tmp_path):
    """'Jon Smith' should fuzzy-match 'John Smith' at threshold 88."""
    cand_df = pd.DataFrame([{
        "acct_num": "1001", "first_name": "John", "last_name": "Smith",
        "office_desc": "Rep", "party_code": "REP",
        "treasurer_last": "", "treasurer_first": "",
    }])
    com_df = pd.DataFrame([{
        "acct_num": "2001", "committee_name": "Jon Smith for Florida", "type_code": "PCO",
        "chair_last": "Smith", "chair_first": "Jon", "chair_middle": "",
        "treasurer_last": "", "treasurer_first": "", "treasurer_middle": "",
    }])
    cand_path = tmp_path / "candidates.csv"
    com_path  = tmp_path / "committees.csv"
    cand_df.to_csv(cand_path, index=False)
    com_df.to_csv(com_path, index=False)

    candidates  = load_candidates(cand_path)
    committees  = load_committees(com_path)
    matched     = set()
    results     = fuzzy_matches(candidates, committees, "chair", matched)
    assert len(results) == 1
    assert results[0]["confidence"] >= FUZZY_THRESHOLD / 100

def test_fuzzy_skips_already_matched(sample_candidates, sample_committees):
    """Pairs in already_matched should not appear in fuzzy results."""
    already = {("1001", "2001", "chair")}
    results = fuzzy_matches(sample_candidates, sample_committees, "chair", already)
    assert not any(r["candidate_acct"] == "1001" and r["pc_acct"] == "2001" for r in results)

def test_fuzzy_threshold():
    """FUZZY_THRESHOLD should be between 80 and 95 — a sane guard."""
    assert 80 <= FUZZY_THRESHOLD <= 95
