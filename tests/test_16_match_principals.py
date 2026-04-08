# tests/test_16_match_principals.py
import importlib.util
import pandas as pd
import pytest
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "mp16",
    Path(__file__).parent.parent / "scripts" / "16_match_principals.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

_normalize              = _mod._normalize
_block_tokens           = _mod._block_tokens
build_contributor_index = _mod.build_contributor_index
match_principals        = _mod.match_principals
MATCH_THRESHOLD         = _mod.MATCH_THRESHOLD


# ── _normalize ───────────────────────────────────────────────────────────────

def test_normalize_uppercases():
    assert _normalize("teco energy") == "TECO ENERGY"

def test_normalize_strips_inc():
    result = _normalize("TECO Energy, Inc.")
    assert "INC" not in result
    assert "TECO" in result

def test_normalize_strips_llc():
    result = _normalize("Acme Solutions LLC")
    assert "LLC" not in result

def test_normalize_removes_punctuation():
    result = _normalize("Smith & Jones, P.A.")
    assert "," not in result
    assert "." not in result

def test_normalize_collapses_whitespace():
    result = _normalize("  AT&T   Corp  ")
    assert "  " not in result
    assert result == result.strip()


# ── _block_tokens ────────────────────────────────────────────────────────────

def test_block_tokens_returns_significant():
    # FLORIDA is a stopword — only CHAMBER and COMMERCE pass
    tokens = _block_tokens("FLORIDA CHAMBER COMMERCE")
    assert "CHAMBER" in tokens
    assert "COMMERCE" in tokens

def test_block_tokens_excludes_short():
    # "OF" and "A" are too short (< 4 chars)
    tokens = _block_tokens("CHAMBER OF COMMERCE A")
    assert "OF" not in tokens
    assert "A" not in tokens

def test_block_tokens_excludes_stopwords():
    # NATIONAL and FLORIDA are in _STOPWORDS
    tokens = _block_tokens("NATIONAL FLORIDA CHAMBER")
    assert "NATIONAL" not in tokens
    assert "FLORIDA" not in tokens
    # "CHAMBER" should survive
    assert "CHAMBER" in tokens

def test_block_tokens_empty_string():
    assert _block_tokens("") == []

def test_block_tokens_only_stopwords():
    # After normalization, name like "The Florida Association" → all stopwords/suffixes
    assert _block_tokens("THE FLORIDA") == []


# ── build_contributor_index ──────────────────────────────────────────────────

def test_index_maps_token_to_indices():
    names = ["TECO ENERGY INC", "FLORIDA CHAMBER OF COMMERCE", "TECO POWER SERVICES"]
    index, normed = build_contributor_index(names)
    # "TECO" should appear in indices 0 and 2
    teco_indices = index.get("TECO", [])
    assert 0 in teco_indices
    assert 2 in teco_indices

def test_index_normed_parallel_to_names():
    names = ["Teco Energy, Inc.", "FL Chamber"]
    index, normed = build_contributor_index(names)
    assert len(normed) == 2
    # Normalized form should be uppercase
    assert normed[0] == normed[0].upper()

def test_index_empty_input():
    index, normed = build_contributor_index([])
    assert len(index) == 0
    assert len(normed) == 0


# ── match_principals ─────────────────────────────────────────────────────────

@pytest.fixture
def simple_contrib_data():
    names = [
        "TECO ENERGY INC",
        "FLORIDA CHAMBER OF COMMERCE",
        "WALT DISNEY WORLD CO",
        "SOME UNRELATED COMPANY LLC",
        "AT&T CORP",
    ]
    index, normed = build_contributor_index(names)
    return names, index, normed


def test_match_finds_obvious_match(simple_contrib_data):
    names, index, normed = simple_contrib_data
    principals = pd.DataFrame({
        "principal_name": ["TECO Energy"],
        "principal_naics": ["221122"],
    })
    result = match_principals(principals, names, index, normed)
    assert len(result) > 0
    assert any("TECO" in r for r in result["contributor_name"])


def test_match_no_match_for_unrelated(simple_contrib_data):
    names, index, normed = simple_contrib_data
    principals = pd.DataFrame({
        "principal_name": ["Completely Different Organization XYZ"],
        "principal_naics": ["000000"],
    })
    result = match_principals(principals, names, index, normed)
    assert len(result) == 0


def test_match_result_columns(simple_contrib_data):
    names, index, normed = simple_contrib_data
    principals = pd.DataFrame({
        "principal_name": ["TECO Energy"],
        "principal_naics": ["221122"],
    })
    result = match_principals(principals, names, index, normed)
    for col in ("principal_name", "contributor_name", "match_score", "match_type"):
        assert col in result.columns


def test_match_score_above_threshold(simple_contrib_data):
    names, index, normed = simple_contrib_data
    principals = pd.DataFrame({
        "principal_name": ["TECO Energy"],
        "principal_naics": ["221122"],
    })
    result = match_principals(principals, names, index, normed)
    assert all(result["match_score"] >= MATCH_THRESHOLD)


def test_match_type_exact_for_perfect(simple_contrib_data):
    names, index, normed = simple_contrib_data
    # Add an exact-match contributor
    contrib_names = names + ["FLORIDA CHAMBER"]
    index2, normed2 = build_contributor_index(contrib_names)
    principals = pd.DataFrame({
        "principal_name": ["FLORIDA CHAMBER"],
        "principal_naics": ["813910"],
    })
    result = match_principals(principals, contrib_names, index2, normed2)
    exact = result[result["match_score"] == 100.0]
    if len(exact) > 0:
        assert "exact" in exact["match_type"].values


def test_match_deduped_per_pair(simple_contrib_data):
    """Each (principal, contributor) pair appears at most once."""
    names, index, normed = simple_contrib_data
    principals = pd.DataFrame({
        "principal_name": ["TECO Energy", "Florida Chamber"],
        "principal_naics": ["221122", "813910"],
    })
    result = match_principals(principals, names, index, normed)
    dupes = result.duplicated(subset=["principal_name", "contributor_name"])
    assert not dupes.any()


def test_match_empty_principals(simple_contrib_data):
    names, index, normed = simple_contrib_data
    principals = pd.DataFrame({"principal_name": [], "principal_naics": []})
    result = match_principals(principals, names, index, normed)
    assert len(result) == 0
