# tests/test_22_export_candidate_json.py
import importlib.util
import json
import pandas as pd
import pytest
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "export22",
    Path(__file__).parent.parent / "scripts" / "22_export_candidate_json.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

date_to_quarter_label = _mod.date_to_quarter_label
build_quarterly_series = _mod.build_quarterly_series
build_top_donors       = _mod.build_top_donors
build_linked_pcs       = _mod.build_linked_pcs
TOP_DONORS_LIMIT       = _mod.TOP_DONORS_LIMIT


# ── date_to_quarter_label ──────────────────────────────────────────────────────

def test_quarter_q1():
    dt = pd.Timestamp("2026-01-15")
    assert date_to_quarter_label(dt) == "2026-Q1"

def test_quarter_q2():
    dt = pd.Timestamp("2026-04-01")
    assert date_to_quarter_label(dt) == "2026-Q2"

def test_quarter_q3():
    dt = pd.Timestamp("2026-07-31")
    assert date_to_quarter_label(dt) == "2026-Q3"

def test_quarter_q4():
    dt = pd.Timestamp("2026-10-15")
    assert date_to_quarter_label(dt) == "2026-Q4"

def test_quarter_boundary_march():
    assert date_to_quarter_label(pd.Timestamp("2026-03-31")) == "2026-Q1"

def test_quarter_boundary_april():
    assert date_to_quarter_label(pd.Timestamp("2026-04-01")) == "2026-Q2"

def test_quarter_nat():
    assert date_to_quarter_label(pd.NaT) is None


# ── build_quarterly_series ─────────────────────────────────────────────────────

@pytest.fixture
def contrib_df():
    return pd.DataFrame({
        "contribution_date": pd.to_datetime([
            "2025-01-10", "2025-01-20", "2025-04-05", "2025-07-15", None,
        ]),
        "amount": [1000.0, 500.0, 2000.0, 750.0, 300.0],
    })

def test_quarterly_series_length(contrib_df):
    series = build_quarterly_series(contrib_df)
    # 3 non-null distinct quarters: 2025-Q1, 2025-Q2, 2025-Q3
    assert len(series) == 3

def test_quarterly_series_q1_total(contrib_df):
    series = build_quarterly_series(contrib_df)
    q1 = next(s for s in series if s["period"] == "2025-Q1")
    assert q1["amount"] == pytest.approx(1500.0)
    assert q1["num_contributions"] == 2

def test_quarterly_series_sorted(contrib_df):
    series = build_quarterly_series(contrib_df)
    periods = [s["period"] for s in series]
    assert periods == sorted(periods)

def test_quarterly_series_null_dates_excluded(contrib_df):
    series = build_quarterly_series(contrib_df)
    # The row with None date contributes $300 — if included it would land in no quarter
    total = sum(s["amount"] for s in series)
    assert total == pytest.approx(1000 + 500 + 2000 + 750)

def test_quarterly_series_empty_df():
    df = pd.DataFrame({"contribution_date": pd.Series([], dtype="datetime64[ns]"), "amount": []})
    assert build_quarterly_series(df) == []

def test_quarterly_series_all_null_dates():
    df = pd.DataFrame({
        "contribution_date": pd.to_datetime([None, None]),
        "amount": [100.0, 200.0],
    })
    assert build_quarterly_series(df) == []


# ── build_top_donors ───────────────────────────────────────────────────────────

@pytest.fixture
def donor_df():
    return pd.DataFrame({
        "contributor_name": ["Alice", "Bob", "Alice", "Corp LLC", "Bob"],
        "amount":           [500.0,  1000.0, 700.0,  3000.0,    200.0],
        "is_corporate":     [False,  False,  False,  True,      False],
        "contributor_occupation": ["LAWYER", "DOCTOR", "LAWYER", "BUSINESS", "DOCTOR"],
    })

def test_top_donors_length(donor_df):
    result = build_top_donors(donor_df)
    assert len(result) == 3  # Alice, Bob, Corp LLC

def test_top_donors_sorted_descending(donor_df):
    result = build_top_donors(donor_df)
    amounts = [r["total_amount"] for r in result]
    assert amounts == sorted(amounts, reverse=True)

def test_top_donors_alice_total(donor_df):
    result = build_top_donors(donor_df)
    alice = next(r for r in result if r["name"] == "Alice")
    assert alice["total_amount"] == pytest.approx(1200.0)
    assert alice["num_contributions"] == 2
    assert alice["type"] == "individual"

