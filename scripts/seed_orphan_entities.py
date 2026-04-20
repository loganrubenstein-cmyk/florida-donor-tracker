"""
Seed donor_entities for orphan contribution slugs.

After dedup (script 09), some contribution rows carry donor_slug values that
don't exist in donor_entities — typically slugs inherited from earlier pipeline
runs. donors_mv LEFT JOINs donor_entities ← rollup, so those contributions get
silently dropped from the MV. This script creates singleton canonical entities
for each orphan slug so the MV sees every dollar.

Idempotent: only inserts slugs not already in donor_entities.
"""
import os, sys
import psycopg2
from dotenv import load_dotenv

load_dotenv(".env.local")

conn = psycopg2.connect(os.getenv("SUPABASE_DB_URL"))
conn.autocommit = True
cur = conn.cursor()
cur.execute("SET statement_timeout='900s'")

print("Finding orphan slugs + their most-common contributor_name…", flush=True)
cur.execute("""
  WITH orphans AS (
    SELECT c.donor_slug, c.contributor_name, COUNT(*) n
    FROM contributions c
    LEFT JOIN donor_entities e ON e.canonical_slug = c.donor_slug
    WHERE c.donor_slug IS NOT NULL
      AND e.canonical_slug IS NULL
    GROUP BY c.donor_slug, c.contributor_name
  ),
  picked AS (
    SELECT DISTINCT ON (donor_slug)
      donor_slug, contributor_name
    FROM orphans
    ORDER BY donor_slug, n DESC
  )
  SELECT donor_slug, contributor_name FROM picked
""")
rows = cur.fetchall()
print(f"  {len(rows):,} orphan slugs to seed", flush=True)

if not rows:
    print("nothing to do"); sys.exit(0)

print("Upserting canonical entities…", flush=True)
from psycopg2.extras import execute_values
execute_values(
    cur,
    """
    INSERT INTO donor_entities (canonical_slug, canonical_name, is_corporate, created_at, updated_at)
    VALUES %s
    ON CONFLICT (canonical_slug) DO NOTHING
    """,
    [(slug, name or slug, False) for slug, name in rows],
    template="(%s, %s, %s, now(), now())",
    page_size=2000,
)
print(f"  inserted (on conflict: skipped)", flush=True)

print("Adding matching donor_aliases rows…", flush=True)
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

print("Refreshing donors_mv (concurrent)…", flush=True)
import time
t0 = time.time()
cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY donors_mv")
print(f"  refreshed in {time.time()-t0:.1f}s", flush=True)

cur.execute("SELECT COUNT(*) FROM donors_mv")
print(f"donors_mv rows: {cur.fetchone()[0]:,}")
cur.execute("SELECT SUM(total_combined)::numeric(20,2) FROM donors_mv")
mv_sum = cur.fetchone()[0]
print(f"donors_mv SUM: ${mv_sum:,}")
cur.execute("SELECT SUM(amount)::numeric(20,2) FROM contributions WHERE donor_slug IS NOT NULL")
con_sum = cur.fetchone()[0]
print(f"contributions SUM: ${con_sum:,}")
drift = con_sum - mv_sum
print(f"drift: ${drift:,}")
