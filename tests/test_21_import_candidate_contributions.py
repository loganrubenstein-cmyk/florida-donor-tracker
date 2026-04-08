# tests/test_21_import_candidate_contributions.py
import importlib.util
import pandas as pd
import pytest
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "import21",
    Path(__file__).parent.parent / "scripts" / "21_import_candidate_contributions.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

parse_amount    = _mod.parse_amount
is_corporate    = _mod.is_corporate
election_year   = _mod.election_year
load_one_file   = _mod.load_one_file
COLUMN_RENAME   = _mod.COLUMN_RENAME


# ── parse_amount ───────────────────────────────────────────────────────────────

def test_parse_amount_plain():
    assert parse_amount("1000.00") == 1000.0

def test_parse_amount_with_dollar_sign():
    assert parse_amount("$2,500.00") == 2500.0

def test_parse_amount_with_commas():
    assert parse_amount("1,234.56") == pytest.approx(1234.56)

def test_parse_amount_negative_parentheses():
    assert parse_amount("(500.00)") == pytest.approx(-500.0)

def test_parse_amount_empty_string():
    assert parse_amount("") == 0.0

def test_parse_amount_nan():
    assert parse_amount(float("nan")) == 0.0

def test_parse_amount_zero():
    assert parse_amount("0") == 0.0

def test_parse_amount_bad_value():
    assert parse_amount("N/A") == 0.0


# ── is_corporate ───────────────────────────────────────────────────────────────

def test_is_corporate_llc():
    assert is_corporate("ACME LLC") is True

def test_is_corporate_inc():
    assert is_corporate("Big Corp INC") is True

def test_is_corporate_pac():
    assert is_corporate("Florida PAC") is True

def test_is_corporate_individual():
    assert is_corporate("John Smith") is False

def test_is_corporate_occupation_political_committee():
    assert is_corporate("Jane Doe", "POLITICAL COMMITTEE") is True

def test_is_corporate_occupation_pac():
    assert is_corporate("Jane Doe", "PAC") is True

def test_is_corporate_occupation_individual():
    assert is_corporate("Jane Doe", "ATTORNEY") is False

def test_is_corporate_empty_name():
    assert is_corporate("", "") is False

def test_is_corporate_trust():
    assert is_corporate("Smith Family TRUST") is True

def test_is_corporate_association():
    assert is_corporate("Realtors ASSOCIATION") is True


# ── election_year ──────────────────────────────────────────────────────────────

def test_election_year_gen():
    assert election_year("20261103-GEN") == "2026"

def test_election_year_2006():
    assert election_year("20061107-GEN") == "2006"

def test_election_year_empty():
    assert election_year("") == ""

def test_election_year_malformed():
    assert election_year("abc") == ""

def test_election_year_nan():
    assert election_year("nan") == ""


# ── load_one_file ──────────────────────────────────────────────────────────────

@pytest.fixture
def sample_tsv(tmp_path) -> Path:
    """Minimal TSV matching TreFin.exe output column names."""
    content = (
        "Rpt Yr\tRpt Type\tDate\tAmount\tContributor Name\t"
        "Address\tCity State Zip\tOccupation\tTyp\tInKind Desc\n"
        "2026\tQ1\t01/15/2026\t1000.00\tJohn Smith\t"
        "123 Main St\tTallahassee FL 32301\tATTORNEY\tC\t\n"
        "2026\tQ1\t02/10/2026\t500.00\tAcme LLC\t"
        "456 Oak Ave\tOrlando FL 32801\tBUSINESS\tC\t\n"
    )
    p = tmp_path / "CandContrib_88746.txt"
    p.write_text(content, encoding="latin-1")
    return p

@pytest.fixture
def cand_meta():
    return {
        "acct_num":       "88746",
        "candidate_name": "Michelle Salzman",
        "election_id":    "20261103-GEN",
        "election_year":  "2026",
        "office_code":    "STR",
        "office_desc":    "State Representative",
        "party_code":     "REP",
        "district":       "001",
        "status_desc":    "Active",
    }

def test_load_one_file_row_count(sample_tsv, cand_meta):
    df = load_one_file(sample_tsv, cand_meta)
    assert len(df) == 2

def test_load_one_file_columns_renamed(sample_tsv, cand_meta):
    df = load_one_file(sample_tsv, cand_meta)
    assert "contribution_date" in df.columns
    assert "amount" in df.columns
    assert "contributor_name" in df.columns
    assert "contributor_occupation" in df.columns

def test_load_one_file_amount_parsed(sample_tsv, cand_meta):
    df = load_one_file(sample_tsv, cand_meta)
    assert df["amount"].iloc[0] == pytest.approx(1000.0)

def test_load_one_file_date_parsed(sample_tsv, cand_meta):
    df = load_one_file(sample_tsv, cand_meta)
    assert pd.notna(df["contribution_date"].iloc[0])
    assert df["contribution_date"].iloc[0].month == 1

def test_load_one_file_candidate_meta_attached(sample_tsv, cand_meta):
    df = load_one_file(sample_tsv, cand_meta)
    assert df["acct_num"].iloc[0] == "88746"
    assert df["candidate_name"].iloc[0] == "Michelle Salzman"
    assert df["election_year"].iloc[0] == "2026"
    assert df["party_code"].iloc[0] == "REP"

def test_load_one_file_is_corporate_tagged(sample_tsv, cand_meta):
    df = load_one_file(sample_tsv, cand_meta)
    # John Smith → individual
    assert df[df["contributor_name"] == "John Smith"]["is_corporate"].iloc[0] == False
    # Acme LLC → corporate
    assert df[df["contributor_name"] == "Acme LLC"]["is_corporate"].iloc[0] == True

def test_load_one_file_source_file_set(sample_tsv, cand_meta):
    df = load_one_file(sample_tsv, cand_meta)
    assert df["source_file"].iloc[0] == sample_tsv.name

def test_load_one_file_empty_file(tmp_path, cand_meta):
    """File with only a header row (no data) should return empty DataFrame."""
    content = (
        "Rpt Yr\tRpt Type\tDate\tAmount\tContributor Name\t"
        "Address\tCity State Zip\tOccupation\tTyp\tInKind Desc\n"
    )
    p = tmp_path / "CandContrib_00000.txt"
    p.write_text(content, encoding="latin-1")
    df = load_one_file(p, cand_meta)
    assert df.empty

def test_load_one_file_bad_path(tmp_path, cand_meta):
    """Non-existent file should return empty DataFrame (not raise)."""
    p = tmp_path / "CandContrib_missing.txt"
    df = load_one_file(p, cand_meta)
    assert df.empty


# ── COLUMN_RENAME completeness ─────────────────────────────────────────────────

def test_column_rename_covers_key_fields():
    """Verify the rename map hits the columns we actually care about."""
    expected_values = {"amount", "contribution_date", "contributor_name",
                       "contributor_occupation", "report_year", "report_type"}
    assert expected_values.issubset(set(COLUMN_RENAME.values()))
