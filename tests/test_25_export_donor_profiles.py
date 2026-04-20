# tests/test_25_export_donor_profiles.py
import importlib.util
import json
import pandas as pd
import pytest
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "export25",
    Path(__file__).parent.parent / "scripts" / "25_export_donor_profiles.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

is_corporate   = _mod.is_corporate
slugify        = _mod.slugify
acct_from_source = _mod.acct_from_source
top_value      = _mod.top_value
build_donor_records = _mod.build_donor_records
MIN_TOTAL      = _mod.MIN_TOTAL


# ── is_corporate ──────────────────────────────────────────────────────────────

def test_corp_llc():
    assert is_corporate("ACME SERVICES LLC") is True

def test_corp_inc():
    assert is_corporate("FLORIDA POWER & LIGHT COMPANY INC") is True

def test_corp_pac():
    assert is_corporate("FRIENDS OF DEMOCRACY PAC") is True

def test_corp_foundation():
    assert is_corporate("SMITH FAMILY FOUNDATION") is True

def test_corp_individual_false():
    assert is_corporate("SMITH, JOHN R.") is False

def test_corp_individual_name_false():
    assert is_corporate("JOHNSON MARY") is False

def test_corp_none():
    assert is_corporate(None) is False

def test_corp_empty():
    assert is_corporate("") is False


# ── slugify ───────────────────────────────────────────────────────────────────

def test_slug_basic():
    # & is stripped, adjacent spaces collapse to single hyphen
    assert slugify("FLORIDA POWER & LIGHT COMPANY") == "florida-power-light-company"

def test_slug_spaces_to_hyphens():
    assert slugify("JOHN SMITH") == "john-smith"

def test_slug_strips_special():
    assert slugify("SMITH, JOHN R.") == "smith-john-r"

def test_slug_lowercase():
    assert slugify("ACME LLC") == "acme-llc"

def test_slug_collapse_hyphens():
    s = slugify("A  B")
    assert "--" not in s

def test_slug_max_length():
    long_name = "A" * 200
    assert len(slugify(long_name)) <= 120

def test_slug_empty():
    assert slugify("") == ""

def test_slug_none():
    assert slugify(None) == ""


# ── acct_from_source ──────────────────────────────────────────────────────────

def test_acct_standard():
    assert acct_from_source("Contrib_12345.txt") == "12345"

def test_acct_uppercase():
    assert acct_from_source("CONTRIB_99999.TXT") == "99999"

def test_acct_none():
    assert acct_from_source(None) is None

def test_acct_no_match():
    assert acct_from_source("something_else.csv") is None

def test_acct_rpof_special():
    # Known special case — _SOURCE_FILE_MAP handles this in script 08 but
    # script 25 reads source_file directly; RPOF entries have numeric acct
    assert acct_from_source("Contrib_4700.txt") == "4700"


# ── top_value ─────────────────────────────────────────────────────────────────

def test_top_value_basic():
    s = pd.Series(["MIAMI, FL 33101", "MIAMI, FL 33101", "TAMPA, FL 33601"])
    assert top_value(s) == "MIAMI, FL 33101"

def test_top_value_all_null():
    s = pd.Series([None, None])
    assert top_value(s) is None

def test_top_value_single():
    s = pd.Series(["REAL ESTATE"])
    assert top_value(s) == "REAL ESTATE"

def test_top_value_empty():
    s = pd.Series([], dtype=str)
    assert top_value(s) is None


# ── build_donor_records integration ──────────────────────────────────────────

@pytest.fixture
def soft_df():
    """Minimal soft-money DataFrame for two donors."""
    return pd.DataFrame({
        "canonical_name":            ["ACME LLC",    "ACME LLC",     "JOHN SMITH"],
        "amount":                    [50_000.0,      25_000.0,       500.0],
        "report_year":               [2022,          2024,           2022],
        "acct_num":                  ["4700",        "4800",         "4700"],
        "contributor_occupation":    ["",            "",             "ATTORNEY"],
        "contributor_city_state_zip": ["MIAMI, FL 33101", "MIAMI, FL 33101", "TAMPA, FL 33601"],
    })

@pytest.fixture
def hard_df():
    """Minimal hard-money DataFrame."""
    return pd.DataFrame({
        "canonical_name": ["ACME LLC"],
        "amount":         [1_000.0],
        "report_year":    [2022],
        "acct_num":       ["99999"],
    })

@pytest.fixture
def committee_names():
    return {"4700": "Republican Party of Florida", "4800": "Test PAC"}

@pytest.fixture
def candidate_info():
    return {"99999": {"name": "Jane Doe", "office": "State Senator", "party": "REP"}}

def test_build_returns_index_and_profiles(soft_df, hard_df, committee_names, candidate_info):
    index_rows, profiles = build_donor_records(
        soft_df, hard_df, committee_names, candidate_info, {}, {},
    )
    assert len(index_rows) == 2  # ACME LLC + JOHN SMITH

def test_build_index_sorted_by_combined(soft_df, hard_df, committee_names, candidate_info):
    index_rows, _ = build_donor_records(soft_df, hard_df, committee_names, candidate_info, {}, {})
    # ACME LLC has 75K soft + 1K hard = 76K combined; JOHN SMITH has 500 — ACME first
    assert index_rows[0]["name"] == "ACME LLC"

