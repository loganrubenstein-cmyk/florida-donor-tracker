# tests/test_09_deduplicate.py
import importlib.util
import sys
from pathlib import Path

# Python can't import files starting with digits directly — use importlib
_spec = importlib.util.spec_from_file_location(
    "dedup09",
    Path(__file__).parent.parent / "scripts" / "09_deduplicate_donors.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

clean_name = _mod.clean_name
get_blocks = _mod.get_blocks
UnionFind = _mod.UnionFind


def test_clean_name_uppercases():
    assert clean_name("teco energy, inc.") == "TECO ENERGY INC"

def test_clean_name_strips_punctuation():
    assert clean_name("U.S. Sugar Corp.") == "US SUGAR CORP"

def test_clean_name_collapses_whitespace():
    assert clean_name("  John   Smith  ") == "JOHN SMITH"

def test_get_blocks_groups_by_first_three():
    blocks = get_blocks({"TECO ENERGY INC": "TEC", "TECO POWER LLC": "TEC", "JOHN SMITH": "JOH"})
    assert set(blocks["TEC"]) == {"TECO ENERGY INC", "TECO POWER LLC"}
    assert blocks["JOH"] == ["JOHN SMITH"]

def test_get_blocks_short_name_uses_full():
    blocks = get_blocks({"AB": "AB"})
    assert "AB" in blocks

def test_union_find_single_item():
    uf = UnionFind(["A"])
    assert uf.find("A") == "A"

def test_union_find_merges():
    uf = UnionFind(["A", "B", "C"])
    uf.union("A", "B")
    assert uf.find("A") == uf.find("B")
    assert uf.find("C") != uf.find("A")

def test_union_find_clusters():
    uf = UnionFind(["A", "B", "C"])
    uf.union("A", "B")
    clusters = uf.clusters()
    assert len(clusters) == 2
    ab_cluster = next(c for c in clusters if "A" in c)
    assert set(ab_cluster) == {"A", "B"}
