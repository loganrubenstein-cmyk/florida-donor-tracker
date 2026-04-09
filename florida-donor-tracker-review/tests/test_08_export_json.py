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

is_corporate          = _mod.is_corporate
derive_committee_acct = _mod.derive_committee_acct
build_top_donors      = _mod.build_top_donors
build_donor_type      = _mod.build_donor_type
build_donor_flows     = _mod.build_donor_flows
build_transfer_stats  = _mod.build_transfer_stats
build_per_committee_files = _mod.build_per_committee_files


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


# ── build_transfer_stats ───────────────────────────────────────────────────

@pytest.fixture
def sample_transfers_df():
    """Minimal transfers DataFrame matching transfers.csv schema."""
    return pd.DataFrame({
        "transferor_name": [
            "Republican Party of Florida",
            "Republican Party of Florida",
            "Accountability Watchdog, ECO",
        ],
        "transferee_name": [
            "Accountability Watchdog, ECO",
            "Accountability in Government",
            "Accountability in Government",
        ],
        "amount": [50000.0, 25000.0, 10000.0],
        "transfer_date": ["2024-01-10", "2024-02-15", "2024-03-01"],
    })


def test_build_transfer_stats_out(sample_transfers_df, sample_committees_df):
    stats = build_transfer_stats(sample_transfers_df, sample_committees_df)
    # RPOF (4700) sent $75,000 total
    assert "4700" in stats
    assert stats["4700"]["total_transferred_out"] == 75000.0


def test_build_transfer_stats_in(sample_transfers_df, sample_committees_df):
    stats = build_transfer_stats(sample_transfers_df, sample_committees_df)
    # Accountability in Government (74932) received $35,000
    assert "74932" in stats
    assert stats["74932"]["total_transferred_in"] == 35000.0


def test_build_transfer_stats_top_recipients(sample_transfers_df, sample_committees_df):
    stats = build_transfer_stats(sample_transfers_df, sample_committees_df)
    recipients = stats["4700"]["top_transfer_recipients"]
    assert len(recipients) == 2
    # Largest recipient first
    assert recipients[0]["total_amount"] == 50000.0
    assert recipients[0]["name"] == "Accountability Watchdog, ECO"


def test_build_transfer_stats_no_match_returns_empty(sample_committees_df):
    # Transferor name doesn't match any committee
    tdf = pd.DataFrame({
        "transferor_name": ["Unknown Org LLC"],
        "transferee_name": ["Another Unknown"],
        "amount": [1000.0],
    })
    stats = build_transfer_stats(tdf, sample_committees_df)
    assert stats == {}


# ── build_per_committee_files ──────────────────────────────────────────────

@pytest.fixture
def deduped_contributions_df(sample_contributions_df):
    df = sample_contributions_df.copy()
    df["canonical_name"] = df["contributor_name"]
    return df


def test_build_per_committee_files_has_transfer_fields_when_no_transfers(
    deduped_contributions_df, sample_committees_df
):
    result = build_per_committee_files(deduped_contributions_df, sample_committees_df)
    # All committees should have zeroed transfer fields
    for acct, data in result.items():
        assert data["total_transferred_out"] == 0.0
        assert data["total_transferred_in"] == 0.0
        assert data["top_transfer_recipients"] == []


def test_build_per_committee_files_with_transfer_stats(
    deduped_contributions_df, sample_committees_df, sample_transfers_df
):
    stats = build_transfer_stats(sample_transfers_df, sample_committees_df)
    result = build_per_committee_files(
        deduped_contributions_df, sample_committees_df, transfer_stats=stats
    )
    rpof = result.get("4700")
    assert rpof is not None
    assert rpof["total_transferred_out"] == 75000.0
    assert len(rpof["top_transfer_recipients"]) == 2


def test_build_per_committee_files_schema(deduped_contributions_df, sample_committees_df):
    result = build_per_committee_files(deduped_contributions_df, sample_committees_df)
    for acct, data in result.items():
        for field in (
            "acct_num", "committee_name", "total_received", "num_contributions",
            "date_range", "top_donors",
            "total_transferred_out", "total_transferred_in", "top_transfer_recipients",
        ):
            assert field in data, f"Missing field {field!r} in committee {acct}"
