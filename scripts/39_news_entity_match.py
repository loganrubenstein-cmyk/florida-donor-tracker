# scripts/39_news_entity_match.py
"""
Script 39: Match FL news clips against known entities (committees, donors, candidates).

Reads public/data/news/feed.jsonl (produced by script 38) and scans each
article title + summary for mentions of top committees, donors, and candidates.
Outputs a per-entity list of matching articles.

Matching strategy: simple normalized substring match (uppercase, strip punctuation).
This catches most cases without false-positives from fuzzy matching.

Outputs:
  public/data/news/entity_matches.json
    [{entity_type, entity_id, entity_name, entity_slug, articles: [{...}]}]

Usage (from project root, with .venv activated):
    python scripts/39_news_entity_match.py
"""

import json
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
NEWS_DIR     = PROJECT_ROOT / "public" / "data" / "news"
FEED_FILE    = NEWS_DIR / "feed.jsonl"
OUTPUT_FILE  = NEWS_DIR / "entity_matches.json"

DATA_DIR = PROJECT_ROOT / "public" / "data"

# How many entities to scan per type (avoids scanning 44K donors)
MAX_COMMITTEES = 500
MAX_DONORS     = 500
MAX_CANDIDATES = 500
MAX_LOBBYISTS  = 500
MAX_PRINCIPALS = 500

_STRIP_RE = re.compile(r"[^\w\s]")
_WS_RE    = re.compile(r"\s+")


def lobbyist_display_name(raw: str) -> str:
    """Convert 'BAILEY MARIO' → 'Mario Bailey' for readable matching."""
    parts = raw.strip().split()
    if len(parts) >= 2:
        last  = parts[0].title()
        first = " ".join(p.title().rstrip(".") for p in parts[1:])
        return f"{first} {last}"
    return raw.title()


def normalize(text: str) -> str:
    s = text.upper()
    s = _STRIP_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    return s


def load_feed() -> list[dict]:
    if not FEED_FILE.exists():
        print(f"ERROR: {FEED_FILE} not found. Run script 38 first.")
        sys.exit(1)
    articles = []
    with FEED_FILE.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    articles.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return articles


def load_committees(max_n: int) -> list[dict]:
    path = DATA_DIR / "committees" / "index.json"
    if not path.exists():
        print(f"  WARNING: {path} not found; skipping committee matching")
        return []
    data = json.loads(path.read_text())
    # Sorted by total_received desc in index.json
    results = []
    for c in data[:max_n]:
        results.append({
            "entity_type": "committee",
            "entity_id":   str(c.get("acct_num", "")),
            "entity_name": c.get("committee_name", ""),
            "entity_slug": None,
        })
    return results


def load_donors(max_n: int) -> list[dict]:
    path = DATA_DIR / "donors" / "index.json"
    if not path.exists():
        print(f"  WARNING: {path} not found; skipping donor matching")
        return []
    data = json.loads(path.read_text())
    # Sorted by total_combined desc already
    results = []
    for d in data[:max_n]:
        results.append({
            "entity_type": "donor",
            "entity_id":   d.get("slug", ""),
            "entity_name": d.get("name", ""),
            "entity_slug": d.get("slug", ""),
        })
    return results


def load_candidates(max_n: int) -> list[dict]:
    path = DATA_DIR / "candidate_stats.json"
    if not path.exists():
        print(f"  WARNING: {path} not found; skipping candidate matching")
        return []
    data = json.loads(path.read_text())
    # Sort by total_combined desc
    data.sort(key=lambda c: c.get("total_combined", 0), reverse=True)
    results = []
    for c in data[:max_n]:
        results.append({
            "entity_type": "candidate",
            "entity_id":   str(c.get("acct_num", "")),
            "entity_name": c.get("candidate_name", ""),
            "entity_slug": None,
        })
    return results


def load_lobbyists(max_n: int) -> list[dict]:
    path = DATA_DIR / "lobbyists" / "index.json"
    if not path.exists():
        print(f"  WARNING: {path} not found; skipping lobbyist matching")
        return []
    data = json.loads(path.read_text())
    data.sort(key=lambda x: x.get("num_principals", 0), reverse=True)
    return [{"entity_type": "lobbyist", "entity_id": d["slug"],
             "entity_name": lobbyist_display_name(d["name"]),
             "entity_slug": d["slug"]} for d in data[:max_n]]


def load_principals(max_n: int) -> list[dict]:
    path = DATA_DIR / "principals" / "index.json"
    if not path.exists():
        print(f"  WARNING: {path} not found; skipping principal matching")
        return []
    data = json.loads(path.read_text())
    data.sort(key=lambda x: x.get("donation_total", 0), reverse=True)
    return [{"entity_type": "principal", "entity_id": d["slug"],
             "entity_name": d["name"], "entity_slug": d["slug"]} for d in data[:max_n]]


def build_search_text(article: dict) -> str:
    """Combine title + summary into a single normalized search string."""
    parts = [article.get("title", ""), article.get("summary", "")]
    return normalize(" ".join(parts))


def main() -> int:
    print("=== Script 39: News Entity Matcher ===\n")

    articles = load_feed()
    print(f"Loaded {len(articles):,} articles from feed.jsonl")

    # Pre-normalize article texts (expensive to re-do per entity)
    normalized_texts = [build_search_text(a) for a in articles]

    # Load entity lists
    print("\nLoading entity lists ...")
    committees = load_committees(MAX_COMMITTEES)
    donors     = load_donors(MAX_DONORS)
    candidates = load_candidates(MAX_CANDIDATES)
    lobbyists  = load_lobbyists(MAX_LOBBYISTS)
    principals = load_principals(MAX_PRINCIPALS)
    entities   = committees + donors + candidates + lobbyists + principals
    print(f"  {len(committees):,} committees, {len(donors):,} donors, {len(candidates):,} candidates, "
          f"{len(lobbyists):,} lobbyists, {len(principals):,} principals")

    # Skip entities with very short names (e.g., "AT&T" alone would match too broadly)
    MIN_NAME_LEN = 6
    entities = [e for e in entities if len(e["entity_name"]) >= MIN_NAME_LEN]

    # Pre-normalize entity names
    for e in entities:
        e["name_norm"] = normalize(e["entity_name"])

    # Match
    print(f"\nMatching {len(entities):,} entities against {len(articles):,} articles ...", flush=True)

    results = []
    match_count = 0
    for entity in entities:
        needle = entity["name_norm"]
        if not needle:
            continue
        matched_articles = []
        for article, norm_text in zip(articles, normalized_texts):
            if needle in norm_text:
                matched_articles.append({
                    "title":     article.get("title", ""),
                    "url":       article.get("url", ""),
                    "outlet":    article.get("outlet", ""),
                    "published": article.get("published"),
                    "snippet":   article.get("summary", "")[:300],
                })
        if matched_articles:
            results.append({
                "entity_type": entity["entity_type"],
                "entity_id":   entity["entity_id"],
                "entity_name": entity["entity_name"],
                "entity_slug": entity.get("entity_slug"),
                "articles":    matched_articles,
            })
            match_count += len(matched_articles)

    results.sort(key=lambda r: len(r["articles"]), reverse=True)
    print(f"Found {len(results):,} entities with at least 1 article match ({match_count:,} total matches)")

    NEWS_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(f"Wrote {OUTPUT_FILE}")

    if results:
        print("\nTop 10 entities by article count:")
        for r in results[:10]:
            print(f"  {r['entity_type']:12} {r['entity_name'][:50]:50}  {len(r['articles'])} articles")

    return 0


if __name__ == "__main__":
    sys.exit(main())
