"""
Script 65: Load news data into Supabase.

Creates and populates:
  news_articles       — 177 RSS articles from FL outlets (feed.jsonl)
  news_entity_articles — per-entity targeted Google News articles (by_entity/*.json
                          + entity_matches.json)

Entity lookup keys:
  entity_type = 'candidate' | 'committee' → entity_acct_num
  entity_type = 'donor'                   → entity_slug

Usage:
    python scripts/65_load_news_supabase.py
"""

import json
import os
import sys
from io import StringIO
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set in .env.local")

DATA_DIR = Path(__file__).resolve().parent.parent / "public" / "data" / "news"

DDL = """
CREATE TABLE IF NOT EXISTS news_articles (
  id           text primary key,
  title        text,
  url          text,
  outlet       text,
  published    timestamptz,
  summary      text,
  ingested_at  timestamptz
);

CREATE TABLE IF NOT EXISTS news_entity_articles (
  id               bigint generated always as identity primary key,
  entity_type      text,
  entity_acct_num  text,
  entity_slug      text,
  entity_name      text,
  article_title    text,
  article_url      text,
  article_outlet   text,
  article_published text,
  article_snippet  text,
  source           text   -- 'rss_match' or 'google_news'
);

CREATE INDEX IF NOT EXISTS idx_news_entity_acct ON news_entity_articles(entity_acct_num);
CREATE INDEX IF NOT EXISTS idx_news_entity_slug ON news_entity_articles(entity_slug);
CREATE INDEX IF NOT EXISTS idx_news_entity_type ON news_entity_articles(entity_type);
"""


def tsv_escape(v):
    if v is None:
        return ""
    return str(v).replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "")


def main() -> int:
    print("=== Script 65: Load News Data → Supabase ===\n")

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True

    with conn.cursor() as cur:
        cur.execute("SET statement_timeout = 0")
        cur.execute(DDL)
        print("Tables ready.")

        # ── 1. RSS feed articles ─────────────────────────────────────────────
        feed_path = DATA_DIR / "feed.jsonl"
        articles = []
        if feed_path.exists():
            for line in feed_path.read_text().strip().splitlines():
                try:
                    articles.append(json.loads(line))
                except Exception:
                    pass
        print(f"Found {len(articles)} RSS articles")

        cur.execute("TRUNCATE TABLE news_entity_articles RESTART IDENTITY")
        cur.execute("DELETE FROM news_articles")

        buf = StringIO()
        for a in articles:
            row = (
                a.get("id", ""),
                a.get("title", ""),
                a.get("url", ""),
                a.get("outlet", ""),
                a.get("published") or None,
                a.get("summary", ""),
                a.get("ingested_at") or None,
            )
            buf.write("\t".join("" if v is None else tsv_escape(v) for v in row) + "\n")
        buf.seek(0)
        cur.copy_expert(
            "COPY news_articles (id, title, url, outlet, published, summary, ingested_at) "
            "FROM STDIN WITH (FORMAT text, NULL '')",
            buf,
        )
        print(f"Loaded {len(articles)} articles into news_articles")

        # ── 2. entity_matches.json (RSS entity matches) ──────────────────────
        em_path = DATA_DIR / "entity_matches.json"
        entity_rows = []

        if em_path.exists():
            matches = json.loads(em_path.read_text())
            for m in matches:
                etype = m.get("entity_type", "")
                eid   = str(m.get("entity_id", "")).strip()
                ename = m.get("entity_name", "")
                ACCT_TYPES = {"candidate", "committee"}
                SLUG_TYPES = {"donor", "lobbyist", "principal", "firm", "vendor"}
                acct  = eid if etype in ACCT_TYPES else None
                slug  = eid if etype in SLUG_TYPES else None

                for art in m.get("articles", []):
                    entity_rows.append((
                        etype, acct, slug, ename,
                        art.get("title", ""),
                        art.get("url", ""),
                        art.get("outlet", ""),
                        art.get("published", ""),
                        art.get("snippet", ""),
                        "rss_match",
                    ))
            print(f"entity_matches.json: {len(matches)} entities → {len(entity_rows)} article links")

        # ── 3. by_entity/*.json (Google News targeted) ───────────────────────
        by_entity_dir = DATA_DIR / "by_entity"
        gn_count = 0
        if by_entity_dir.exists():
            for f in sorted(by_entity_dir.glob("*.json")):
                try:
                    d = json.loads(f.read_text())
                except Exception:
                    continue
                etype = d.get("entity_type", "")
                eid   = str(d.get("entity_id", "")).strip()
                ename = d.get("entity_name", "")
                ACCT_TYPES = {"candidate", "committee"}
                SLUG_TYPES = {"donor", "lobbyist", "principal", "firm", "vendor"}
                acct  = eid if etype in ACCT_TYPES else None
                slug  = eid if etype in SLUG_TYPES else None

                source_tag = "exa" if f.stem.endswith("_exa") else "google_news"
                for art in d.get("articles", []):
                    entity_rows.append((
                        etype, acct, slug, ename,
                        art.get("title", ""),
                        art.get("url", ""),
                        art.get("outlet") or art.get("source", ""),
                        art.get("published", ""),
                        art.get("snippet", ""),
                        source_tag,
                    ))
                    gn_count += 1
            print(f"by_entity/: {len(list(by_entity_dir.glob('*.json')))} files → {gn_count} article links")

        # Load entity rows
        buf2 = StringIO()
        for row in entity_rows:
            buf2.write("\t".join("" if v is None else tsv_escape(v) for v in row) + "\n")
        buf2.seek(0)
        cur.copy_expert(
            "COPY news_entity_articles "
            "(entity_type, entity_acct_num, entity_slug, entity_name, "
            "article_title, article_url, article_outlet, article_published, article_snippet, source) "
            "FROM STDIN WITH (FORMAT text, NULL '')",
            buf2,
        )
        print(f"Loaded {len(entity_rows)} total entity-article links")

    conn.close()
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
