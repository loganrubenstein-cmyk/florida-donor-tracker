# tests/test_01_import_finance.py
import importlib.util
from pathlib import Path
import pandas as pd
import pytest

_spec = importlib.util.spec_from_file_location(
    "imp01",
    Path(__file__).parent.parent / "scripts" / "01_import_finance.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

parse_amount  = _mod.parse_amount
load_one_file = _mod.load_one_file
COLUMN_RENAME = _mod.COLUMN_RENAME


# ── parse_amount ──────────────────────────────────────────────────────────────

def test_parse_amount_plain_float():
    assert parse_amount("1250.00") == 1250.0

def test_parse_amount_dollar_sign():
    assert parse_amount("$1,250.00") == 1250.0

def test_parse_amount_comma_separated():
    assert parse_amount("10,000.00") == 10000.0

def test_parse_amount_negative_parens():
    assert parse_amount("(50.00)") == -50.0

def test_parse_amount_negative_dollar_parens():
    assert parse_amount("($50.00)") == -50.0

def test_parse_amount_nan():
    assert parse_amount(float("nan")) == 0.0

def test_parse_amount_none():
    assert parse_amount(None) == 0.0

def test_parse_amount_empty_string():
    assert parse_amount("") == 0.0

def test_parse_amount_whitespace():
    assert parse_amount("  ") == 0.0

def test_parse_amount_invalid_string():
    assert parse_amount("N/A") == 0.0

def test_parse_amount_zero():
    assert parse_amount("0.00") == 0.0

def test_parse_amount_integer_string():
    assert parse_amount("500") == 500.0


# ── COLUMN_RENAME map ─────────────────────────────────────────────────────────

def test_column_rename_has_date():
    assert "Date" in COLUMN_RENAME
    assert COLUMN_RENAME["Date"] == "contribution_date"

def test_column_rename_has_amount():
    assert "Amount" in COLUMN_RENAME
    assert COLUMN_RENAME["Amount"] == "amount"

def test_column_rename_has_contributor_name():
    assert "Contributor Name" in COLUMN_RENAME
    assert COLUMN_RENAME["Contributor Name"] == "contributor_name"


# ── load_one_file ─────────────────────────────────────────────────────────────

@pytest.fixture
def sample_contrib_txt(tmp_path):
    """Write a minimal FL DOE tab-delimited contributions file."""
    content = (
        "Rpt Yr\tRpt Type\tDate\tAmount\tContributor Name\t"
        "Address\tCity State Zip\tOccupation\tTyp\tInKind Desc\n"
        "2024\tQ1\t01/15/2024\t$5,000.00\tTECO ENERGY, INC.\t"
        "123 Main St\tTAMPA, FL 33601\tENERGY\tCHE\t\n"
        "2024\tQ1\t02/01/2024\t(500.00)\tJOHN SMITH\t"
        "456 Oak Ave\tMIAMI, FL 33101\tRETIRED\tCHE\t\n"
    )
    p = tmp_path / "Contrib_4700.txt"
    p.write_text(content, encoding="latin-1")
    return p

def test_load_one_file_returns_dataframe(sample_contrib_txt):
    df = load_one_file(sample_contrib_txt)
    assert isinstance(df, pd.DataFrame)

def test_load_one_file_row_count(sample_contrib_txt):
    df = load_one_file(sample_contrib_txt)
    assert len(df) == 2

def test_load_one_file_columns_renamed(sample_contrib_txt):
    df = load_one_file(sample_contrib_txt)
    assert "contribution_date" in df.columns
    assert "amount" in df.columns
    assert "contributor_name" in df.columns

def test_load_one_file_amount_parsed(sample_contrib_txt):
    df = load_one_file(sample_contrib_txt)
    assert df.iloc[0]["amount"] == 5000.0
    assert df.iloc[1]["amount"] == -500.0

def test_load_one_file_date_parsed(sample_contrib_txt):
    df = load_one_file(sample_contrib_txt)
    assert pd.api.types.is_datetime64_any_dtype(df["contribution_date"])
    assert df.iloc[0]["contribution_date"].year == 2024

def test_load_one_file_source_file_tagged(sample_contrib_txt):
    df = load_one_file(sample_contrib_txt)
    assert "source_file" in df.columns
    assert (df["source_file"] == "Contrib_4700.txt").all()

def test_load_one_file_contributor_names(sample_contrib_txt):
    df = load_one_file(sample_contrib_txt)
    names = set(df["contributor_name"].tolist())
    assert "TECO ENERGY, INC." in names
    assert "JOHN SMITH" in names
