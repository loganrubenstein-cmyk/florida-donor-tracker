# tests/test_08_export_json.py
import importlib.util
import json
from pathlib import Path
import pandas as pd
import pytest

_spec = importlib.util.spec_from_file_location(
    "exp08",
    Path(__file__).parent.parent / "scripts" / "08_export_json.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

is_corporate        = _mod.is_corporate
derive_committee_acct = _mod.derive_committee_acct
build_top_donors    = _mod.build_top_donors
build_donor_type    = _mod.build_donor_type
build_donor_flows   = _mod.build_donor_flows


def test_is_corporate_detects_inc():
    assert is_corporate("TECO ENERGY, INC.") is True

def test_is_corporate_detects_llc():
    assert is_corporate("SMITH VENTURES LLC") is True

def test_is_corporate_rejects_individual():
    assert is_corporate("JOHN SMITH") is False

def test_is_corporate_case_insensitive():
    assert is_corporate("acme corporation") is True

def test_derive_committee_acct_standard():
    assert derive_committee_acct("Contrib_4700.txt") == "4700"

def test_derive_committee_acct_rpof_special():
    assert derive_committee_acct("Contrib_2024_rpof.txt") == "4700"

def test_derive_committee_acct_with_spaces():
    # "Contrib_PCO_00001.txt" → "PCO 00001"
    assert derive_committee_acct("Contrib_PCO_00001.txt") == "PCO 00001"

def test_build_top_donors_aggregates(sample_contributions_df, sample_committees_df):
    # Merge TECO variants so TECO ENERGY, INC. is unambiguously the top donor ($7,500)
    df = sample_contributions_df.copy()
    df["canonical_name"] = df["contributor_name"].replace({"TECO ENERGY INC": "TECO ENERGY, INC."})
    result = build_top_donors(df, sample_committees_df, n=10)
    assert isinstance(result, list)
    assert len(result) >= 1
    first = result[0]
    assert "name" in first
    assert "total_amount" in first
    assert "num_contributions" in first
    assert "is_corporate" in first
    # TECO ENERGY should be top (2 contributions × ~5000 = ~10000)
    assert result[0]["name"] == "TECO ENERGY, INC."

def test_build_donor_flows_joins_committee(sample_contributions_df, sample_committees_df):
    df = sample_contributions_df.copy()
    df["canonical_name"] = df["contributor_name"]
    result = build_donor_flows(df, sample_committees_df, n=10)
    assert isinstance(result, list)
    assert len(result) >= 1
    flow = result[0]
    assert "donor" in flow
    assert "committee" in flow
    assert "committee_acct" in flow
    assert "total_amount" in flow
    assert "num_contributions" in flow


# ── build_donor_type ───────────────────────────────────────────────────────

@pytest.fixture
def committees_df_simple():
    return pd.DataFrame({
        "acct_num": ["4700", "99999"],
        "committee_name": ["Republican Party of Florida", "Friends of Ron DeSantis"],
    })

def test_build_donor_type_committee(committees_df_simple):
    assert build_donor_type("REPUBLICAN PARTY OF FLORIDA", committees_df_simple) == "committee"

def test_build_donor_type_committee_case_insensitive(committees_df_simple):
    assert build_donor_type("republican party of florida", committees_df_simple) == "committee"

def test_build_donor_type_corporate(committees_df_simple):
    assert build_donor_type("TECO ENERGY INC", committees_df_simple) == "corporate"

def test_build_donor_type_individual(committees_df_simple):
    assert build_donor_type("JOHN SMITH", committees_df_simple) == "individual"

def test_build_top_donors_has_type_field(sample_contributions_df, committees_df_simple):
    df = sample_contributions_df.copy()
    df["canonical_name"] = df["contributor_name"]
    result = build_top_donors(df, committees_df_simple, n=10)
    for item in result:
        assert "type" in item
        assert item["type"] in ("committee", "corporate", "individual")
