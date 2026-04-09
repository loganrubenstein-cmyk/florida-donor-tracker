# tests/test_13_entity_connections.py
import importlib.util
import json
import pandas as pd
import pytest
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "ec13",
    Path(__file__).parent.parent / "scripts" / "13_detect_entity_connections.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

find_candidate_pairs     = _mod.find_candidate_pairs
donor_overlap_pct        = _mod.donor_overlap_pct
score_pair               = _mod.score_pair
build_transfer_lookup    = _mod.build_transfer_lookup
write_per_committee_files = _mod.write_per_committee_files

W_TREASURER = _mod.W_TREASURER
W_ADDRESS   = _mod.W_ADDRESS
W_PHONE     = _mod.W_PHONE
W_CHAIR     = _mod.W_CHAIR
W_MONEY_BTWN = _mod.W_MONEY_BTWN


# ── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def committees_shared_treasurer():
    """Two committees with the same treasurer."""
    return pd.DataFrame({
        "acct_num":         ["AAA", "BBB", "CCC"],
        "committee_name":   ["Alpha PAC", "Beta PAC", "Gamma PAC"],
        "type_code":        ["PAC", "PAC", "ECO"],
        "treasurer_last":   ["Smith",  "Smith",  "Jones"],
        "treasurer_first":  ["John",   "John",   "Mary"],
        "treasurer_middle": ["",       "",       ""],
        "chair_last":       ["Lee",    "Lee",    "Park"],
        "chair_first":      ["Alice",  "Alice",  "Bob"],
        "chair_middle":     ["",       "",       ""],
        "addr1":            ["100 Main St", "100 Main St", "200 Oak Ave"],
        "city":             ["Tampa",       "Tampa",       "Miami"],
        "phone":            ["8135551234",  "8135551234",  "3055559876"],
    })


@pytest.fixture
def committees_no_shared():
    """Three committees that share nothing."""
    return pd.DataFrame({
        "acct_num":         ["X1", "X2", "X3"],
        "committee_name":   ["Alpha", "Beta", "Gamma"],
        "type_code":        ["PAC", "PAC", "PAC"],
        "treasurer_last":   ["Adams",   "Baker",   "Clark"],
        "treasurer_first":  ["Tom",     "Sue",     "Raj"],
        "treasurer_middle": ["",        "",        ""],
        "chair_last":       ["Davis",   "Evans",   "Ford"],
        "chair_first":      ["Eve",     "Sam",     "Pat"],
        "chair_middle":     ["",        "",        ""],
        "addr1":            ["1 A St",  "2 B Ave", "3 C Rd"],
        "city":             ["Miami",   "Tampa",   "Orlando"],
        "phone":            ["3051111", "8132222", "4073333"],
    })


# ── find_candidate_pairs ────────────────────────────────────────────────────

def test_finds_pair_with_shared_treasurer(committees_shared_treasurer):
    pairs = find_candidate_pairs(committees_shared_treasurer)
    # AAA and BBB share treasurer, chair, address, phone
    assert ("AAA", "BBB") in pairs

def test_shared_fields_contains_treasurer(committees_shared_treasurer):
    pairs = find_candidate_pairs(committees_shared_treasurer)
    assert "treasurer" in pairs[("AAA", "BBB")]

def test_shared_fields_contains_address(committees_shared_treasurer):
    pairs = find_candidate_pairs(committees_shared_treasurer)
    assert "address" in pairs[("AAA", "BBB")]

def test_shared_fields_contains_phone(committees_shared_treasurer):
    pairs = find_candidate_pairs(committees_shared_treasurer)
    assert "phone" in pairs[("AAA", "BBB")]

def test_no_pairs_when_nothing_shared(committees_no_shared):
    pairs = find_candidate_pairs(committees_no_shared)
    assert len(pairs) == 0

def test_canonical_ordering_acct_a_lt_b(committees_shared_treasurer):
    pairs = find_candidate_pairs(committees_shared_treasurer)
    for a, b in pairs:
        assert a < b


# ── donor_overlap_pct ───────────────────────────────────────────────────────

def test_donor_overlap_identical_sets():
    s = {"TECO INC", "US SUGAR", "JOHN SMITH"}
    assert donor_overlap_pct(s, s) == 100.0

def test_donor_overlap_no_overlap():
    assert donor_overlap_pct({"A", "B"}, {"C", "D"}) == 0.0

def test_donor_overlap_partial():
    a = {"A", "B", "C"}
    b = {"B", "C", "D"}
    # intersection=2, union=4 → 50%
    assert donor_overlap_pct(a, b) == 50.0

def test_donor_overlap_empty_sets():
    assert donor_overlap_pct(set(), {"A"}) == 0.0
    assert donor_overlap_pct(set(), set()) == 0.0


# ── score_pair ──────────────────────────────────────────────────────────────

def test_score_shared_treasurer_only():
    score = score_pair({"treasurer"}, overlap_pct=0.0, money_between=0.0)
    assert score == W_TREASURER

def test_score_shared_address_only():
    score = score_pair({"address"}, overlap_pct=0.0, money_between=0.0)
    assert score == W_ADDRESS

def test_score_shared_phone_only():
    score = score_pair({"phone"}, overlap_pct=0.0, money_between=0.0)
    assert score == W_PHONE

def test_score_money_between_adds_points():
    base = score_pair(set(), overlap_pct=0.0, money_between=0.0)
    with_money = score_pair(set(), overlap_pct=0.0, money_between=50000.0)
    assert with_money == base + W_MONEY_BTWN

