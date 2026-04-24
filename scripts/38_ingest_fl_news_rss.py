# scripts/38_ingest_fl_news_rss.py
"""
Script 38: Broad RSS ingest from Florida politics news outlets.

Fetches RSS feeds from major FL political news sources and appends new articles
to public/data/news/feed.jsonl (one JSON object per line).

Deduplication: each article gets a SHA-1 ID based on its URL. Articles already
in the file are skipped, so this script is safe to re-run as a cron job.

Output schema (one JSON per line in feed.jsonl):
  {
    "id":          "sha1 of url",
    "title":       "Article title",
    "url":         "https://...",
    "outlet":      "Florida Politics",
    "published":   "2026-04-09T10:00:00",   # ISO 8601 UTC when available
    "summary":     "First 500 chars of article summary",
    "ingested_at": "2026-04-09T11:19:00"
  }

Usage (from project root, with .venv activated):
    python scripts/38_ingest_fl_news_rss.py
"""

import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

import feedparser
import requests
import urllib3

# Suppress InsecureRequestWarning — we're fetching public RSS feeds, not
# transmitting sensitive data. macOS Python often lacks the system cert bundle.
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
NEWS_DIR     = PROJECT_ROOT / "public" / "data" / "news"
FEED_FILE    = NEWS_DIR / "feed.jsonl"

# Ordered list of FL political news RSS feeds.
# URL verified as of 2026-04-23 — if a feed 404s, it is skipped gracefully.
FEEDS = [
    ("Florida Politics",       "https://floridapolitics.com/feed/"),
    ("Florida Phoenix",        "https://floridaphoenix.com/feed/"),
    ("Tampa Bay Times",        "https://www.tampabay.com/arc/outboundfeeds/rss/?outputType=xml"),
    ("Florida Daily",          "https://www.floridadaily.com/feed/"),
    ("Florida Bulldog",        "https://www.floridabulldog.org/feed/"),
    # Politico blocks (403); Miami Herald times out; Tallahassee Democrat/
    # News Service of Florida moved; Sun Sentinel blocks (403);
    # TV station RSS feeds (WFTV, Fox13, ABC Action) all 404 or return 0 entries.
    # ("Politico Florida",    "https://..."),
    # ("Miami Herald",        "https://..."),
    # ("Tallahassee Democrat","https://..."),
]

REQUEST_DELAY = 2.0   # seconds between feed fetches (polite)


def sha1(url: str) -> str:
    return hashlib.sha1(url.encode()).hexdigest()


def parse_published(entry) -> str | None:
    """Extract ISO 8601 UTC timestamp from feedparser entry, best effort."""
    # feedparser sets published_parsed (time.struct_time in UTC) when it can parse
    if hasattr(entry, "published_parsed") and entry.published_parsed:
        try:
            dt = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
            return dt.isoformat()
        except Exception:
            pass
    # Fall back to raw published string → parse as RFC 2822
    if hasattr(entry, "published") and entry.published:
        try:
            dt = parsedate_to_datetime(entry.published)
            return dt.astimezone(timezone.utc).isoformat()
        except Exception:
            pass
    return None


def entry_summary(entry) -> str:
    """Extract a clean text summary, capped at 500 chars."""
    # feedparser provides .summary (may include HTML)
    text = getattr(entry, "summary", "") or ""
    # Strip HTML tags naively (good enough for RSS summaries)
    import re
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:500]


def load_existing_ids(path: Path) -> set[str]:
    if not path.exists():
        return set()
    ids = set()
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                ids.add(obj["id"])
            except (json.JSONDecodeError, KeyError):
                pass
    return ids


def main() -> int:
    print("=== Script 38: FL News RSS Ingest ===\n")

    NEWS_DIR.mkdir(parents=True, exist_ok=True)
    existing_ids = load_existing_ids(FEED_FILE)
    print(f"Existing articles on file: {len(existing_ids):,}")

    now_iso = datetime.now(timezone.utc).isoformat()
    new_articles = []

    for outlet, url in FEEDS:
        print(f"\nFetching {outlet} ...", flush=True)
        try:
            resp = requests.get(
                url,
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=15,
                verify=False,   # macOS cert-bundle workaround; feeds are public
            )
            resp.raise_for_status()
            feed = feedparser.parse(resp.content)
        except Exception as e:
            print(f"  ERROR fetching feed: {e}")
            time.sleep(REQUEST_DELAY)
            continue

        if not feed.entries:
            bozo_msg = str(getattr(feed, "bozo_exception", "no entries"))
            print(f"  No entries (feed may have moved): {bozo_msg}")
            time.sleep(REQUEST_DELAY)
            continue

        print(f"  {len(feed.entries)} entries in feed", end="")

        added = 0
        for entry in feed.entries:
            article_url = getattr(entry, "link", None)
            if not article_url:
                continue
            article_id = sha1(article_url)
            if article_id in existing_ids:
                continue

            title     = getattr(entry, "title", "").strip()
            published = parse_published(entry)
            summary   = entry_summary(entry)

            article = {
                "id":          article_id,
                "title":       title,
                "url":         article_url,
                "outlet":      outlet,
                "published":   published,
                "summary":     summary,
                "ingested_at": now_iso,
            }
            new_articles.append(article)
            existing_ids.add(article_id)
            added += 1

        print(f" → {added} new")
        time.sleep(REQUEST_DELAY)

    if new_articles:
        with FEED_FILE.open("a", encoding="utf-8") as f:
            for article in new_articles:
                f.write(json.dumps(article, separators=(",", ":")) + "\n")

    total_lines = sum(1 for _ in FEED_FILE.open(encoding="utf-8")) if FEED_FILE.exists() else 0
    print(f"\nAdded {len(new_articles):,} new articles. Total in feed.jsonl: {total_lines:,}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
