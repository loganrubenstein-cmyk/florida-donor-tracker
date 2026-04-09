# tests/test_17_export_lobbyists.py
import importlib.util
import json
import pandas as pd
import pytest
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "el17",
    Path(__file__).parent.parent / "scripts" / "17_export_lobbyists.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

build_principal_lobbyist_index  = _mod.build_principal_lobbyist_index
build_committee_donation_index  = _mod.build_committee_donation_index
build_connection_alerts         = _mod.build_connection_alerts
write_per_committee_lobbyist_files = _mod.write_per_committee_lobbyist_files
_derive_acct_vectorized         = _mod._derive_acct_vectorized


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def regs_df():
    return pd.DataFrame({
        "principal_name": ["TECO Energy", "TECO Energy", "Florida Chamber", "Inactive Corp"],
        "lobbyist_name":  ["SMITH JOHN",  "JONES ALICE", "DOE BOB",         "GONE GARY"],
        "branch":         ["legislative", "executive",   "legislative",      "legislative"],
        "is_active":      ["True",        "True",        "True",             "False"],
    })


@pytest.fixture
def contribs_df():
    return pd.DataFrame({
        "canonical_name": [
            "TECO ENERGY INC",
            "TECO ENERGY INC",
            "FLORIDA CHAMBER OF COMMERCE",
            "SOME INDIVIDUAL",
        ],
        "amount":      [50000.0, 25000.0, 10000.0, 500.0],
        "source_file": [
            "Contrib_4700.txt",
            "Contrib_1539.txt",
            "Contrib_4700.txt",
            "Contrib_4700.txt",
        ],
    })


@pytest.fixture
def matches_df():
    return pd.DataFrame({
        "principal_name":   ["TECO Energy", "Florida Chamber"],
        "contributor_name": ["TECO ENERGY INC", "FLORIDA CHAMBER OF COMMERCE"],
        "match_score":      [100.0, 95.0],
        "match_type":       ["exact", "fuzzy"],
    })


# ── _derive_acct_vectorized ───────────────────────────────────────────────────

def test_derive_acct_standard():
    s = pd.Series(["Contrib_4700.txt", "Contrib_PCO 00001.txt"])
    result = _derive_acct_vectorized(s)
    assert result.iloc[0] == "4700"

def test_derive_acct_special_map():
    s = pd.Series(["Contrib_2024_rpof.txt"])
    result = _derive_acct_vectorized(s)
    assert result.iloc[0] == "4700"

def test_derive_acct_non_contrib_is_null():
    s = pd.Series(["Expend_4700.txt", "random.csv"])
    result = _derive_acct_vectorized(s)
    assert result.isna().all()

def test_derive_acct_preserves_length():
    s = pd.Series(["Contrib_AAA.txt", "Contrib_BBB.txt", "bad.txt"])
    result = _derive_acct_vectorized(s)
    assert len(result) == 3


# ── build_principal_lobbyist_index ────────────────────────────────────────────

def test_lobbyist_index_only_active(regs_df):
    index = build_principal_lobbyist_index(regs_df)
    # "INACTIVE CORP" has is_active=False → not in index
    assert "INACTIVE CORP" not in index

def test_lobbyist_index_has_teco(regs_df):
    index = build_principal_lobbyist_index(regs_df)
    assert "TECO ENERGY" in index

def test_lobbyist_index_lobbyist_count(regs_df):
    index = build_principal_lobbyist_index(regs_df)
    assert index["TECO ENERGY"]["lobbyist_count"] == 2

def test_lobbyist_index_branches(regs_df):
    index = build_principal_lobbyist_index(regs_df)
    assert set(index["TECO ENERGY"]["branches"]) == {"executive", "legislative"}

def test_lobbyist_index_lobbyists_list(regs_df):
    index = build_principal_lobbyist_index(regs_df)
    lobbyists = index["TECO ENERGY"]["lobbyists"]
    assert "SMITH JOHN" in lobbyists or "JONES ALICE" in lobbyists


# ── build_committee_donation_index ────────────────────────────────────────────

def test_donation_index_keys(contribs_df):
    index = build_committee_donation_index(contribs_df)
    assert ("TECO ENERGY INC", "4700") in index
    assert ("TECO ENERGY INC", "1539") in index

def test_donation_index_amounts(contribs_df):
    index = build_committee_donation_index(contribs_df)
    entry = index[("TECO ENERGY INC", "4700")]
    assert entry["total_donated"] == 50000.0
    assert entry["num_contributions"] == 1

def test_donation_index_excludes_non_contrib(contribs_df):
    bad = pd.concat([contribs_df, pd.DataFrame({
        "canonical_name": ["X"],
        "amount": [999.0],
        "source_file": ["Expend_4700.txt"],
    })], ignore_index=True)
    index = build_committee_donation_index(bad)
    assert ("X", "4700") not in index


