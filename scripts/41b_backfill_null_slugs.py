"""
Script 41b: Backfill donor_slug for existing NULL-slug contributions rows.

The original scripts 41/42 matched contributor_name_normalized exactly against
donors.name. Name variants (punctuation differences, suffix abbreviations) were
missed, leaving 13.6M rows with donor_slug=NULL worth ~$2.7B.

This script:
  1. Builds the extended slug_map (exact + punctuation-stripped + suffix variants)
     from the current donors table.
  2. Fetches all distinct contributor_name_normalized values with donor_slug IS NULL.
  3. Resolves each via: exact → stripped → None.
  4. UPDATEs contributions in batches of 500 distinct names per commit.

Safe to re-run — only touches rows where donor_slug IS NULL.

Usage:
    .venv/bin/python scripts/41b_backfill_null_slugs.py
"""

import os
import re
import sys
import time
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")

DB_URL = os.environ.get("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("SUPABASE_DB_URL not set in .env.local")

BATCH_SIZE = 500  # distinct names per UPDATE batch

# ── Variant matching (mirrors scripts 41/42) ──────────────────────────────────

_SUFFIX_VARIANTS = [
    (re.compile(r"\bINC\.?\b"),         "INC"),
    (re.compile(r"\bCORP\.?\b"),        "CORP"),
    (re.compile(r"\bCORPORATION\b"),    "CORP"),
    (re.compile(r"\bLTD\.?\b"),         "LTD"),
    (re.compile(r"\bLLC\.?\b"),         "LLC"),
    (re.compile(r"\bL\.L\.C\.?\b"),     "LLC"),
    (re.compile(r"\bL\.P\.?\b"),        "LP"),
    (re.compile(r"\bCO\.?\b"),          "CO"),
    (re.compile(r"\bASSOC\.?\b"),       "ASSOC"),
    (re.compile(r"\bCMMTE\b"),          "COMMITTEE"),
    (re.compile(r"\bCMTE\b"),           "COMMITTEE"),
    (re.compile(r"\bNATL\b"),           "NATIONAL"),
    (re.compile(r"\bNATIONAL\b"),       "NATL"),
    (re.compile(r"\bDEM\b"),            "DEMOCRATIC"),
    (re.compile(r"\bREP\b"),            "REPUBLICAN"),
    (re.compile(r"\bFLA\b"),            "FLORIDA"),
    (re.compile(r"\bFL\b"),             "FLORIDA"),
    (re.compile(r"\bASSOCIATION\b"),    "ASSOC"),
]


def _strip_punct(name: str) -> str:
    s = re.sub(r"[.,'\u2019]", "", name)
    return re.sub(r"\s+", " ", s).strip()


def _name_variants(normalized: str):
    stripped = _strip_punct(normalized)
    yield stripped
    for pattern, replacement in _SUFFIX_VARIANTS:
        v = re.sub(pattern, replacement, stripped)
        if v != stripped:
            yield _strip_punct(v)


def normalize_name(name) -> str:
    if not isinstance(name, str):
        return ""
    return re.sub(r"\s+", " ", name.strip().upper())


def build_slug_map(cur) -> dict:
    print("  Loading donors table...", flush=True)
    cur.execute("SELECT name, slug FROM donors")
    rows = cur.fetchall()

    exact = {}
    for name, slug in rows:
        if not name or not slug:
            continue
        exact[normalize_name(name)] = slug

    m = dict(exact)
    for canonical, slug in exact.items():
        for variant in _name_variants(canonical):
            if variant and variant not in m:
                m[variant] = slug

    print(f"  → {len(exact):,} exact + {len(m)-len(exact):,} variant entries", flush=True)
    return m


def resolve(normalized: str, slug_map: dict):
    """Try exact match, then stripped match, then None."""
    hit = slug_map.get(normalized)
    if hit:
        return hit
    return slug_map.get(_strip_punct(normalized))


def fmt_secs(s: float) -> str:
    if s < 60:
        return f"{s:.1f}s"
    m, sec = divmod(int(s), 60)
    return f"{m}m {sec}s"


def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()

    # ── Step 1: Build slug map ────────────────────────────────────────────────
    print("Building extended slug map...")
    slug_map = build_slug_map(cur)

    # ── Step 2: Fetch distinct unmatched normalized names ─────────────────────
    print("\nFetching distinct NULL-slug contributor names from contributions...")
    t0 = time.time()
    cur.execute("""
        SELECT contributor_name_normalized, COUNT(*) AS n, SUM(amount)::bigint AS total
        FROM contributions
        WHERE donor_slug IS NULL
          AND contributor_name_normalized IS NOT NULL
          AND contributor_name_normalized <> ''
        GROUP BY contributor_name_normalized
        ORDER BY total DESC NULLS LAST
    """)
    unmatched_names = cur.fetchall()
    print(f"  {len(unmatched_names):,} distinct names ({fmt_secs(time.time()-t0)})")

    # ── Step 3: Resolve each name ─────────────────────────────────────────────
    print("\nResolving names against slug map...")
    resolved = []  # [(contributor_name_normalized, slug)]
    unresolved = 0

    for name, n, total in unmatched_names:
        slug = resolve(name, slug_map)
        if slug:
            resolved.append((name, slug))
        else:
            unresolved += 1

    print(f"  {len(resolved):,} names resolved → will backfill")
    print(f"  {unresolved:,} names unresolved (genuine unknowns)")

    if not resolved:
        print("\nNothing to backfill.")
        return

    # Show top 20 resolved
    print("\n  Top 20 by stored total (showing what will be linked):")
    name_totals = {r[0]: (r[1], r[2]) for r in unmatched_names}
    top = sorted(resolved, key=lambda x: name_totals.get(x[0], (0, 0))[1] or 0, reverse=True)[:20]
    for name, slug in top:
        n, total = name_totals.get(name, (0, 0))
        print(f"    {name[:50]:<50}  → {slug[:40]:<40}  ${total or 0:>14,.0f}")

    # ── Step 4: UPDATE in batches ─────────────────────────────────────────────
    print(f"\nUpdating contributions in batches of {BATCH_SIZE} names...")
    conn.autocommit = False
    wcur = conn.cursor()

    updated_rows = 0
    batch_num = 0
    t0 = time.time()

    for i in range(0, len(resolved), BATCH_SIZE):
        batch = resolved[i:i + BATCH_SIZE]
        batch_num += 1

        # Build a VALUES list: (name, slug) pairs
        # UPDATE using a join against the VALUES table
        psycopg2.extras.execute_values(
            wcur,
            """
            UPDATE contributions c
            SET donor_slug = v.slug
            FROM (VALUES %s) AS v(norm_name, slug)
            WHERE c.donor_slug IS NULL
              AND c.contributor_name_normalized = v.norm_name
            """,
            batch,
            page_size=len(batch),
        )
        row_count = wcur.rowcount
        conn.commit()
        updated_rows += row_count

        elapsed = time.time() - t0
        done = min(i + BATCH_SIZE, len(resolved))
        print(f"  batch {batch_num}: {done:,}/{len(resolved):,} names processed "
              f"({updated_rows:,} rows updated, {fmt_secs(elapsed)})")

    wcur.close()
    cur.close()
    conn.close()

    print(f"\n✓ Script 41b complete.")
    print(f"  {len(resolved):,} names resolved")
    print(f"  {updated_rows:,} contribution rows backfilled with donor_slug")
    print(f"\nNow re-run script 85 to propagate gains to donor aggregates.")


if __name__ == "__main__":
    main()
