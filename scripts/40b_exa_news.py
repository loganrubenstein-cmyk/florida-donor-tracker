# scripts/40b_exa_news.py
"""
Script 40b: Targeted Exa news search per top FL political entity.

Supplements script 40 (Google News RSS) with Exa's news search API for better
recall on FL political figures that rarely appear in broad RSS feeds.

Requires:  EXA_API_KEY in .env.local
Install:   pip install exa-py

Output:
  public/data/news/by_entity/{key}_exa.json
    {entity_type, entity_id, entity_name, fetched_at, articles: [{...}]}

Cache: 24-hour per-entity cache in data/manifests/news_exa.json

Usage (from project root, with .venv activated):
    python scripts/40b_exa_news.py
    python scripts/40b_exa_news.py --force    # ignore cache, re-fetch all
"""

import json
import os
import re
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT   = Path(__file__).resolve().parent.parent
NEWS_BY_ENTITY = PROJECT_ROOT / "public" / "data" / "news" / "by_entity"
MANIFEST_PATH  = PROJECT_ROOT / "data" / "manifests" / "news_exa.json"
DATA_DIR       = PROJECT_ROOT / "public" / "data"

load_dotenv(PROJECT_ROOT / ".env.local")

EXA_API_KEY = os.getenv("EXA_API_KEY")

MAX_COMMITTEES = 200
MAX_DONORS     = 200
MAX_CANDIDATES = 200
MAX_LOBBYISTS  = 100
MAX_PRINCIPALS = 100
MAX_FIRMS      = 100

EXA_RESULTS    = 10
CACHE_HOURS    = 24
REQUEST_DELAY  = 0.5   # Exa is fast; be polite


def is_stale(manifest: dict, key: str) -> bool:
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


def load_top_entities() -> list[dict]:
    entities = []

    comm_path = DATA_DIR / "committees" / "index.json"
    if comm_path.exists():
        comms = json.loads(comm_path.read_text())
        for c in comms[:MAX_COMMITTEES]:
            entities.append({"key": f"committee_{c['acct_num']}", "entity_type": "committee",
                              "entity_id": str(c["acct_num"]), "entity_name": c["committee_name"],
                              "search_name": c["committee_name"]})

    donor_path = DATA_DIR / "donors" / "index.json"
    if donor_path.exists():
        donors = json.loads(donor_path.read_text())
        for d in donors[:MAX_DONORS]:
            entities.append({"key": f"donor_{d['slug']}", "entity_type": "donor",
                              "entity_id": d["slug"], "entity_name": d["name"],
                              "search_name": d["name"]})

    cand_path = DATA_DIR / "candidate_stats.json"
    if cand_path.exists():
        cands = json.loads(cand_path.read_text())
        cands.sort(key=lambda c: c.get("total_combined", 0), reverse=True)
        for c in cands[:MAX_CANDIDATES]:
            entities.append({"key": f"candidate_{c['acct_num']}", "entity_type": "candidate",
                              "entity_id": str(c["acct_num"]), "entity_name": c["candidate_name"],
                              "search_name": c["candidate_name"]})

    lob_path = DATA_DIR / "lobbyists" / "index.json"
    if lob_path.exists():
        lobbyists = json.loads(lob_path.read_text())
        lobbyists.sort(key=lambda x: x.get("num_principals", 0), reverse=True)
        for l in lobbyists[:MAX_LOBBYISTS]:
            entities.append({"key": f"lobbyist_{l['slug']}", "entity_type": "lobbyist",
                              "entity_id": l["slug"], "entity_name": l["name"],
                              "search_name": l["name"]})

    prin_path = DATA_DIR / "principals" / "index.json"
    if prin_path.exists():
        principals = json.loads(prin_path.read_text())
        principals.sort(key=lambda x: x.get("donation_total", 0), reverse=True)
        for p in principals[:MAX_PRINCIPALS]:
            entities.append({"key": f"principal_{p['slug']}", "entity_type": "principal",
                              "entity_id": p["slug"], "entity_name": p["name"],
                              "search_name": p["name"]})

    firm_path = DATA_DIR / "lobbying_firms" / "index.json"
    if firm_path.exists():
        firms = json.loads(firm_path.read_text())
        firms.sort(key=lambda x: x.get("total_comp", 0), reverse=True)
        for f in firms[:MAX_FIRMS]:
            entities.append({"key": f"firm_{f['slug']}", "entity_type": "firm",
                              "entity_id": f["slug"], "entity_name": f["firm_name"],
                              "search_name": f["firm_name"]})

    return entities


def fetch_exa(exa, name: str) -> list[dict]:
    try:
        results = exa.search_and_contents(
            f'"{name}" Florida',
            type="news",
            num_results=EXA_RESULTS,
            text={"max_characters": 300},
        )
        articles = []
        for r in results.results:
            articles.append({
                "title":     r.title or "",
                "url":       r.url or "",
                "outlet":    _extract_outlet(r.url or ""),
                "published": r.published_date or None,
                "snippet":   (r.text or "")[:300],
            })
        return articles
    except Exception as e:
        print(f"    Exa error: {e}")
        return []


def _extract_outlet(url: str) -> str:
    m = re.search(r"https?://(?:www\.)?([^/]+)", url)
    if m:
        domain = m.group(1)
        return domain.split(".")[0].title()
    return ""


def main(force: bool = False) -> int:
    print("=== Script 40b: Exa News Search per Entity ===\n")

    if not EXA_API_KEY:
        print("ERROR: EXA_API_KEY not set in .env.local — skipping.")
        return 1

    try:
        from exa_py import Exa
    except ImportError:
        print("ERROR: exa-py not installed. Run: pip install exa-py")
        return 1

    exa = Exa(api_key=EXA_API_KEY)

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

        articles = fetch_exa(exa, name)
        if articles is None:
            errors += 1
            continue

        print(f"    → {len(articles)} articles")

        out_file = NEWS_BY_ENTITY / f"{key}_exa.json"
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
    return 0


if __name__ == "__main__":
    _force = "--force" in sys.argv
    sys.exit(main(force=_force))