# ── build_connection_alerts ───────────────────────────────────────────────────

def test_alerts_found(regs_df, contribs_df, matches_df):
    lobbyist_index = build_principal_lobbyist_index(regs_df)
    donation_index = build_committee_donation_index(contribs_df)
    alerts = build_connection_alerts(matches_df, donation_index, lobbyist_index)
    assert "4700" in alerts
    assert len(alerts["4700"]) > 0

def test_alert_fields(regs_df, contribs_df, matches_df):
    lobbyist_index = build_principal_lobbyist_index(regs_df)
    donation_index = build_committee_donation_index(contribs_df)
    alerts = build_connection_alerts(matches_df, donation_index, lobbyist_index)
    alert = alerts["4700"][0]
    for field in ("principal_name", "contributor_name", "match_score",
                  "total_donated", "num_contributions", "lobbyist_count",
                  "lobbyists", "branches"):
        assert field in alert, f"Missing field: {field}"

def test_alerts_sorted_by_total_donated(regs_df, contribs_df, matches_df):
    lobbyist_index = build_principal_lobbyist_index(regs_df)
    donation_index = build_committee_donation_index(contribs_df)
    alerts = build_connection_alerts(matches_df, donation_index, lobbyist_index)
    if "4700" in alerts and len(alerts["4700"]) > 1:
        amounts = [a["total_donated"] for a in alerts["4700"]]
        assert amounts == sorted(amounts, reverse=True)

def test_no_alert_without_lobbyists(contribs_df, matches_df):
    """If principal has no active lobbyists, no alert generated."""
    empty_regs = pd.DataFrame({
        "principal_name": pd.Series([], dtype=str),
        "lobbyist_name":  pd.Series([], dtype=str),
        "branch":         pd.Series([], dtype=str),
        "is_active":      pd.Series([], dtype=str),
    })
    lobbyist_index = build_principal_lobbyist_index(empty_regs)
    donation_index = build_committee_donation_index(contribs_df)
    alerts = build_connection_alerts(matches_df, donation_index, lobbyist_index)
    assert len(alerts) == 0

def test_no_alert_without_donations(regs_df, matches_df):
    """If contributor never donated to any committee, no alert generated."""
    empty_contribs = pd.DataFrame({
        "canonical_name": pd.Series([], dtype=str),
        "amount":         pd.Series([], dtype=float),
        "source_file":    pd.Series([], dtype=str),
    })
    lobbyist_index = build_principal_lobbyist_index(regs_df)
    donation_index = build_committee_donation_index(empty_contribs)
    alerts = build_connection_alerts(matches_df, donation_index, lobbyist_index)
    assert len(alerts) == 0


# ── write_per_committee_lobbyist_files ────────────────────────────────────────

def test_writes_files(tmp_path, monkeypatch):
    monkeypatch.setattr(_mod, "COMMITTEES_DIR", tmp_path)
    alerts = {
        "4700": [{"principal_name": "TECO Energy", "contributor_name": "TECO ENERGY INC",
                  "match_score": 100.0, "total_donated": 50000.0, "num_contributions": 1,
                  "lobbyist_count": 2, "lobbyists": ["SMITH JOHN"], "branches": ["legislative"]}],
        "1539": [{"principal_name": "TECO Energy", "contributor_name": "TECO ENERGY INC",
                  "match_score": 100.0, "total_donated": 25000.0, "num_contributions": 1,
                  "lobbyist_count": 2, "lobbyists": ["SMITH JOHN"], "branches": ["legislative"]}],
    }
    count = write_per_committee_lobbyist_files(alerts)
    assert count == 2
    assert (tmp_path / "4700.lobbyists.json").exists()
    assert (tmp_path / "1539.lobbyists.json").exists()

def test_output_schema(tmp_path, monkeypatch):
    monkeypatch.setattr(_mod, "COMMITTEES_DIR", tmp_path)
    alerts = {
        "4700": [{"principal_name": "TECO Energy", "contributor_name": "TECO ENERGY INC",
                  "match_score": 100.0, "total_donated": 50000.0, "num_contributions": 1,
                  "lobbyist_count": 2, "lobbyists": ["SMITH JOHN"], "branches": ["legislative"]}],
    }
    write_per_committee_lobbyist_files(alerts)
    data = json.loads((tmp_path / "4700.lobbyists.json").read_text())
    assert data["acct_num"] == "4700"
    assert data["total_lobbying_principals"] == 1
    assert len(data["connection_alerts"]) == 1
    conn = data["connection_alerts"][0]
    assert conn["principal_name"] == "TECO Energy"
    assert conn["lobbyist_count"] == 2
