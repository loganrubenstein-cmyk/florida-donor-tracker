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

is_corporate            = _mod.is_corporate
derive_committee_acct   = _mod.derive_committee_acct
build_top_donors        = _mod.build_top_donors
build_top_corporate_donors = _mod.build_top_corporate_donors
build_donor_type        = _mod.build_donor_type
build_donor_flows       = _mod.build_donor_flows
build_per_committee_files = _mod.build_per_committee_files
write_json              = _mod.write_json


# ── is_corporate ───────────────────────────────────────────────────────────────

def test_is_corporate_detects_inc():
    assert is_corporate("TECO ENERGY, INC.") is True

def test_is_corporate_detects_llc():
    assert is_corporate("SMITH VENTURES LLC") is True

def test_is_corporate_rejects_individual():
    assert is_corporate("JOHN SMITH") is False

def test_is_corporate_case_insensitive():
    assert is_corporate("acme corporation") is True

def test_is_corporate_detects_fund():
    assert is_corporate("FLORIDA GROWTH FUND") is True

def test_is_corporate_detects_holdings():
    assert is_corporate("LEGACY HOLDINGS") is True

def test_is_corporate_none_input():
    assert is_corporate(None) is False

def test_is_corporate_integer_input():
    assert is_corporate(12345) is False

def test_is_corporate_empty_string():
    assert is_corporate("") is False


# ── derive_committee_acct ──────────────────────────────────────────────────────

def test_derive_committee_acct_standard():
    assert derive_committee_acct("Contrib_4700.txt") == "4700"

def test_derive_committee_acct_rpof_special():
    assert derive_committee_acct("Contrib_2024_rpof.txt") == "4700"

def test_derive_committee_acct_with_spaces():
    # "Contrib_PCO_00001.txt" → "PCO 00001"
    assert derive_committee_acct("Contrib_PCO_00001.txt") == "PCO 00001"

def test_derive_committee_acct_no_prefix():
    # File without "Contrib_" prefix → None
    assert derive_committee_acct("SomethingElse_4700.txt") is None

def test_derive_committee_acct_five_digit():
    assert derive_committee_acct("Contrib_55417.txt") == "55417"


# ── build_donor_type ───────────────────────────────────────────────────────────

@pytest.fixture
def committees_df_simple():
    return pd.DataFrame({
        "acct_num": ["4700", "99999"],
        "committee_name": ["Republican Party of Florida", "Friends of Ron DeSantis"],
    })

def test_build_donor_type_committee(committees_df_simple):
    names = set(committees_df_simple["committee_name"].str.strip().str.upper())
    assert build_donor_type("REPUBLICAN PARTY OF FLORIDA", names) == "committee"

def test_build_donor_type_committee_case_insensitive(committees_df_simple):
    names = set(committees_df_simple["committee_name"].str.strip().str.upper())
    assert build_donor_type("republican party of florida", names) == "committee"

def test_build_donor_type_corporate(committees_df_simple):
    assert build_donor_type("TECO ENERGY INC", committees_df_simple) == "corporate"

def test_build_donor_type_individual(committees_df_simple):
    assert build_donor_type("JOHN SMITH", committees_df_simple) == "individual"

def test_build_donor_type_non_string(committees_df_simple):
    assert build_donor_type(None, committees_df_simple) == "individual"


# ── build_top_donors ───────────────────────────────────────────────────────────

def test_build_top_donors_aggregates(sample_contributions_df, sample_committees_df):
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
    assert result[0]["name"] == "TECO ENERGY, INC."

def test_build_top_donors_has_type_field(sample_contributions_df, committees_df_simple):
    df = sample_contributions_df.copy()
    df["canonical_name"] = df["contributor_name"]
    result = build_top_donors(df, committees_df_simple, n=10)
    for item in result:
        assert "type" in item
        assert item["type"] in ("committee", "corporate", "individual")

def test_build_top_donors_n_limit(sample_contributions_df, sample_committees_df):
    df = sample_contributions_df.copy()
    df["canonical_name"] = df["contributor_name"]
    result = build_top_donors(df, sample_committees_df, n=2)
    assert len(result) <= 2

