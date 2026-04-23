"""
scripts/46c_backfill_expenditures_slug.py
-----------------------------------------
One-shot backfill of expenditures.vendor_canonical_slug from vendor_aliases.
Written to fix a drift pattern: 46b does this backfill as part of a full
rebuild, but if expenditures are reloaded separately (e.g. after a Q-close
refresh) the slugs go back to NULL until the next 46b run. This script
runs only Step 7 of 46b — no entity rebuild, no alias table mutation.

Covers both expenditures and candidate_expenditures. Idempotent:
re-running only updates rows whose slug is currently NULL.

Usage:
    .venv/bin/python scripts/46c_backfill_expenditures_slug.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import _vendor_norm as vn  # noqa: E402

dotenv = ROOT / ".env.local"
for line in dotenv.read_text().split("\n"):
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

DB_URL = os.environ["SUPABASE_DB_URL"]


def main() -> int:
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("SET statement_timeout = 0")
    cur.execute("SET lock_timeout = '30s'")

    print("Loading alias_text -> canonical_slug map …", flush=True)
    cur.execute("SELECT alias_text, canonical_slug FROM vendor_aliases")
    alias_to_slug: dict[str, str] = {a: s for a, s in cur.fetchall()}
    print(f"  {len(alias_to_slug):,} aliases loaded")

    print("\nCollecting NULL-slug vendor_names across both tables …", flush=True)
    cur.execute("""
        SELECT DISTINCT vendor_name FROM expenditures
         WHERE vendor_canonical_slug IS NULL AND vendor_name IS NOT NULL
        UNION
        SELECT DISTINCT vendor_name FROM candidate_expenditures
         WHERE vendor_canonical_slug IS NULL AND vendor_name IS NOT NULL
    """)
    raw_names = [r[0] for r in cur.fetchall()]
    print(f"  {len(raw_names):,} distinct unsluggable vendor_name values")

    mapped: list[tuple[str, str]] = []
    for raw in raw_names:
        na = vn.normalize(raw)
        if na and na in alias_to_slug:
            mapped.append((raw, alias_to_slug[na]))
    print(f"  {len(mapped):,} of those resolve to an existing canonical_slug")

    if not mapped:
        print("Nothing to backfill.")
        return 0

    CHUNK = 3000
    exp_updated = 0
    cand_updated = 0

    print(f"\nUpdating in chunks of {CHUNK} distinct vendor_names …", flush=True)
    for i in range(0, len(mapped), CHUNK):
        chunk = mapped[i : i + CHUNK]
        raw_names_chunk = [r for r, _ in chunk]
        slugs_chunk = [s for _, s in chunk]

        cur.execute("""
            UPDATE expenditures e
               SET vendor_canonical_slug = z.slug
              FROM (SELECT UNNEST(%s::text[]) AS raw_name,
                           UNNEST(%s::text[]) AS slug) z
             WHERE e.vendor_name = z.raw_name
               AND e.vendor_canonical_slug IS NULL
        """, (raw_names_chunk, slugs_chunk))
        exp_updated += cur.rowcount

        cur.execute("""
            UPDATE candidate_expenditures e
               SET vendor_canonical_slug = z.slug
              FROM (SELECT UNNEST(%s::text[]) AS raw_name,
                           UNNEST(%s::text[]) AS slug) z
             WHERE e.vendor_name = z.raw_name
               AND e.vendor_canonical_slug IS NULL
        """, (raw_names_chunk, slugs_chunk))
        cand_updated += cur.rowcount

        done = min(i + CHUNK, len(mapped))
        print(f"  {done:,}/{len(mapped):,} vendors | exp={exp_updated:,} cand={cand_updated:,}", flush=True)
    print(f"\n  expenditures:           {exp_updated:,} rows updated")
    print(f"  candidate_expenditures: {cand_updated:,} rows updated")

    cur.execute("""
        SELECT
          (SELECT COUNT(*) FROM expenditures) AS exp_total,
          (SELECT COUNT(*) FROM expenditures WHERE vendor_canonical_slug IS NOT NULL) AS exp_slug,
          (SELECT COUNT(*) FROM candidate_expenditures) AS cand_total,
          (SELECT COUNT(*) FROM candidate_expenditures WHERE vendor_canonical_slug IS NOT NULL) AS cand_slug
    """)
    exp_t, exp_s, cand_t, cand_s = cur.fetchone()
    print(f"\nCoverage after backfill:")
    print(f"  expenditures:           {exp_s:,} / {exp_t:,} ({exp_s/max(exp_t,1)*100:.1f}%)")
    print(f"  candidate_expenditures: {cand_s:,} / {cand_t:,} ({cand_s/max(cand_t,1)*100:.1f}%)")

    cur.close()
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
