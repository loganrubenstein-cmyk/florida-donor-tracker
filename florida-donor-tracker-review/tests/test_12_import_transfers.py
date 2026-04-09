# tests/test_12_import_transfers.py
import importlib.util
import pandas as pd
import pytest
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "import12",
    Path(__file__).parent.parent / "scripts" / "12_import_transfers.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

parse_amount  = _mod.parse_amount
load_one_file = _mod.load_one_file
COLUMN_RENAME = _mod.COLUMN_RENAME


# ── parse_amount ──────────────────────────────────────────────────────────────

def test_parse_amount_plain():
    assert parse_amount("1000.00") == 1000.0

def test_parse_amount_with_commas():
    assert parse_amount("75,042.78") == 75042.78

def test_parse_amount_with_dollar_sign():
    assert parse_amount("$5,000.00") == 5000.0

def test_parse_amount_negative_parens():
    assert parse_amount("(500.00)") == -500.0

def test_parse_amount_negative_with_commas():
    assert parse_amount("(1,234.56)") == -1234.56

def test_parse_amount_empty_string():
    assert parse_amount("") == 0.0

def test_parse_amount_nan():
    assert parse_amount(float("nan")) == 0.0

def test_parse_amount_whitespace():
    assert parse_amount("  250.00  ") == 250.0

def test_parse_amount_invalid():
    assert parse_amount("N/A") == 0.0

def test_parse_amount_zero():
    assert parse_amount("0.00") == 0.0


# ── COLUMN_RENAME coverage ────────────────────────────────────────────────────

def test_column_rename_has_transferor_variants():
    transferor_keys = [k for k, v in COLUMN_RENAME.items() if v == "transferor_name"]
    assert len(transferor_keys) >= 3

def test_column_rename_has_transferee_variants():
    transferee_keys = [k for k, v in COLUMN_RENAME.items() if v == "transferee_name"]
    assert len(transferee_keys) >= 3

def test_column_rename_has_amount_variants():
    amount_keys = [k for k, v in COLUMN_RENAME.items() if v == "amount"]
    assert len(amount_keys) >= 2

def test_column_rename_has_date_variants():
    date_keys = [k for k, v in COLUMN_RENAME.items() if v == "transfer_date"]
    assert len(date_keys) >= 2


# ── load_one_file ─────────────────────────────────────────────────────────────

@pytest.fixture
def sample_transfer_tsv(tmp_path):
    """Write a minimal TSV in FundXfers.exe format."""
    content = (
        "Candidate/Committee\tDate\tAmount\tFunds Transferred To\tAddress\tCity State Zip\tTyp\tInKind Desc\n"
        "Republican Party of Florida\t01/15/2020\t10000.00\tFlorida Victory\t123 Main St\tTallahassee FL 32301\tMO\t\n"
        "Republican Party of Florida\t02/20/2020\t5000.00\tFlorida House Victory\t456 Oak Ave\tOrlando FL 32801\tMO\t\n"
    )
    f = tmp_path / "Transfer_4700.txt"
    f.write_text(content, encoding="latin-1")
    return f

def test_load_one_file_returns_dataframe(sample_transfer_tsv):
    df = load_one_file(sample_transfer_tsv)
    assert isinstance(df, pd.DataFrame)

def test_load_one_file_row_count(sample_transfer_tsv):
    df = load_one_file(sample_transfer_tsv)
    assert len(df) == 2

def test_load_one_file_renames_columns(sample_transfer_tsv):
    df = load_one_file(sample_transfer_tsv)
    assert "transferor_name" in df.columns
    assert "transfer_date" in df.columns
    assert "amount" in df.columns

def test_load_one_file_parses_amount(sample_transfer_tsv):
    df = load_one_file(sample_transfer_tsv)
    assert df["amount"].iloc[0] == 10000.0
    assert df["amount"].iloc[1] == 5000.0

def test_load_one_file_parses_date(sample_transfer_tsv):
    df = load_one_file(sample_transfer_tsv)
    assert pd.notna(df["transfer_date"].iloc[0])
    assert df["transfer_date"].iloc[0].year == 2020

def test_load_one_file_adds_source_file(sample_transfer_tsv):
    df = load_one_file(sample_transfer_tsv)
    assert "source_file" in df.columns
    assert df["source_file"].iloc[0] == "Transfer_4700.txt"

def test_load_one_file_alternate_column_names(tmp_path):
    """Test that variant column names (From Name / To Name) are also handled."""
    content = (
        "From Name\tXfer Date\tAmt\tTo Name\n"
        "Some PAC\t03/01/2021\t2500.00\tAnother PAC\n"
    )
    f = tmp_path / "Transfer_9999.txt"
    f.write_text(content, encoding="latin-1")
    df = load_one_file(f)
    assert "transferor_name" in df.columns
    assert "transferee_name" in df.columns
    assert "amount" in df.columns
    assert df["amount"].iloc[0] == 2500.0
