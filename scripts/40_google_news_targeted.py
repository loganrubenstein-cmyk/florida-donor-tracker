# scripts/40_google_news_targeted.py
"""
Script 40: Targeted Google News RSS search per top FL political entity.

Queries Google News RSS for the top 50 committees, top 50 donors, and top 25
candidates by fundraising total. Produces a per-entity JSON file of recent
news articles.

Google News RSS pattern (no API key required):
  https://news.google.com/rss/search?q={query}+Florida&hl=en-US&gl=US&ceid=US:en

Cache: each entity is cached in data/manifests/news_targeted.json with a
timestamp. Entities last fetched within 24 hours are skipped on re-run.

Outputs:
  public/data/news/by_entity/{entity_type}_{acct_or_slug}.json
    {entity_type, entity_id, entity_name, fetched_at, articles: [{...}]}
  data/manifests/news_targeted.json   (cache timestamps)

Usage (from project root, with .venv activated):
    python scripts/40_google_news_targeted.py              # normal run
    python scripts/40_google_news_targeted.py --force      # ignore cache, re-fetch all
"""

import json
import re
import sys
import time
import urllib.parse
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
from pathlib import Path

import feedparser
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

PROJECT_ROOT   = Path(__file__).resolve().parent.parent
NEWS_BY_ENTITY = PROJECT_ROOT / "public" / "data" / "news" / "by_entity"
MANIFEST_PATH  = PROJECT_ROOT / "data" / "manifests" / "news_targeted.json"
DATA_DIR       = PROJECT_ROOT / "public" / "data"

GOOGLE_NEWS_RSS = "https://news.google.com/rss/search"

MAX_COMMITTEES = 200
MAX_DONORS     = 200
MAX_CANDIDATES = 200
MAX_LOBBYISTS  = 100
MAX_PRINCIPALS = 100
MAX_FIRMS      = 100
REQUEST_DELAY  = 2.5    # seconds between Google News requests
CACHE_HOURS    = 24     # skip entities fetched within this many hours


def parse_published(entry) -> str | None:
    if hasattr(entry, "published_parsed") and entry.published_parsed:
        try:
            dt = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
            return dt.isoformat()
        except Exception:
            pass
    if hasattr(entry, "published") and entry.published:
        try:
            dt = parsedate_to_datetime(entry.published)
            return dt.astimezone(timezone.utc).isoformat()
        except Exception:
            pass
    return None


def fetch_google_news(name: str, extra: str = "Florida") -> list[dict]:
    """Fetch Google News RSS for a named entity. Returns list of article dicts."""
    query = urllib.parse.quote(f'"{name}" {extra}')
    url   = f"{GOOGLE_NEWS_RSS}?q={query}&hl=en-US&gl=US&ceid=US:en"
    try:
        resp = requests.get(
            url,
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=15,
            verify=False,
        )
        resp.raise_for_status()
    except Exception as e:
        print(f"    HTTP error: {e}")
        return []

    feed = feedparser.parse(resp.content)
    articles = []
    for entry in feed.entries:
        article_url = getattr(entry, "link", None)
        if not article_url:
            continue
        articles.append({
            "title":     getattr(entry, "title", "").strip(),
            "url":       article_url,
            "outlet":    getattr(entry, "source", {}).get("title", "") if hasattr(entry, "source") else "",
            "published": parse_published(entry),
            "snippet":   getattr(entry, "summary", "")[:300],
        })
    return articles


def load_manifest() -> dict:
    if MANIFEST_PATH.exists():
        try:
            return json.loads(MANIFEST_PATH.read_text())
        except Exception:
            pass
    return {}


def save_manifest(manifest: dict) -> None:
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2))


def is_stale(manifest: dict, key: str) -> bool:
    """Return True if entity has not been fetched within CACHE_HOURS."""
    ts = manifest.get(key, {}).get("fetched_at")
    if not ts:
        return True
    try:
        last = datetime.fromisoformat(ts)
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) - last > timedelta(hours=CACHE_HOURS)
    except Exception:
        return True


def slugify_simple(name: str) -> str:
    s = re.sub(r"[^\w\s-]", "", name.lower())
    s = re.sub(r"[\s_]+", "-", s).strip("-")
    return s[:80]


