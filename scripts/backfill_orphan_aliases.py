"""
Backfill donor_aliases for canonical entities that don't have one.

seed_orphan_entities.py inserted 41,884 entities but the aliases insert failed
on a column-name mismatch. Entities without aliases still produce correct MV
totals (MV joins on canonical_slug), but future contribution loads can't map
variant names to them. This script closes that gap.
"""
import os, time
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv(".env.local")
conn = psycopg2.connect(os.getenv("SUPABASE_DB_URL"))
conn.autocommit = True
cur = conn.cursor()
cur.execute("SET statement_timeout='900s'")

print("Finding entities missing aliases…", flush=True)
cur.execute("""
  SELECT e.canonical_slug, e.canonical_name
  FROM donor_entities e
  LEFT JOIN donor_aliases a ON a.canonical_slug = e.canonical_slug
  WHERE a.canonical_slug IS NULL
""")
rows = cur.fetchall()
print(f"  {len(rows):,} entities need an alias", flush=True)

if not rows:
    raise SystemExit(0)

print("Inserting aliases…", flush=True)
t0 = time.time()
execute_values(
    cur,
    """
    INSERT INTO donor_aliases (alias_text, alias_text_display, canonical_slug, source, review_status)
    VALUES %s
    ON CONFLICT (alias_text) DO NOTHING
    """,
    [((name or slug).upper().strip(), name or slug, slug, 'dedup_pipeline', 'auto') for slug, name in rows],
    template="(%s, %s, %s, %s, %s)",
    page_size=2000,
)
print(f"  done in {time.time()-t0:.1f}s", flush=True)

cur.execute("SELECT COUNT(*) FROM donor_aliases")
print(f"donor_aliases rows: {cur.fetchone()[0]:,}")
cur.execute("""
  SELECT COUNT(*) FROM donor_entities e
  LEFT JOIN donor_aliases a ON a.canonical_slug = e.canonical_slug
  WHERE a.canonical_slug IS NULL
""")
print(f"entities still missing aliases: {cur.fetchone()[0]:,}")