def test_build_soft_total(soft_df, hard_df, committee_names, candidate_info):
    index_rows, _ = build_donor_records(soft_df, hard_df, committee_names, candidate_info, {}, {})
    acme = next(r for r in index_rows if r["name"] == "ACME LLC")
    assert acme["total_soft"] == pytest.approx(75_000.0)

def test_build_hard_total(soft_df, hard_df, committee_names, candidate_info):
    index_rows, _ = build_donor_records(soft_df, hard_df, committee_names, candidate_info, {}, {})
    acme = next(r for r in index_rows if r["name"] == "ACME LLC")
    assert acme["total_hard"] == pytest.approx(1_000.0)

def test_build_combined_total(soft_df, hard_df, committee_names, candidate_info):
    index_rows, _ = build_donor_records(soft_df, hard_df, committee_names, candidate_info, {}, {})
    acme = next(r for r in index_rows if r["name"] == "ACME LLC")
    assert acme["total_combined"] == pytest.approx(76_000.0)

def test_build_is_corporate(soft_df, hard_df, committee_names, candidate_info):
    index_rows, _ = build_donor_records(soft_df, hard_df, committee_names, candidate_info, {}, {})
    acme  = next(r for r in index_rows if r["name"] == "ACME LLC")
    smith = next(r for r in index_rows if r["name"] == "JOHN SMITH")
    assert acme["is_corporate"] is True
    assert smith["is_corporate"] is False

def test_build_profile_only_above_min(soft_df, hard_df, committee_names, candidate_info):
    index_rows, profiles = build_donor_records(soft_df, hard_df, committee_names, candidate_info, {}, {})
    # JOHN SMITH has $500 combined — below MIN_TOTAL ($1,000) — no profile file
    smith_slug = slugify("JOHN SMITH")
    assert smith_slug not in profiles

def test_build_profile_exists_for_corporate(soft_df, hard_df, committee_names, candidate_info):
    _, profiles = build_donor_records(soft_df, hard_df, committee_names, candidate_info, {}, {})
    acme_slug = slugify("ACME LLC")
    assert acme_slug in profiles

def test_build_profile_committees(soft_df, hard_df, committee_names, candidate_info):
    _, profiles = build_donor_records(soft_df, hard_df, committee_names, candidate_info, {}, {})
    acme_slug = slugify("ACME LLC")
    profile = profiles[acme_slug]
    assert len(profile["committees"]) == 2
    # Sorted by total descending: 4700 (50K) first
    assert profile["committees"][0]["acct_num"] == "4700"
    assert profile["committees"][0]["total"] == pytest.approx(50_000.0)

def test_build_profile_candidates(soft_df, hard_df, committee_names, candidate_info):
    _, profiles = build_donor_records(soft_df, hard_df, committee_names, candidate_info, {}, {})
    acme_slug = slugify("ACME LLC")
    cands = profiles[acme_slug]["candidates"]
    assert len(cands) == 1
    assert cands[0]["candidate_name"] == "Jane Doe"
    assert cands[0]["total"] == pytest.approx(1_000.0)

def test_build_profile_by_year(soft_df, hard_df, committee_names, candidate_info):
    _, profiles = build_donor_records(soft_df, hard_df, committee_names, candidate_info, {}, {})
    acme_slug = slugify("ACME LLC")
    by_year = profiles[acme_slug]["by_year"]
    years = [r["year"] for r in by_year]
    assert 2022 in years and 2024 in years

def test_build_lobbyist_cross_ref(soft_df, hard_df, committee_names, candidate_info):
    principal_matches = {"ACME LLC": [{"principal_name": "Acme Inc", "match_score": 95.0}]}
    _, profiles = build_donor_records(soft_df, hard_df, committee_names, candidate_info, principal_matches, {})
    acme_slug = slugify("ACME LLC")
    assert len(profiles[acme_slug]["lobbyist_principals"]) == 1
    assert profiles[acme_slug]["lobbyist_principals"][0]["principal_name"] == "Acme Inc"

def test_build_no_hard_money(soft_df, committee_names, candidate_info):
    empty_hard = pd.DataFrame(columns=["canonical_name", "acct_num", "amount", "report_year"])
    index_rows, profiles = build_donor_records(
        soft_df, empty_hard, committee_names, candidate_info, {}, {},
    )
    acme = next(r for r in index_rows if r["name"] == "ACME LLC")
    assert acme["total_hard"] == 0.0
    assert acme["num_candidates"] == 0

def test_build_num_committees(soft_df, hard_df, committee_names, candidate_info):
    index_rows, _ = build_donor_records(soft_df, hard_df, committee_names, candidate_info, {}, {})
    acme = next(r for r in index_rows if r["name"] == "ACME LLC")
    assert acme["num_committees"] == 2  # gave to 4700 and 4800

def test_build_has_lobbyist_link_flag(soft_df, hard_df, committee_names, candidate_info):
    principal_matches = {"ACME LLC": [{"principal_name": "Acme", "match_score": 90.0}]}
    index_rows, _ = build_donor_records(soft_df, hard_df, committee_names, candidate_info, principal_matches, {})
    acme = next(r for r in index_rows if r["name"] == "ACME LLC")
    smith = next(r for r in index_rows if r["name"] == "JOHN SMITH")
    assert acme["has_lobbyist_link"] is True
    assert smith["has_lobbyist_link"] is False
