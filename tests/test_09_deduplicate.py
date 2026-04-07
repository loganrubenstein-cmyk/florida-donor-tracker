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

clean_name       = _mod.clean_name
get_blocks       = _mod.get_blocks
UnionFind        = _mod.UnionFind
build_clusters   = _mod.build_clusters
is_corporate_name = _mod.is_corporate_name


def test_clean_name_uppercases():
    assert clean_name("teco energy, inc.") == "TECO ENERGY INC"

def test_clean_name_strips_punctuation():
    assert clean_name("U.S. Sugar Corp.") == "US SUGAR CORP"

def test_clean_name_collapses_whitespace():
    assert clean_name("  John   Smith  ") == "JOHN SMITH"

def test_get_blocks_groups_by_first_five():
    blocks = get_blocks({"TECO ENERGY INC": "TECO ENERGY INC", "TECO POWER LLC": "TECO POWER LLC", "JOHN SMITH": "JOHN SMITH"})
    assert set(blocks["TECO "]) == {"TECO ENERGY INC", "TECO POWER LLC"}
    assert blocks["JOHN "] == ["JOHN SMITH"]

def test_get_blocks_short_name_uses_full():
    blocks = get_blocks({"AB": "AB"})
    assert "AB" in blocks


# ── is_corporate_name ─────────────────────────────────────────────────────────

def test_is_corporate_name_detects_inc():
    assert is_corporate_name("TECO ENERGY INC") is True

def test_is_corporate_name_detects_llc():
    assert is_corporate_name("SMITH VENTURES LLC") is True

def test_is_corporate_name_rejects_individual():
    assert is_corporate_name("JOHN SMITH") is False


# ── build_clusters: over-merging prevention ────────────────────────────────────

def _stats(*names):
    """Build a minimal name_stats dict for build_clusters testing."""
    return {
        n: {"total": 1000.0, "count": 1, "cleaned": _mod.clean_name(n)}
        for n in names
    }

def test_build_clusters_does_not_merge_different_individuals():
    # "JOHN SMITH" and "JOHN DOE" share "JOH" in old 3-char blocking but differ enough
    stats = _stats("JOHN SMITH", "JOHN DOE")
    clusters = build_clusters(stats)
    # Should be two separate clusters
    assert len(clusters) == 2

def test_build_clusters_does_not_merge_long_vs_short_individual():
    # "JOHN SMITH" vs "JOHN WILLIAM SMITH" — one is 33% longer, length guard should block
    stats = _stats("JOHN SMITH", "JOHN WILLIAM SMITH")
    clusters = build_clusters(stats)
    assert len(clusters) == 2

def test_build_clusters_merges_corporate_punctuation_variants():
    # "TECO ENERGY INC" vs "TECO ENERGY, INC." — should merge under corporate threshold
    stats = _stats("TECO ENERGY INC", "TECO ENERGY, INC.")
    clusters = build_clusters(stats)
    assert len(clusters) == 1

def test_build_clusters_merges_exact_individual_duplicate():
    # Same person, same name with minor variation — should still merge
    stats = _stats("SMITH JOHN A", "SMITH JOHN A.")
    clusters = build_clusters(stats)
    assert len(clusters) == 1

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
