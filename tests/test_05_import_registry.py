# tests/test_05_import_registry.py
import importlib.util
from pathlib import Path
import pandas as pd
import pytest

_spec = importlib.util.spec_from_file_location(
    "imp05",
    Path(__file__).parent.parent / "scripts" / "05_import_registry.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

load_registry_file  = _mod.load_registry_file
filter_committees   = _mod.filter_committees
COMMITTEE_RENAME    = _mod.COMMITTEE_RENAME
CANDIDATE_RENAME    = _mod.CANDIDATE_RENAME


# ── COMMITTEE_RENAME / CANDIDATE_RENAME maps ──────────────────────────────────

def test_committee_rename_has_acct_num():
    assert "AcctNum" in COMMITTEE_RENAME
    assert COMMITTEE_RENAME["AcctNum"] == "acct_num"

def test_committee_rename_has_name():
    assert "Name" in COMMITTEE_RENAME
    assert COMMITTEE_RENAME["Name"] == "committee_name"

def test_committee_rename_has_chair():
    assert "ChrNameLast" in COMMITTEE_RENAME
    assert COMMITTEE_RENAME["ChrNameLast"] == "chair_last"

def test_committee_rename_has_treasurer():
    assert "TrsNameLast" in COMMITTEE_RENAME
    assert COMMITTEE_RENAME["TrsNameLast"] == "treasurer_last"

def test_candidate_rename_has_acct_num():
    assert "AcctNum" in CANDIDATE_RENAME
    assert CANDIDATE_RENAME["AcctNum"] == "acct_num"

def test_candidate_rename_has_election_id():
    assert "ElectionID" in CANDIDATE_RENAME
    assert CANDIDATE_RENAME["ElectionID"] == "election_id"

def test_candidate_rename_has_party():
    assert "PartyCode" in CANDIDATE_RENAME
    assert CANDIDATE_RENAME["PartyCode"] == "party_code"


# ── load_registry_file ────────────────────────────────────────────────────────

@pytest.fixture
def sample_committees_txt(tmp_path):
    """Write a minimal FL DOE committees.txt tab-delimited file."""
    content = (
        "AcctNum\tName\tType\tTypeDesc\tCity\tState\t"
        "ChrNameLast\tChrNameFirst\tTrsNameLast\tTrsNameFirst\n"
        "4700\tRepublican Party of Florida\tPCO\tParty Committee\t"
        "Tallahassee\tFL\tSmith\tJohn\tDoe\tJane\n"
        "55417\tAccountability Watchdog\tECO\tElectioneering\t"
        "Miami\tFL\tBrown\tBob\tWhite\tAlice\n"
    )
    p = tmp_path / "committees.txt"
    p.write_text(content, encoding="latin-1")
    return p

@pytest.fixture
def sample_candidates_txt(tmp_path):
    """Write a minimal FL DOE candidates.txt tab-delimited file."""
    content = (
        "AcctNum\tElectionID\tOfficeCode\tOfficeDesc\tPartyCode\tPartyName\t"
        "NameLast\tNameFirst\tStatusCode\tStatusDesc\n"
        "88747\t2024GEN\tRSS\tState Senate\tREP\tRepublican\tDeSantis\tRon\tACT\tActive\n"
        "12345\t2024GEN\tRHD\tState House\tDEM\tDemocrat\tSmith\tJane\tACT\tActive\n"
    )
    p = tmp_path / "candidates.txt"
    p.write_text(content, encoding="latin-1")
    return p

def test_load_registry_file_returns_dataframe(sample_committees_txt):
    df = load_registry_file(sample_committees_txt, COMMITTEE_RENAME)
    assert isinstance(df, pd.DataFrame)

def test_load_registry_file_row_count(sample_committees_txt):
    df = load_registry_file(sample_committees_txt, COMMITTEE_RENAME)
    assert len(df) == 2

def test_load_registry_file_renames_acct_num(sample_committees_txt):
    df = load_registry_file(sample_committees_txt, COMMITTEE_RENAME)
    assert "acct_num" in df.columns
    assert "AcctNum" not in df.columns

def test_load_registry_file_renames_committee_name(sample_committees_txt):
    df = load_registry_file(sample_committees_txt, COMMITTEE_RENAME)
    assert "committee_name" in df.columns

def test_load_registry_file_renames_chair(sample_committees_txt):
    df = load_registry_file(sample_committees_txt, COMMITTEE_RENAME)
    assert "chair_last" in df.columns

def test_load_registry_file_values_correct(sample_committees_txt):
    df = load_registry_file(sample_committees_txt, COMMITTEE_RENAME)
    assert df.iloc[0]["acct_num"] == "4700"
    assert df.iloc[0]["committee_name"] == "Republican Party of Florida"

def test_load_registry_file_candidates(sample_candidates_txt):
    df = load_registry_file(sample_candidates_txt, CANDIDATE_RENAME)
    assert "acct_num" in df.columns
    assert "election_id" in df.columns
    assert "party_code" in df.columns
    assert len(df) == 2

def test_load_registry_file_skips_unknown_columns(tmp_path):
    """Columns not in rename map should remain unchanged."""
    content = "AcctNum\tExtraColumn\tName\n4700\tSomeValue\tTest Committee\n"
    p = tmp_path / "test.txt"
    p.write_text(content, encoding="latin-1")
    df = load_registry_file(p, COMMITTEE_RENAME)
    assert "acct_num" in df.columns
    assert "ExtraColumn" in df.columns  # not in COMMITTEE_RENAME, left as-is


# ── filter_committees ─────────────────────────────────────────────────────────

def test_filter_committees_drops_null_acct_num():
    df = pd.DataFrame({
        "acct_num": ["4700", None, ""],
        "type_code": ["PCO", "ECO", "PAC"],
    })
    result = filter_committees(df)
    assert len(result) == 1
    assert result.iloc[0]["acct_num"] == "4700"

def test_filter_committees_drops_empty_acct_num():
    df = pd.DataFrame({
        "acct_num": ["4700", "   ", "55417"],
        "type_code": ["PCO", "ECO", "PAC"],
    })
    result = filter_committees(df)
    assert len(result) == 2

def test_filter_committees_keeps_all_when_no_filter(monkeypatch):
    monkeypatch.setattr(_mod, "COMMITTEE_TYPE_FILTER", None)
    df = pd.DataFrame({
        "acct_num": ["4700", "55417", "74932"],
        "type_code": ["PCO", "ECO", "PAC"],
    })
    result = filter_committees(df)
    assert len(result) == 3

def test_filter_committees_applies_type_filter(monkeypatch):
    monkeypatch.setattr(_mod, "COMMITTEE_TYPE_FILTER", ["PCO", "PAC"])
    df = pd.DataFrame({
        "acct_num": ["4700", "55417", "74932"],
        "type_code": ["PCO", "ECO", "PAC"],
    })
    result = filter_committees(df)
    assert len(result) == 2
    assert set(result["type_code"]) == {"PCO", "PAC"}

def test_filter_committees_combined_null_and_type_filter(monkeypatch):
    monkeypatch.setattr(_mod, "COMMITTEE_TYPE_FILTER", ["PCO"])
    df = pd.DataFrame({
        "acct_num": ["4700", None, "55417"],
        "type_code": ["PCO", "PCO", "ECO"],
    })
    result = filter_committees(df)
    assert len(result) == 1
    assert result.iloc[0]["acct_num"] == "4700"
