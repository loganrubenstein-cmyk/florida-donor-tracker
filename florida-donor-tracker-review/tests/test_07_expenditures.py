# tests/test_07_expenditures.py
import importlib.util
from pathlib import Path
import pandas as pd
import pytest

_spec = importlib.util.spec_from_file_location(
    "exp07",
    Path(__file__).parent.parent / "scripts" / "07_import_expenditures.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

parse_amount = _mod.parse_amount
load_one_file = _mod.load_one_file


def test_parse_amount_plain():
    assert parse_amount("1250.00") == 1250.0

def test_parse_amount_with_dollar_and_comma():
    assert parse_amount("$1,250.00") == 1250.0

def test_parse_amount_negative_parens():
    assert parse_amount("(50.00)") == -50.0

def test_parse_amount_empty():
    assert parse_amount("") == 0.0

def test_parse_amount_nan():
    assert parse_amount(float("nan")) == 0.0

def test_load_one_file_reads_tsv(tmp_path):
    """load_one_file should read a tab-delimited file and strip column whitespace."""
    sample = tmp_path / "Expend_test.txt"
    sample.write_text(
        "Date\tAmount\tVendor Name\tPurpose\n"
        "01/15/2024\t500.00\tACME PRINTING\tCAMPAIGN MATERIALS\n",
        encoding="latin-1",
    )
    df = load_one_file(sample)
    assert len(df) == 1
    assert "source_file" in df.columns
    assert df["source_file"].iloc[0] == "Expend_test.txt"
    # Columns should have whitespace stripped
    assert all(c == c.strip() for c in df.columns)
