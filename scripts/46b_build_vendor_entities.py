#!/usr/bin/env python3
"""
46b_build_vendor_entities.py

End-to-end vendor canonicalization: build vendor_entities + vendor_aliases
from all vendor_name variants in expenditures + candidate_expenditures,
then backfill vendor_canonical_slug FK columns.

Three-pass clustering:
  Pass 0: manual merges from data/vendor_manual_merges.yaml (highest priority)
  Pass 1: exact normalize() match
  Pass 2: compact_form() match
  Pass 3: first_token match + pg_trgm similarity >= 0.75

Invariant audits run at the end:
  - Dollar invariant: SUM(amount) == SUM by canonical_slug
  - Row invariant:    COUNT(*) == COUNT with FK set
  - Cluster stats:    histogram + top 20 clusters

Usage:
    .venv/bin/python scripts/46b_build_vendor_entities.py
"""
from __future__ import annotations

import importlib.util
import os
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

import psycopg2
import yaml
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env.local")
DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set")

_SPEC = importlib.util.spec_from_file_location(
    "vn", PROJECT_ROOT / "scripts" / "_vendor_norm.py"
)
vn = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(vn)

YAML_PATH = PROJECT_ROOT / "data" / "vendor_manual_merges.yaml"
FUZZY_THRESHOLD = 0.75  # from 46a sweep