def load_top_entities() -> list[dict]:
    entities = []

    # Top committees
    comm_path = DATA_DIR / "committees" / "index.json"
    if comm_path.exists():
        comms = json.loads(comm_path.read_text())
        for c in comms[:MAX_COMMITTEES]:
            entities.append({
                "key":         f"committee_{c['acct_num']}",
                "entity_type": "committee",
                "entity_id":   str(c["acct_num"]),
                "entity_name": c["committee_name"],
                "search_name": c["committee_name"],
            })

    # Top donors
    donor_path = DATA_DIR / "donors" / "index.json"
    if donor_path.exists():
        donors = json.loads(donor_path.read_text())
        # index.json is sorted by total_combined desc
        for d in donors[:MAX_DONORS]:
            entities.append({
                "key":         f"donor_{d['slug']}",
                "entity_type": "donor",
                "entity_id":   d["slug"],
                "entity_name": d["name"],
                "search_name": d["name"],
            })

    # Top candidates
    cand_path = DATA_DIR / "candidate_stats.json"
    if cand_path.exists():
        cands = json.loads(cand_path.read_text())
        cands.sort(key=lambda c: c.get("total_combined", 0), reverse=True)
        for c in cands[:MAX_CANDIDATES]:
            entities.append({
                "key":         f"candidate_{c['acct_num']}",
                "entity_type": "candidate",
                "entity_id":   str(c["acct_num"]),
                "entity_name": c["candidate_name"],
                "search_name": c["candidate_name"],
            })

    # Top lobbyists (by num_principals)
    lob_path = DATA_DIR / "lobbyists" / "index.json"
    if lob_path.exists():
        lobbyists = json.loads(lob_path.read_text())
        lobbyists.sort(key=lambda x: x.get("num_principals", 0), reverse=True)
        for l in lobbyists[:MAX_LOBBYISTS]:
            entities.append({
                "key":         f"lobbyist_{l['slug']}",
                "entity_type": "lobbyist",
                "entity_id":   l["slug"],
                "entity_name": l["name"],
                "search_name": l["name"],
            })

    # Top principals (by donation_total)
    prin_path = DATA_DIR / "principals" / "index.json"
    if prin_path.exists():
        principals = json.loads(prin_path.read_text())
        principals.sort(key=lambda x: x.get("donation_total", 0), reverse=True)
        for p in principals[:MAX_PRINCIPALS]:
            entities.append({
                "key":         f"principal_{p['slug']}",
                "entity_type": "principal",
                "entity_id":   p["slug"],
                "entity_name": p["name"],
                "search_name": p["name"],
            })

    # Top lobbying firms (by total_comp)
    firm_path = DATA_DIR / "lobbying_firms" / "index.json"
    if firm_path.exists():
        firms = json.loads(firm_path.read_text())
        firms.sort(key=lambda x: x.get("total_comp", 0), reverse=True)
        for f in firms[:MAX_FIRMS]:
            entities.append({
                "key":         f"firm_{f['slug']}",
                "entity_type": "firm",
                "entity_id":   f["slug"],
                "entity_name": f["firm_name"],
                "search_name": f["firm_name"],
            })

    return entities


def main(force: bool = False) -> int:
    print("=== Script 40: Targeted Google News per Entity ===\n")

    entities = load_top_entities()
    print(f"Entities to query: {len(entities):,}")

    manifest = load_manifest()
    NEWS_BY_ENTITY.mkdir(parents=True, exist_ok=True)

    now_iso  = datetime.now(timezone.utc).isoformat()
    fetched  = skipped = errors = 0

    for i, entity in enumerate(entities, 1):
        key  = entity["key"]
        name = entity["search_name"]

        if not force and not is_stale(manifest, key):
            skipped += 1
            continue

        print(f"[{i}/{len(entities)}] {entity['entity_type']:12} {name[:55]}", flush=True)

        articles = fetch_google_news(name)
        print(f"    → {len(articles)} articles")

        out_file = NEWS_BY_ENTITY / f"{key}.json"
        payload  = {
            "entity_type": entity["entity_type"],
            "entity_id":   entity["entity_id"],
            "entity_name": entity["entity_name"],
            "fetched_at":  now_iso,
            "articles":    articles,
        }
        out_file.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False))

        manifest[key] = {"fetched_at": now_iso, "num_articles": len(articles)}
        save_manifest(manifest)

        fetched += 1
        time.sleep(REQUEST_DELAY)

    print(f"\nDone. fetched={fetched}, skipped={skipped}, errors={errors}")
    total_files = len(list(NEWS_BY_ENTITY.glob("*.json")))
    print(f"Total entity files in by_entity/: {total_files}")
    return 0


if __name__ == "__main__":
    _force = "--force" in sys.argv
    sys.exit(main(force=_force))