def test_build_top_donors_is_corporate_flag(sample_contributions_df, sample_committees_df):
    df = sample_contributions_df.copy()
    df["canonical_name"] = df["contributor_name"]
    result = build_top_donors(df, sample_committees_df, n=10)
    by_name = {r["name"]: r for r in result}
    assert by_name["JOHN SMITH"]["is_corporate"] is False
    assert by_name["U.S. SUGAR CORPORATION"]["is_corporate"] is True

def test_build_top_donors_amounts_rounded(sample_committees_df):
    df = pd.DataFrame({
        "canonical_name": ["ACME LLC"],
        "amount": [1234.5678],
    })
    result = build_top_donors(df, sample_committees_df, n=10)
    assert result[0]["total_amount"] == 1234.57

def test_build_top_donors_empty_df(sample_committees_df):
    df = pd.DataFrame({"canonical_name": [], "amount": []})
    result = build_top_donors(df, sample_committees_df, n=10)
    assert result == []

def test_build_top_donors_sorted_descending(sample_contributions_df, sample_committees_df):
    df = sample_contributions_df.copy()
    df["canonical_name"] = df["contributor_name"]
    result = build_top_donors(df, sample_committees_df, n=10)
    amounts = [r["total_amount"] for r in result]
    assert amounts == sorted(amounts, reverse=True)


# ── build_top_corporate_donors ─────────────────────────────────────────────────

def test_build_top_corporate_donors_excludes_individuals(sample_contributions_df, sample_committees_df):
    df = sample_contributions_df.copy()
    df["canonical_name"] = df["contributor_name"]
    result = build_top_corporate_donors(df, sample_committees_df, n=10)
    names = {r["name"] for r in result}
    assert "JOHN SMITH" not in names

def test_build_top_corporate_donors_all_corporate(sample_contributions_df, sample_committees_df):
    df = sample_contributions_df.copy()
    df["canonical_name"] = df["contributor_name"]
    result = build_top_corporate_donors(df, sample_committees_df, n=10)
    for item in result:
        assert is_corporate(item["name"]) is True

def test_build_top_corporate_donors_n_limit(sample_contributions_df, sample_committees_df):
    df = sample_contributions_df.copy()
    df["canonical_name"] = df["contributor_name"]
    result = build_top_corporate_donors(df, sample_committees_df, n=1)
    assert len(result) <= 1

def test_build_top_corporate_donors_empty_when_no_corporates(sample_committees_df):
    df = pd.DataFrame({
        "canonical_name": ["ALICE JONES", "BOB BROWN"],
        "amount": [500.0, 300.0],
    })
    result = build_top_corporate_donors(df, sample_committees_df, n=10)
    assert result == []

def test_build_top_corporate_donors_schema(sample_contributions_df, sample_committees_df):
    df = sample_contributions_df.copy()
    df["canonical_name"] = df["contributor_name"]
    result = build_top_corporate_donors(df, sample_committees_df, n=10)
    assert len(result) > 0
    for item in result:
        assert set(item.keys()) == {"name", "total_amount", "num_contributions", "is_corporate", "type"}


# ── build_donor_flows ─────────────────────────────────────────────────────────

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

def test_build_donor_flows_n_limit(sample_contributions_df, sample_committees_df):
    df = sample_contributions_df.copy()
    df["canonical_name"] = df["contributor_name"]
    result = build_donor_flows(df, sample_committees_df, n=1)
    assert len(result) <= 1

def test_build_donor_flows_excludes_unresolvable_source(sample_committees_df):
    df = pd.DataFrame({
        "canonical_name": ["TECO ENERGY INC"],
        "amount": [5000.0],
        "source_file": ["UNKNOWN_FORMAT.txt"],  # no "Contrib_" prefix → None
    })
    result = build_donor_flows(df, sample_committees_df, n=10)
    assert result == []

def test_build_donor_flows_unknown_committee(sample_committees_df):
    # acct 99999 is not in committees_df → "Unknown"
    df = pd.DataFrame({
        "canonical_name": ["TECO ENERGY INC"],
        "amount": [5000.0],
        "source_file": ["Contrib_99999.txt"],
    })
    result = build_donor_flows(df, sample_committees_df, n=10)
    assert len(result) == 1
    assert result[0]["committee"] == "Unknown"
    assert result[0]["committee_acct"] == "99999"


# ── build_per_committee_files ─────────────────────────────────────────────────

