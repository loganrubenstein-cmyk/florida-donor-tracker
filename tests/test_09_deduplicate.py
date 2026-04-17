# tests/test_09_deduplicate.py
import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "dedup09",
    Path(__file__).parent.parent / "scripts" / "09_deduplicate_donors.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

normalize    = _mod.normalize
is_corporate = _mod.is_corporate
UF           = _mod.UF
fuzzy_cluster = _mod.fuzzy_cluster


# ── normalize ─────────────────────────────────────────────────────────────────

def test_normalize_uppercases():
    assert normalize("teco energy, inc.") == "TECO ENERGY INC"

def test_normalize_strips_punctuation():
    assert normalize("U.S. Sugar Corp.") == "U S SUGAR CORP"

def test_normalize_collapses_whitespace():
    assert normalize("  John   Smith  ") == "JOHN SMITH"

def test_normalize_none_input():
    assert normalize(None) == ""

def test_normalize_empty_string():
    assert normalize("") == ""


# ── is_corporate ──────────────────────────────────────────────────────────────

def test_is_corporate_detects_inc():
    assert is_corporate("TECO ENERGY INC") is True

def test_is_corporate_detects_llc():
    assert is_corporate("SMITH VENTURES LLC") is True

def test_is_corporate_rejects_individual():
    assert is_corporate("JOHN SMITH") is False

def test_is_corporate_detects_fund():
    assert is_corporate("FLORIDA GROWTH FUND") is True


# ── UF (union-find) ───────────────────────────────────────────────────────────

def test_uf_single_item():
    uf = UF(["A"])
    assert uf.find("A") == "A"

def test_uf_merges():
    uf = UF(["A", "B", "C"])
    uf.union("A", "B")
    assert uf.find("A") == uf.find("B")
    assert uf.find("C") != uf.find("A")

def test_uf_clusters():
    uf = UF(["A", "B", "C"])
    uf.union("A", "B")
    clusters = uf.clusters()
    assert len(clusters) == 2
    ab = next(c for c in clusters if "A" in c)
    assert set(ab) == {"A", "B"}


# ── fuzzy_cluster ─────────────────────────────────────────────────────────────

def _stats(*names):
    """Minimal name_stats dict for fuzzy_cluster testing."""
    return {
        n: {"total": 1000.0, "count": 1, "display": n}
        for n in names
    }

def test_fuzzy_cluster_does_not_merge_different_individuals():
    stats = _stats("JOHN SMITH", "JOHN DOE")
    auto, _ = fuzzy_cluster(stats, {}, set())
    assert auto == []

def test_fuzzy_cluster_does_not_merge_long_vs_short_individual():
    stats = _stats("JOHN SMITH", "JOHN WILLIAM SMITH")
    auto, _ = fuzzy_cluster(stats, {}, set())
    assert auto == []

def test_fuzzy_cluster_merges_corporate_punctuation_variants():
    stats = _stats("TECO ENERGY INC", "TECO ENERGY INC.")
    auto, _ = fuzzy_cluster(stats, {}, set())
    assert len(auto) == 1
    assert set(auto[0]) == {"TECO ENERGY INC", "TECO ENERGY INC."}

def test_fuzzy_cluster_merges_exact_duplicate_with_trailing_period():
    stats = _stats("SMITH JOHN A", "SMITH JOHN A.")
    auto, _ = fuzzy_cluster(stats, {}, set())
    assert len(auto) == 1

def test_fuzzy_cluster_skips_pre_assigned():
    stats = _stats("TECO ENERGY INC", "TECO ENERGY INC.")
    auto, _ = fuzzy_cluster(stats, {}, {"TECO ENERGY INC"})
    # pre_assigned names are excluded from clustering
    assert auto == []