def test_score_full_overlap_adds_max_donor_points():
    no_overlap = score_pair(set(), overlap_pct=0.0, money_between=0.0)
    full_overlap = score_pair(set(), overlap_pct=100.0, money_between=0.0)
    assert full_overlap == no_overlap + _mod.W_DONOR_OVL

def test_score_overlap_below_50_is_partial():
    # 25% overlap → 25/50 * W_DONOR_OVL = 0.5 * 15 = 7 (int)
    score = score_pair(set(), overlap_pct=25.0, money_between=0.0)
    assert score == int(_mod.W_DONOR_OVL * 0.5)

def test_score_all_signals():
    score = score_pair(
        {"treasurer", "address", "phone", "chair"},
        overlap_pct=100.0,
        money_between=1.0,
    )
    expected = W_TREASURER + W_ADDRESS + W_PHONE + W_CHAIR + _mod.W_DONOR_OVL + W_MONEY_BTWN
    assert score == expected


# ── build_transfer_lookup ───────────────────────────────────────────────────

def test_transfer_lookup_basic():
    committees_df = pd.DataFrame({
        "acct_num":       ["AAA", "BBB"],
        "committee_name": ["Alpha PAC", "Beta PAC"],
    })
    transfers_df = pd.DataFrame({
        "transferor_name": ["Alpha PAC"],
        "transferee_name": ["Beta PAC"],
        "amount":          [75000.0],
    })
    lookup = build_transfer_lookup(transfers_df, committees_df)
    assert ("AAA", "BBB") in lookup
    assert lookup[("AAA", "BBB")] == 75000.0

def test_transfer_lookup_canonical_order():
    committees_df = pd.DataFrame({
        "acct_num":       ["AAA", "BBB"],
        "committee_name": ["Alpha PAC", "Beta PAC"],
    })
    # Transfer in reverse direction: BBB → AAA
    transfers_df = pd.DataFrame({
        "transferor_name": ["Beta PAC"],
        "transferee_name": ["Alpha PAC"],
        "amount":          [10000.0],
    })
    lookup = build_transfer_lookup(transfers_df, committees_df)
    # Key should still be (AAA, BBB) — lower acct first
    assert ("AAA", "BBB") in lookup

def test_transfer_lookup_none_returns_empty():
    lookup = build_transfer_lookup(None, pd.DataFrame())
    assert lookup == {}


# ── write_per_committee_files ───────────────────────────────────────────────

def test_write_per_committee_files(tmp_path, monkeypatch):
    monkeypatch.setattr(_mod, "COMMITTEES_DIR", tmp_path)

    connections = [
        {
            "entity_a": {"acct_num": "AAA", "name": "Alpha PAC", "type_code": "PAC"},
            "entity_b": {"acct_num": "BBB", "name": "Beta PAC",  "type_code": "PAC"},
            "connection_score": 75,
            "shared_treasurer": True,
            "shared_address":   True,
            "shared_phone":     True,
            "shared_chair":     True,
            "donor_overlap_pct": 0.0,
            "money_between":    0.0,
        }
    ]
    count = write_per_committee_files(connections)
    assert count == 2  # one file per committee in the pair
    assert (tmp_path / "AAA.connections.json").exists()
    assert (tmp_path / "BBB.connections.json").exists()

def test_per_committee_file_schema(tmp_path, monkeypatch):
    monkeypatch.setattr(_mod, "COMMITTEES_DIR", tmp_path)

    connections = [
        {
            "entity_a": {"acct_num": "AAA", "name": "Alpha PAC", "type_code": "PAC"},
            "entity_b": {"acct_num": "BBB", "name": "Beta PAC",  "type_code": "PAC"},
            "connection_score": 60,
            "shared_treasurer": True,
            "shared_address":   False,
            "shared_phone":     False,
            "shared_chair":     False,
            "donor_overlap_pct": 0.0,
            "money_between":    0.0,
        }
    ]
    write_per_committee_files(connections)

    data = json.loads((tmp_path / "AAA.connections.json").read_text())
    assert data["acct_num"] == "AAA"
    assert data["total_connections"] == 1
    conn = data["connections"][0]
    # The counterpart from AAA's perspective is BBB
    assert conn["acct_num"] == "BBB"
    assert conn["connection_score"] == 60
    assert conn["shared_treasurer"] is True

def test_per_committee_sorted_by_score(tmp_path, monkeypatch):
    monkeypatch.setattr(_mod, "COMMITTEES_DIR", tmp_path)

    connections = [
        {
            "entity_a": {"acct_num": "AAA", "name": "Alpha", "type_code": "PAC"},
            "entity_b": {"acct_num": "CCC", "name": "Gamma", "type_code": "PAC"},
            "connection_score": 30,
            "shared_treasurer": True, "shared_address": False,
            "shared_phone": False, "shared_chair": False,
            "donor_overlap_pct": 0.0, "money_between": 0.0,
        },
        {
            "entity_a": {"acct_num": "AAA", "name": "Alpha", "type_code": "PAC"},
            "entity_b": {"acct_num": "BBB", "name": "Beta",  "type_code": "PAC"},
            "connection_score": 75,
            "shared_treasurer": True, "shared_address": True,
            "shared_phone": True, "shared_chair": True,
            "donor_overlap_pct": 0.0, "money_between": 0.0,
        },
    ]
    write_per_committee_files(connections)

    data = json.loads((tmp_path / "AAA.connections.json").read_text())
    scores = [c["connection_score"] for c in data["connections"]]
    assert scores == sorted(scores, reverse=True)
