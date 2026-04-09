# tests/conftest.py
"""Shared fixtures for all pipeline tests."""
import pandas as pd
import pytest
from pathlib import Path


@pytest.fixture
def sample_contributions_df():
    """Minimal contributions DataFrame matching contributions.csv schema."""
    return pd.DataFrame({
        "report_year": ["2024", "2024", "2024", "2024"],
        "contribution_date": ["2024-01-15", "2024-02-01", "2024-01-20", "2024-03-01"],
        "amount": [5000.0, 2500.0, 5000.0, 1000.0],
        "contributor_name": [
            "TECO ENERGY, INC.",
            "TECO ENERGY INC",          # duplicate variant
            "U.S. SUGAR CORPORATION",
            "JOHN SMITH",
        ],
        "contributor_address": ["123 Main St", "123 Main St", "456 Oak Ave", "789 Elm St"],
        "contributor_city_state_zip": ["TAMPA, FL 33601", "TAMPA, FL 33601", "CLEWISTON, FL 33440", "MIAMI, FL 33101"],
        "contributor_occupation": ["ENERGY", "ENERGY", "AGRICULTURE", "RETIRED"],
        "type_code": ["CHE", "CHE", "CHE", "CHE"],
        "in_kind_description": ["", "", "", ""],
        "source_file": [
            "Contrib_2024_rpof.txt",
            "Contrib_2024_rpof.txt",
            "Contrib_2024_rpof.txt",
            "Contrib_2024_rpof.txt",
        ],
    })


@pytest.fixture
def sample_committees_df():
    """Minimal committees DataFrame matching committees.csv schema."""
    return pd.DataFrame({
        "acct_num": ["4700", "55417", "74932"],
        "committee_name": [
            "Republican Party of Florida",
            "Accountability Watchdog, ECO",
            "Accountability in Government",
        ],
        "type_code": ["PTY", "ECO", "PAC"],
        "type_desc": ["Party Executive Committee", "Electioneering Communications Organization", "Political Committee"],
        "city": ["Tallahassee", "Miami", "Orlando"],
        "state": ["FL", "FL", "FL"],
    })


@pytest.fixture
def tmp_data_dir(tmp_path):
    """A temporary directory mimicking the project's data/processed/ layout."""
    (tmp_path / "processed").mkdir()
    (tmp_path / "raw" / "expenditures").mkdir(parents=True)
    (tmp_path / "public" / "data" / "committees").mkdir(parents=True)
    return tmp_path