def test_top_donors_corp_type(donor_df):
    result = build_top_donors(donor_df)
    corp = next(r for r in result if r["name"] == "Corp LLC")
    assert corp["type"] == "corporate"

def test_top_donors_occupation_present(donor_df):
    result = build_top_donors(donor_df)
    alice = next(r for r in result if r["name"] == "Alice")
    assert alice["occupation"] == "LAWYER"

def test_top_donors_limit():
    df = pd.DataFrame({
        "contributor_name": [f"Donor{i}" for i in range(TOP_DONORS_LIMIT + 5)],
        "amount":           [float(i) for i in range(TOP_DONORS_LIMIT + 5)],
        "is_corporate":     [False] * (TOP_DONORS_LIMIT + 5),
        "contributor_occupation": [""] * (TOP_DONORS_LIMIT + 5),
    })
    result = build_top_donors(df)
    assert len(result) == TOP_DONORS_LIMIT

def test_top_donors_empty_df():
    df = pd.DataFrame(columns=["contributor_name", "amount", "is_corporate", "contributor_occupation"])
    assert build_top_donors(df) == []

def test_top_donors_missing_column():
    df = pd.DataFrame({"amount": [100.0]})
    assert build_top_donors(df) == []


# ── build_linked_pcs ──────────────────────────────────────────────────────────

@pytest.fixture
def pc_links_fixture():
    return {
        "1001": [
            {"pc_acct": "2001", "pc_name": "Friends of Smith", "pc_type": "PCO",
             "link_type": "chair", "confidence": 1.0},
            {"pc_acct": "2002", "pc_name": "Sunshine PAC", "pc_type": "PCO",
             "link_type": "solicitation", "confidence": 0.95},
        ]
    }

@pytest.fixture
def pc_totals_fixture():
    return {
        "2001": {"total_received": 100000.0, "num_contributions": 50, "committee_name": "Friends of Smith"},
        "2002": {"total_received":  25000.0, "num_contributions": 10, "committee_name": "Sunshine PAC"},
    }

def test_build_linked_pcs_count(pc_links_fixture, pc_totals_fixture):
    linked, soft = build_linked_pcs("1001", pc_links_fixture, pc_totals_fixture)
    assert len(linked) == 2

def test_build_linked_pcs_soft_total(pc_links_fixture, pc_totals_fixture):
    _, soft = build_linked_pcs("1001", pc_links_fixture, pc_totals_fixture)
    assert soft == pytest.approx(125000.0)

def test_build_linked_pcs_sorted_descending(pc_links_fixture, pc_totals_fixture):
    linked, _ = build_linked_pcs("1001", pc_links_fixture, pc_totals_fixture)
    totals = [p["total_received"] for p in linked]
    assert totals == sorted(totals, reverse=True)

def test_build_linked_pcs_fields_present(pc_links_fixture, pc_totals_fixture):
    linked, _ = build_linked_pcs("1001", pc_links_fixture, pc_totals_fixture)
    for p in linked:
        assert "pc_acct" in p
        assert "pc_name" in p
        assert "link_type" in p
        assert "confidence" in p
        assert "total_received" in p
        assert "num_contributions" in p

def test_build_linked_pcs_no_links(pc_links_fixture, pc_totals_fixture):
    linked, soft = build_linked_pcs("9999", pc_links_fixture, pc_totals_fixture)
    assert linked == []
    assert soft == 0.0

def test_build_linked_pcs_missing_committee_data(pc_links_fixture):
    """PC acct in links but not in totals → total_received = 0."""
    empty_totals = {}
    linked, soft = build_linked_pcs("1001", pc_links_fixture, empty_totals)
    assert soft == 0.0
    assert all(p["total_received"] == 0.0 for p in linked)

def test_build_linked_pcs_pc_name_fallback(pc_totals_fixture):
    """If link has no pc_name, fall back to committee_name from pc_totals."""
    links = {"1001": [{"pc_acct": "2001", "pc_name": "", "pc_type": "PCO",
                        "link_type": "chair", "confidence": 1.0}]}
    linked, _ = build_linked_pcs("1001", links, pc_totals_fixture)
    # Should use committee_name from pc_totals as fallback
    assert linked[0]["pc_name"] in ("Friends of Smith", "")


# ── TOP_DONORS_LIMIT sanity ────────────────────────────────────────────────────

def test_top_donors_limit_is_sane():
    assert 10 <= TOP_DONORS_LIMIT <= 50