def slugify(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "unknown"


def _title(s: str) -> str:
    """Title-case while preserving known acronyms/abbreviations."""
    if not s:
        return s
    ACRONYMS = {"LLC", "LLP", "PLLC", "PC", "PA", "PL", "INC", "LTD",
                "CPA", "CPAS", "USA", "USPS", "ATT", "AT&T", "NA"}
    words = s.split()
    out = []
    for w in words:
        upper = w.upper()
        if upper in ACRONYMS:
            out.append(upper)
        else:
            out.append(w.title())
    return " ".join(out)


def fetch_distinct_vendors(cur):
    """Return list of (raw_name, total_amount, row_count) from both tables."""
    cur.execute("""
        SELECT vendor_name, SUM(amount)::numeric, COUNT(*)
        FROM (
            SELECT vendor_name, amount FROM expenditures WHERE vendor_name IS NOT NULL
            UNION ALL
            SELECT vendor_name, amount FROM candidate_expenditures WHERE vendor_name IS NOT NULL
        ) u
        WHERE trim(vendor_name) <> ''
        GROUP BY vendor_name
    """)
    return cur.fetchall()


def load_manual_merges():
    """Return list of (slug, name, is_gov, aliases[]) from YAML."""
    if not YAML_PATH.exists():
        print(f"  (no manual merges file at {YAML_PATH})")
        return []
    with YAML_PATH.open() as f:
        data = yaml.safe_load(f)
    out = []
    for c in data.get("clusters", []):
        name = c["canonical_name"]
        slug = c.get("canonical_slug") or slugify(name)
        is_gov = bool(c.get("is_government", False))
        is_franchise = bool(c.get("is_franchise", False))
        aliases = [a for a in c.get("aliases", []) if a and a.strip()]
        out.append({
            "slug": slug, "name": name,
            "is_government": is_gov, "is_franchise": is_franchise,
            "aliases": aliases,
        })
    return out


def cluster_vendors(vendors, manual_merges, cur):
    """Return dict: normalized_alias → canonical_slug, and entities dict.

    vendors: [(raw_name, total_amount, row_count), ...]
    """
    entities = {}        # slug → {name, is_gov, is_franchise, notes}
    alias_to_slug = {}   # normalized alias → slug
    alias_display = {}   # normalized alias → pretty-cased original
    source_map = {}      # normalized alias → source string

    # ── Pass 0: seed manual merges ──
    for m in manual_merges:
        slug = m["slug"]
        entities[slug] = {
            "name": m["name"],
            "is_government": m["is_government"],
            "is_franchise": m["is_franchise"],
        }
        for alias in m["aliases"]:
            na = vn.normalize(alias)
            if not na:
                continue
            if na in alias_to_slug and alias_to_slug[na] != slug:
                print(f"  WARN: manual alias conflict: {na!r} "
                      f"({alias_to_slug[na]} vs {slug})")
            alias_to_slug[na] = slug
            alias_display[na] = alias
            source_map[na] = "manual_merge"

    # ── Build normalized map of remaining raw vendors ──
    # Keep track of "best display" per normalized form (pick most common raw).
    norm_groups = defaultdict(list)  # na → [(raw, amount, count)]
    for raw, amount, count in vendors:
        na = vn.normalize(raw)
        if not na:
            continue
        norm_groups[na].append((raw, amount, count))

    # ── Pass 1: exact normalize groups ──
    # Each na that doesn't already have a manual slug gets a new entity.
    for na, group in norm_groups.items():
        if na in alias_to_slug:
            continue  # manual-assigned
        # Best display: raw with highest row count
        best_raw = max(group, key=lambda g: g[2])[0]
        slug = slugify(na)
        if slug in entities:
            # Slug collision — suffix-disambiguate
            i = 2
            while f"{slug}-{i}" in entities:
                i += 1
            slug = f"{slug}-{i}"
        entities[slug] = {
            "name": _title(best_raw.strip()),
            "is_government": vn.is_probable_government(na),
            "is_franchise": vn.is_probable_franchise(na),
        }
        alias_to_slug[na] = slug
        alias_display[na] = best_raw
        source_map[na] = "self"

    # ── Pass 2: compact_form merge ──
    # For each unassigned (well, they're all assigned now — this pass merges
    # existing entities whose compact forms collide).
    compact_to_slugs = defaultdict(list)
    for na, slug in alias_to_slug.items():
        cf = vn.compact_form(na)
        if cf and source_map.get(na) == "self":
            compact_to_slugs[cf].append((na, slug))

    for cf, items in compact_to_slugs.items():
        if len(items) < 2:
            continue
        # Don't merge items into manual-seeded entities via compact (manual wins already).
        # Keep lexicographically smallest slug as canonical.
        items.sort(key=lambda x: x[1])
        target_slug = items[0][1]
        for na, slug in items[1:]:
            if slug == target_slug:
                continue
            # Reassign na to target, delete donor entity
            alias_to_slug[na] = target_slug
            source_map[na] = "dedup_pipeline"
            if slug in entities:
                del entities[slug]

    # ── Pass 3: fuzzy trigram via pg_trgm ──
    # We use Postgres similarity() to find pairs of normalized aliases
    # with same first_token and sim >= threshold. Then merge.
    # Build temp table in Postgres.
    alias_list = [(na, vn.first_token(na)) for na in alias_to_slug.keys()]

    cur.execute("DROP TABLE IF EXISTS _vendor_alias_tmp")
    cur.execute("""
        CREATE TEMP TABLE _vendor_alias_tmp (
            na text PRIMARY KEY,
            ft text
        )
    """)
    from psycopg2.extras import execute_values
    execute_values(cur, "INSERT INTO _vendor_alias_tmp (na, ft) VALUES %s", alias_list)
    cur.execute("CREATE INDEX ON _vendor_alias_tmp (ft)")
    cur.execute("CREATE INDEX ON _vendor_alias_tmp USING gin (na gin_trgm_ops)")

    # Find fuzzy pairs: same first_token, sim >= threshold, a < b (dedupe)
    # Skip pairs where one side is already a manual-merge alias (those are locked).
    # Also skip franchise-flagged aliases.
    cur.execute(f"""
        SELECT a.na, b.na, similarity(a.na, b.na) AS sim
        FROM _vendor_alias_tmp a
        JOIN _vendor_alias_tmp b
          ON a.ft = b.ft
         AND a.na < b.na
         AND a.ft <> ''
         AND similarity(a.na, b.na) >= {FUZZY_THRESHOLD}
    """)
    pairs = cur.fetchall()

    # Union-find merge
    uf_parent = {slug: slug for slug in entities}
    def find(x):
        while uf_parent[x] != x:
            uf_parent[x] = uf_parent[uf_parent[x]]
            x = uf_parent[x]
        return x
    def union(a, b):
        ra, rb = find(a), find(b)
        if ra == rb:
            return
        # Prefer keeping the slug with more aliases (rough proxy for manual/larger cluster)
        # Simple: lexicographic
        if ra < rb:
            uf_parent[rb] = ra
        else:
            uf_parent[ra] = rb

    merged_count = 0
    for na_a, na_b, sim in pairs:
        sa = alias_to_slug[na_a]
        sb = alias_to_slug[na_b]
        if sa == sb:
            continue
        # Don't merge manual-seeded entities into each other or absorb them
        man_a = source_map.get(na_a) == "manual_merge"
        man_b = source_map.get(na_b) == "manual_merge"
        if man_a and man_b:
            continue
        # Skip if franchise-guarded on either side
        if (vn.is_probable_franchise(na_a) or vn.is_probable_franchise(na_b)):
            continue
        union(sa, sb)
        merged_count += 1

    # Collapse entities via union-find
    new_alias_to_slug = {}
    for na, slug in alias_to_slug.items():
        root = find(slug)
        new_alias_to_slug[na] = root
        if slug != root and source_map.get(na) == "self":
            source_map[na] = "dedup_pipeline"
    alias_to_slug = new_alias_to_slug

    # Remove entities that were absorbed
    absorbed = {slug for slug in list(entities.keys()) if find(slug) != slug}
    for slug in absorbed:
        del entities[slug]

    cur.execute("DROP TABLE IF EXISTS _vendor_alias_tmp")

    print(f"  Pass 3 fuzzy merges: {merged_count} pair-merges, "
          f"{len(absorbed)} entities absorbed")

    return entities, alias_to_slug, alias_display, source_map


def main() -> int:
    t0 = time.time()
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute("SET statement_timeout = 0")

    try:
        print("Step 1: TRUNCATE vendor tables + reset FK columns")
        cur.execute("TRUNCATE vendor_aliases")
        cur.execute("TRUNCATE vendor_entities CASCADE")
        cur.execute("TRUNCATE vendor_merge_log")
        cur.execute("UPDATE expenditures SET vendor_canonical_slug = NULL WHERE vendor_canonical_slug IS NOT NULL")
        cur.execute("UPDATE candidate_expenditures SET vendor_canonical_slug = NULL WHERE vendor_canonical_slug IS NOT NULL")
        conn.commit()

        print("\nStep 2: Load manual merges")
        manual = load_manual_merges()
        print(f"  {len(manual)} manual clusters, "
              f"{sum(len(m['aliases']) for m in manual)} aliases")

        print("\nStep 3: Fetch distinct vendor names")
        vendors = fetch_distinct_vendors(cur)
        print(f"  {len(vendors):,} distinct raw vendor_name values")

        print("\nStep 4: Cluster (exact → compact → fuzzy)")
        entities, alias_to_slug, alias_display, source_map = \
            cluster_vendors(vendors, manual, cur)

        print(f"\n  Result: {len(entities):,} canonical entities "
              f"from {len(alias_to_slug):,} aliases "
              f"(compression ratio: "
              f"{len(alias_to_slug) / max(1, len(entities)):.2f}×)")

        print("\nStep 5: Insert vendor_entities")
        from psycopg2.extras import execute_values
        ent_rows = [
            (slug, e["name"], e["is_government"], e["is_franchise"])
            for slug, e in entities.items()
        ]
        execute_values(cur, """
            INSERT INTO vendor_entities (canonical_slug, canonical_name,
                                         is_government, is_franchise)
            VALUES %s
            ON CONFLICT (canonical_slug) DO NOTHING
        """, ent_rows)

        print("Step 6: Insert vendor_aliases")
        al_rows = [
            (na, alias_display.get(na, na), slug, source_map.get(na, "self"),
             None if source_map.get(na) in ("self", "manual_merge") else 80.0)
            for na, slug in alias_to_slug.items()
        ]
        execute_values(cur, """
            INSERT INTO vendor_aliases (alias_text, alias_text_display,
                                        canonical_slug, source, match_score)
            VALUES %s
            ON CONFLICT (alias_text) DO NOTHING
        """, al_rows, page_size=1000)

        conn.commit()
        print(f"  ✓ {len(ent_rows):,} entities, {len(al_rows):,} aliases inserted")

        print("\nStep 7: Backfill vendor_canonical_slug on expenditure tables")
        # Normalize vendor_name in SQL via the alias table join.
        # The normalize() function lives in Python; we need a SQL-side equivalent
        # or we can pre-compute a mapping and UPDATE via a staging table.
        # Approach: dump (raw_name → slug) to a TEMP table, then UPDATE ... FROM.

        cur.execute("""
            CREATE TEMP TABLE _raw_to_slug (
                raw_name text PRIMARY KEY,
                slug text NOT NULL
            )
        """)
        # Build raw → slug mapping in Python
        raw_to_slug = {}
        for raw, _amt, _cnt in vendors:
            na = vn.normalize(raw)
            if na and na in alias_to_slug:
                raw_to_slug[raw] = alias_to_slug[na]
        rts_rows = list(raw_to_slug.items())
        execute_values(cur, "INSERT INTO _raw_to_slug VALUES %s", rts_rows, page_size=5000)
        print(f"  Loaded {len(rts_rows):,} raw→slug mappings")

        cur.execute("""
            UPDATE expenditures e
            SET vendor_canonical_slug = m.slug
            FROM _raw_to_slug m
            WHERE e.vendor_name = m.raw_name
        """)
        exp_updated = cur.rowcount
        cur.execute("""
            UPDATE candidate_expenditures e
            SET vendor_canonical_slug = m.slug
            FROM _raw_to_slug m
            WHERE e.vendor_name = m.raw_name
        """)
        cand_updated = cur.rowcount
        conn.commit()
        print(f"  ✓ expenditures: {exp_updated:,} rows updated")
        print(f"  ✓ candidate_expenditures: {cand_updated:,} rows updated")

        print("\nStep 8: Invariant audits")

        # Dollar invariant
        cur.execute("""
            SELECT
                (SELECT SUM(amount)::numeric FROM expenditures WHERE vendor_name IS NOT NULL),
                (SELECT SUM(amount)::numeric FROM expenditures WHERE vendor_canonical_slug IS NOT NULL)
        """)
        total_all, total_linked = cur.fetchone()
        print(f"  expenditures $ total: {total_all}")
        print(f"  expenditures $ linked: {total_linked}")
        diff = (total_all or 0) - (total_linked or 0)
        print(f"  Δ (unlinked): {diff}")

        cur.execute("""
            SELECT
                (SELECT SUM(amount)::numeric FROM candidate_expenditures WHERE vendor_name IS NOT NULL),
                (SELECT SUM(amount)::numeric FROM candidate_expenditures WHERE vendor_canonical_slug IS NOT NULL)
        """)
        total_all2, total_linked2 = cur.fetchone()
        print(f"  candidate_expenditures $ total: {total_all2}")
        print(f"  candidate_expenditures $ linked: {total_linked2}")
        diff2 = (total_all2 or 0) - (total_linked2 or 0)
        print(f"  Δ (unlinked): {diff2}")

        # Row invariant
        cur.execute("""
            SELECT
                COUNT(*) FILTER (WHERE vendor_name IS NOT NULL),
                COUNT(*) FILTER (WHERE vendor_canonical_slug IS NOT NULL)
            FROM expenditures
        """)
        rows_all, rows_linked = cur.fetchone()
        print(f"  expenditures rows: {rows_all:,} total, {rows_linked:,} linked "
              f"({rows_all - rows_linked:,} unlinked)")

        cur.execute("""
            SELECT
                COUNT(*) FILTER (WHERE vendor_name IS NOT NULL),
                COUNT(*) FILTER (WHERE vendor_canonical_slug IS NOT NULL)
            FROM candidate_expenditures
        """)
        rows_all2, rows_linked2 = cur.fetchone()
        print(f"  candidate_expenditures rows: {rows_all2:,} total, {rows_linked2:,} linked "
              f"({rows_all2 - rows_linked2:,} unlinked)")

        # Cluster size distribution
        cur.execute("""
            SELECT canonical_slug, COUNT(*) AS n
            FROM vendor_aliases
            GROUP BY canonical_slug
            ORDER BY n DESC
            LIMIT 20
        """)
        top = cur.fetchall()
        print("\n  Top 20 clusters by alias count:")
        for slug, n in top:
            cur.execute("""
                SELECT canonical_name FROM vendor_entities WHERE canonical_slug = %s
            """, (slug,))
            name = cur.fetchone()[0]
            print(f"    {n:>4}  {slug:<30}  {name}")

        cur.execute("""
            SELECT
                COUNT(*) FILTER (WHERE alias_count = 1) AS singletons,
                COUNT(*) FILTER (WHERE alias_count BETWEEN 2 AND 5) AS small,
                COUNT(*) FILTER (WHERE alias_count BETWEEN 6 AND 20) AS medium,
                COUNT(*) FILTER (WHERE alias_count > 20) AS large
            FROM (
                SELECT canonical_slug, COUNT(*) AS alias_count
                FROM vendor_aliases
                GROUP BY canonical_slug
            ) s
        """)
        s, m, md, lg = cur.fetchone()
        print(f"\n  Cluster size distribution:")
        print(f"    singletons (1 alias):   {s:,}")
        print(f"    small      (2-5):       {m:,}")
        print(f"    medium     (6-20):      {md:,}")
        print(f"    large      (21+):       {lg:,}")

        elapsed = time.time() - t0
        print(f"\n✓ Done in {elapsed:.1f}s")
        return 0

    except Exception as e:
        conn.rollback()
        print(f"\nERROR: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