@pytest.fixture
def per_committee_df(sample_contributions_df):
    """Contributions DF with parsed dates and canonical_name, ready for build_per_committee_files."""
    df = sample_contributions_df.copy()
    df["canonical_name"] = df["contributor_name"]
    df["contribution_date"] = pd.to_datetime(df["contribution_date"], errors="coerce")
    return df

def test_build_per_committee_files_returns_dict(per_committee_df, sample_committees_df):
    result = build_per_committee_files(per_committee_df, sample_committees_df)
    assert isinstance(result, dict)

def test_build_per_committee_files_keyed_by_acct(per_committee_df, sample_committees_df):
    result = build_per_committee_files(per_committee_df, sample_committees_df)
    # All source_files → "4700" (via _SOURCE_FILE_MAP)
    assert "4700" in result

def test_build_per_committee_files_total_received(per_committee_df, sample_committees_df):
    result = build_per_committee_files(per_committee_df, sample_committees_df)
    assert result["4700"]["total_received"] == 13500.0  # 5000+2500+5000+1000

def test_build_per_committee_files_num_contributions(per_committee_df, sample_committees_df):
    result = build_per_committee_files(per_committee_df, sample_committees_df)
    assert result["4700"]["num_contributions"] == 4

def test_build_per_committee_files_committee_name(per_committee_df, sample_committees_df):
    result = build_per_committee_files(per_committee_df, sample_committees_df)
    assert result["4700"]["committee_name"] == "Republican Party of Florida"

def test_build_per_committee_files_unknown_committee_name(sample_committees_df):
    df = pd.DataFrame({
        "canonical_name": ["TECO ENERGY INC"],
        "amount": [5000.0],
        "source_file": ["Contrib_99999.txt"],
        "contribution_date": pd.to_datetime(["2024-01-15"]),
    })
    result = build_per_committee_files(df, sample_committees_df)
    assert result["99999"]["committee_name"] == "Unknown"

def test_build_per_committee_files_date_range(per_committee_df, sample_committees_df):
    result = build_per_committee_files(per_committee_df, sample_committees_df)
    dr = result["4700"]["date_range"]
    assert "earliest" in dr
    assert "latest" in dr
    assert dr["earliest"] == "2024-01-15"
    assert dr["latest"] == "2024-03-01"

def test_build_per_committee_files_date_range_no_column(sample_committees_df):
    df = pd.DataFrame({
        "canonical_name": ["TECO ENERGY INC"],
        "amount": [5000.0],
        "source_file": ["Contrib_4700.txt"],
        # no contribution_date column
    })
    result = build_per_committee_files(df, sample_committees_df)
    dr = result["4700"]["date_range"]
    assert dr["earliest"] is None
    assert dr["latest"] is None

def test_build_per_committee_files_top_donors_is_list(per_committee_df, sample_committees_df):
    result = build_per_committee_files(per_committee_df, sample_committees_df)
    assert isinstance(result["4700"]["top_donors"], list)

def test_build_per_committee_files_top_donors_schema(per_committee_df, sample_committees_df):
    result = build_per_committee_files(per_committee_df, sample_committees_df)
    for donor in result["4700"]["top_donors"]:
        assert "name" in donor
        assert "total_amount" in donor
        assert "num_contributions" in donor
        assert "type" in donor

def test_build_per_committee_files_excludes_bad_source(sample_committees_df):
    df = pd.DataFrame({
        "canonical_name": ["TECO ENERGY INC", "JOHN SMITH"],
        "amount": [5000.0, 1000.0],
        "source_file": ["Contrib_4700.txt", "BAD_FORMAT.txt"],
    })
    result = build_per_committee_files(df, sample_committees_df)
    assert "4700" in result
    assert result["4700"]["num_contributions"] == 1  # BAD_FORMAT row excluded


# ── write_json ────────────────────────────────────────────────────────────────

def test_write_json_creates_file(tmp_path):
    data = {"key": "value", "num": 42}
    out = tmp_path / "test_output.json"
    write_json(data, out)
    assert out.exists()

def test_write_json_correct_content(tmp_path):
    data = {"key": "value", "num": 42}
    out = tmp_path / "test_output.json"
    write_json(data, out)
    loaded = json.loads(out.read_text())
    assert loaded == data

def test_write_json_creates_parent_dirs(tmp_path):
    data = [1, 2, 3]
    out = tmp_path / "nested" / "deep" / "output.json"
    write_json(data, out)
    assert out.exists()
    assert json.loads(out.read_text()) == data
