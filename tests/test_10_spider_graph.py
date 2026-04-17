# tests/test_10_spider_graph.py
import importlib.util
import json
import pandas as pd
import pytest
from pathlib import Path

# Load script 10 via importlib (filename starts with digit)
_spec = importlib.util.spec_from_file_location(
    "spider10",
    Path(__file__).parent.parent / "scripts" / "10_spider_graph.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

build_name_lookup  = _mod.build_name_lookup
make_node_id       = _mod.make_node_id
classify_node_type = _mod.classify_node_type
build_edges        = _mod.build_edges
build_nodes        = _mod.build_nodes


# ── build_name_lookup ──────────────────────────────────────────────────────

def test_build_name_lookup_basic():
    df = pd.DataFrame({
        "acct_num": ["4700", "12345"],
        "committee_name": ["Republican Party of Florida", "Friends of Ron DeSantis"],
    })
    lookup = build_name_lookup(df)
    # Keys are cleaned (upper, no punct)
    assert lookup["REPUBLICAN PARTY OF FLORIDA"] == "4700"
    assert lookup["FRIENDS OF RON DESANTIS"] == "12345"

def test_build_name_lookup_cleans_punctuation():
    df = pd.DataFrame({
        "acct_num": ["99"],
        "committee_name": ["U.S. Sugar Corp."],
    })
    lookup = build_name_lookup(df)
    assert "U S SUGAR CORP" in lookup

def test_build_name_lookup_skips_blank_acct():
    df = pd.DataFrame({
        "acct_num": ["4700", ""],
        "committee_name": ["RPOF", "Ghost"],
    })
    lookup = build_name_lookup(df)
    assert "GHOST" not in lookup


# ── make_node_id ───────────────────────────────────────────────────────────

def test_make_node_id_committee():
    assert make_node_id(acct_num="4700") == "c_4700"

def test_make_node_id_donor_slugifies():
    nid = make_node_id(canonical_name="FLORIDA POWER & LIGHT COMPANY")
    assert nid.startswith("d_")
    assert "&" not in nid
    assert " " not in nid

def test_make_node_id_acct_takes_priority():
    # If both given, acct_num wins → committee node
    assert make_node_id(acct_num="4700", canonical_name="RPOF") == "c_4700"


# ── classify_node_type ─────────────────────────────────────────────────────

def test_classify_node_type_committee():
    assert classify_node_type("RPOF", acct_num="4700") == "committee"

def test_classify_node_type_corporate():
    assert classify_node_type("TECO ENERGY INC", acct_num=None) == "corporate"

def test_classify_node_type_individual():
    assert classify_node_type("JOHN SMITH", acct_num=None) == "individual"


# ── build_edges ────────────────────────────────────────────────────────────

@pytest.fixture
def contrib_df():
    return pd.DataFrame({
        "canonical_name": ["TECO ENERGY INC", "JOHN SMITH", "TECO ENERGY INC", "US SUGAR CORP"],
        "amount":         [5000.0, 1000.0, 3000.0, 8000.0],
        "source_file":    ["Contrib_4700.txt"] * 4,
    })

def test_build_edges_top_n(contrib_df):
    name_lookup = {"US SUGAR CORP": "99999"}
    edges = build_edges(contrib_df, name_lookup, spidered_accts=["4700"], top_n=2)
    # top 2 donors to 4700: US SUGAR ($8k) and TECO ($8k combined)
    assert len(edges) == 2
    totals = {e["total_amount"] for e in edges}
    assert 8000.0 in totals

def test_build_edges_structure(contrib_df):
    edges = build_edges(contrib_df, {}, spidered_accts=["4700"], top_n=25)
    for e in edges:
        assert "source" in e
        assert "target" in e
        assert "total_amount" in e
        assert "num_contributions" in e

def test_build_edges_committee_donor_uses_c_prefix(contrib_df):
    name_lookup = {"US SUGAR CORP": "99999"}
    edges = build_edges(contrib_df, name_lookup, spidered_accts=["4700"], top_n=25)
    sugar_edge = next(e for e in edges if "99999" in e["source"])
    assert sugar_edge["source"] == "c_99999"
    assert sugar_edge["target"] == "c_4700"


# ── build_nodes ────────────────────────────────────────────────────────────

def test_build_nodes_includes_spidered_committee(contrib_df):
    committees_df = pd.DataFrame({
        "acct_num": ["4700"],
        "committee_name": ["Republican Party of Florida"],
    })
    name_lookup = {}
    nodes = build_nodes(contrib_df, name_lookup, committees_df,
                        spidered_accts=["4700"], pending_accts=set(),
                        depth_map={"4700": 0})
    ids = [n["id"] for n in nodes]
    assert "c_4700" in ids

def test_build_nodes_data_pending_flag(contrib_df):
    committees_df = pd.DataFrame({
        "acct_num": ["4700", "99999"],
        "committee_name": ["RPOF", "US Sugar PAC"],
    })
    name_lookup = {"US SUGAR CORP": "99999"}
    nodes = build_nodes(contrib_df, name_lookup, committees_df,
                        spidered_accts=["4700"], pending_accts={"99999"},
                        depth_map={"4700": 0, "99999": 1})
    sugar_node = next(n for n in nodes if n["id"] == "c_99999")
    assert sugar_node["data_pending"] is True

def test_build_nodes_committee_has_depth(contrib_df):
    committees_df = pd.DataFrame({
        "acct_num": ["4700"],
        "committee_name": ["RPOF"],
    })
    nodes = build_nodes(contrib_df, {}, committees_df,
                        spidered_accts=["4700"], pending_accts=set(),
                        depth_map={"4700": 0})
    rpof = next(n for n in nodes if n["id"] == "c_4700")
    assert rpof["depth"] == 0
