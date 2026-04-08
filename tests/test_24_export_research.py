# tests/test_24_export_research.py
import importlib.util
import json
from pathlib import Path
import pytest

_spec = importlib.util.spec_from_file_location(
    "exp24",
    Path(__file__).parent.parent / "scripts" / "24_export_research.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

build_public_entry = _mod.build_public_entry
load_entity        = _mod.load_entity


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def entity_approved():
    return {
        "id": "d_TECO_ENERGY",
        "canonical_name": "TECO ENERGY, INC.",
        "type": "donor",
        "industry": "energy",
        "themes": ["utility-money"],
        "approved_for_public": True,
        "summary": "Major Florida utility donor.",
        "key_facts": [
            {"fact": "Gave $10M to RPOF", "source": "FL Elections", "url": "https://example.com", "date": "2024-01-01"},
        ],
        "articles": [
            {"title": "TECO Gives Big", "url": "https://example.com/article", "outlet": "Tampa Bay Times", "date": "2024-01-15", "approved_for_public": True, "summary": "Article summary."},
            {"title": "Unapproved Article", "url": "https://example.com/nope", "outlet": "Some Outlet", "date": "2024-02-01", "approved_for_public": False, "summary": "Should not appear."},
        ],
    }

@pytest.fixture
def entity_not_approved_with_articles():
    return {
        "id": "d_PUBLIX",
        "canonical_name": "PUBLIX SUPER MARKETS",
        "type": "donor",
        "industry": "retail",
        "themes": ["corporate-influence"],
        "approved_for_public": False,
        "summary": "Not approved — should not appear.",
        "articles": [
            {"title": "Publix Political Giving", "url": "https://example.com/publix", "outlet": "Herald", "date": "2023-06-01", "approved_for_public": True, "summary": "Private summary."},
        ],
    }

@pytest.fixture
def entity_fully_unapproved():
    return {
        "id": "d_NOBODY",
        "canonical_name": "NOBODY CORP",
        "type": "donor",
        "industry": "finance",
        "themes": [],
        "approved_for_public": False,
        "articles": [
            {"title": "Hidden", "url": "https://example.com/hidden", "outlet": "Paper", "date": "2024-01-01", "approved_for_public": False},
        ],
    }


# ── build_public_entry — approved entity ─────────────────────────────────────

def test_approved_entity_returns_dict(entity_approved):
    result = build_public_entry(entity_approved)
    assert isinstance(result, dict)

def test_approved_entity_includes_id(entity_approved):
    result = build_public_entry(entity_approved)
    assert result["id"] == "d_TECO_ENERGY"

def test_approved_entity_includes_summary(entity_approved):
    result = build_public_entry(entity_approved)
    assert result["summary"] == "Major Florida utility donor."

def test_approved_entity_includes_key_facts(entity_approved):
    result = build_public_entry(entity_approved)
    assert "key_facts" in result
    assert len(result["key_facts"]) == 1
    assert result["key_facts"][0]["fact"] == "Gave $10M to RPOF"

def test_approved_entity_key_facts_schema(entity_approved):
    result = build_public_entry(entity_approved)
    for kf in result["key_facts"]:
        assert set(kf.keys()) == {"fact", "source", "url", "date"}

def test_approved_entity_includes_only_approved_articles(entity_approved):
    result = build_public_entry(entity_approved)
    assert len(result["articles"]) == 1
    assert result["articles"][0]["title"] == "TECO Gives Big"

def test_approved_entity_article_has_summary(entity_approved):
    result = build_public_entry(entity_approved)
    # Entity is approved, so article summaries are included
    assert result["articles"][0]["summary"] == "Article summary."

def test_approved_entity_includes_themes(entity_approved):
    result = build_public_entry(entity_approved)
    assert "themes" in result
    assert "utility-money" in result["themes"]

def test_approved_entity_includes_industry(entity_approved):
    result = build_public_entry(entity_approved)
    assert result["industry"] == "energy"

def test_approved_entity_articles_exclude_no_url(entity_approved):
    entity_approved["articles"].append({
        "title": "No URL article", "url": "", "outlet": "X",
        "date": "2024-01-01", "approved_for_public": True,
    })
    result = build_public_entry(entity_approved)
    titles = [a["title"] for a in result["articles"]]
    assert "No URL article" not in titles


# ── build_public_entry — entity not approved but has approved articles ────────

def test_articles_only_entity_returns_dict(entity_not_approved_with_articles):
    result = build_public_entry(entity_not_approved_with_articles)
    assert isinstance(result, dict)

def test_articles_only_entity_has_no_summary(entity_not_approved_with_articles):
    result = build_public_entry(entity_not_approved_with_articles)
    assert "summary" not in result

def test_articles_only_entity_has_no_key_facts(entity_not_approved_with_articles):
    result = build_public_entry(entity_not_approved_with_articles)
    assert "key_facts" not in result

def test_articles_only_entity_article_summary_empty(entity_not_approved_with_articles):
    # Summary is blanked when entity is not approved
    result = build_public_entry(entity_not_approved_with_articles)
    assert result["articles"][0]["summary"] == ""

def test_articles_only_entity_has_article_title(entity_not_approved_with_articles):
    result = build_public_entry(entity_not_approved_with_articles)
    assert result["articles"][0]["title"] == "Publix Political Giving"

def test_articles_only_entity_article_url_present(entity_not_approved_with_articles):
    result = build_public_entry(entity_not_approved_with_articles)
    assert result["articles"][0]["url"] == "https://example.com/publix"


# ── build_public_entry — fully unapproved entity ─────────────────────────────

def test_fully_unapproved_returns_none(entity_fully_unapproved):
    result = build_public_entry(entity_fully_unapproved)
    assert result is None

def test_entity_with_no_articles_unapproved_returns_none():
    entity = {
        "id": "d_EMPTY", "canonical_name": "Empty Corp",
        "type": "donor", "industry": "finance", "themes": [],
        "approved_for_public": False,
        "articles": [],
    }
    assert build_public_entry(entity) is None


# ── load_entity ────────────────────────────────────────────────────────────────

def test_load_entity_returns_dict(tmp_path):
    data = {"id": "test", "canonical_name": "Test"}
    p = tmp_path / "test.json"
    p.write_text(json.dumps(data), encoding="utf-8")
    result = load_entity(p)
    assert result == data

def test_load_entity_returns_none_on_bad_file(tmp_path):
    p = tmp_path / "bad.json"
    p.write_text("not valid json", encoding="utf-8")
    result = load_entity(p)
    assert result is None

def test_load_entity_returns_none_on_missing_file(tmp_path):
    result = load_entity(tmp_path / "nonexistent.json")
    assert result is None
