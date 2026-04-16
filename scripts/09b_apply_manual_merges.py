#!/usr/bin/env python3
"""
09b_apply_manual_merges.py

Applies the hand-curated canonical-entity map in `data/manual_donor_merges.yaml`
to the donor_entities + donor_aliases tables. Idempotent — safe to re-run.

Source precedence (highest → lowest):
    manual_merge > corp_match > lobbyist_match > dedup_pipeline > self

If an alias already exists with a lower-precedence source, this script
overwrites it. If it exists with the same or higher precedence, it's left
alone unless the canonical_slug differs — collisions are logged and manual
wins because manual is the top authority.

Usage:
    cd ~/Claude\\ Projects/florida-donor-tracker
    python3 scripts/09b_apply_manual_merges.py

    # Validate YAML only (no DB writes):
    python3 scripts/09b_apply_manual_merges.py --dry-run

Exits non-zero on any YAML validation error so CI can fail the build.
"""

import os
import re
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values
import yaml
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env.local")

DB_URL    = os.getenv("SUPABASE_DB_URL")
YAML_PATH = PROJECT_ROOT / "data" / "manual_donor_merges.yaml"

SOURCE_PRECEDENCE = {
    "manual_merge":    100,
    "corp_match":       80,
    "lobbyist_match":   70,
    "dedup_pipeline":   50,
    "self":             10,
}


def normalize_alias(raw: str) -> str:
    """Mirrors SQL donor_normalize(): uppercase, non-alphanumeric → space,
    collapse whitespace, trim."""
    s = str(raw).upper()
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def validate(doc: dict):
    errors = []
    if not isinstance(doc, dict) or "entities" not in doc:
        errors.append("top-level key 'entities' missing")
        return errors
    seen_slugs = set()
    seen_aliases = {}   # alias_norm -> slug
    for i, ent in enumerate(doc["entities"]):
        where = f"entities[{i}]"
        for k in ("canonical_slug", "canonical_name", "is_corporate"):
            if k not in ent:
                errors.append(f"{where}: missing '{k}'")
        slug = ent.get("canonical_slug", "")
        if slug in seen_slugs:
            errors.append(f"{where}: duplicate canonical_slug {slug!r}")
        seen_slugs.add(slug)
        aliases = ent.get("aliases") or []
        if not isinstance(aliases, list):
            errors.append(f"{where}: 'aliases' must be a list")
            continue
        for a in aliases:
            norm = normalize_alias(a)
            if not norm:
                continue
            prior = seen_aliases.get(norm)
            if prior and prior != slug:
                errors.append(
                    f"{where}: alias {a!r} already assigned to {prior!r}"
                )
            seen_aliases[norm] = slug
    return errors


def apply(cur, doc, dry_run):
    entity_rows = []
    alias_rows = []         # (alias_text, alias_text_display, canonical_slug)
    merge_log_rows = []
    overrides_logged = 0

    # Preload existing alias ownership so we can detect overrides
    existing = {}
    if cur is not None:
        cur.execute("SELECT alias_text, canonical_slug, source FROM donor_aliases")
        for row in cur.fetchall():
            existing[row[0]] = (row[1], row[2])

    for ent in doc["entities"]:
        slug = ent["canonical_slug"]
        entity_rows.append((
            slug,
            ent["canonical_name"],
            bool(ent.get("is_corporate", False)),
            ent.get("corp_ein"),
            ent.get("corp_number"),
            ent.get("industry"),
            ent.get("notes"),
        ))
        for raw in (ent.get("aliases") or []):
            norm = normalize_alias(raw)
            if not norm:
                continue
            prior = existing.get(norm)
            if prior and prior[0] != slug:
                overrides_logged += 1
                merge_log_rows.append((
                    "reassign_alias",
                    prior[0],
                    slug,
                    norm,
                    None,
                    "scripts/09b",
                    f"manual override (was {prior[1]!r})",
                ))
            alias_rows.append((norm, str(raw), slug))

    print(f"Entities in YAML:             {len(entity_rows):,}")
    print(f"Aliases to upsert:            {len(alias_rows):,}")
    print(f"Alias reassignments:          {overrides_logged:,}")

    if dry_run:
        print("\n[dry-run] no writes performed.")
        return

    execute_values(
        cur,
        """
        INSERT INTO donor_entities
            (canonical_slug, canonical_name, is_corporate,
             corp_ein, corp_number, industry, notes)
        VALUES %s
        ON CONFLICT (canonical_slug) DO UPDATE SET
            canonical_name = EXCLUDED.canonical_name,
            is_corporate   = EXCLUDED.is_corporate,
            corp_ein       = COALESCE(EXCLUDED.corp_ein,    donor_entities.corp_ein),
            corp_number    = COALESCE(EXCLUDED.corp_number, donor_entities.corp_number),
            industry       = COALESCE(EXCLUDED.industry,    donor_entities.industry),
            notes          = COALESCE(EXCLUDED.notes,       donor_entities.notes),
            updated_at     = now()
        """,
        entity_rows,
        page_size=500,
    )

    # Upsert aliases. alias_text is PK (normalized form).
    execute_values(
        cur,
        """
        INSERT INTO donor_aliases
            (alias_text, alias_text_display, canonical_slug,
             source, match_score, review_status, verified_by, verified_at)
        VALUES %s
        ON CONFLICT (alias_text) DO UPDATE SET
            alias_text_display = EXCLUDED.alias_text_display,
            canonical_slug     = EXCLUDED.canonical_slug,
            source             = EXCLUDED.source,
            match_score        = EXCLUDED.match_score,
            review_status      = EXCLUDED.review_status,
            verified_by        = EXCLUDED.verified_by,
            verified_at        = now()
        """,
        [(n, d, s, "manual_merge", None, "approved", "manual_yaml", None)
         for (n, d, s) in alias_rows],
        page_size=500,
    )

    if merge_log_rows:
        execute_values(
            cur,
            """
            INSERT INTO donor_merge_log
                (action, from_slug, to_slug, alias_text,
                 rows_affected, actor, rationale)
            VALUES %s
            """,
            merge_log_rows,
            page_size=500,
        )


def main():
    dry_run = "--dry-run" in sys.argv

    if not YAML_PATH.exists():
        sys.exit(f"ERROR: {YAML_PATH} not found")
    if not DB_URL and not dry_run:
        sys.exit("ERROR: SUPABASE_DB_URL not set (or pass --dry-run)")

    print(f"Reading {YAML_PATH}")
    with open(YAML_PATH) as f:
        doc = yaml.safe_load(f)

    errors = validate(doc)
    if errors:
        print("YAML validation FAILED:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        sys.exit(1)
    print("YAML validation: OK")

    if dry_run:
        apply(cur=None, doc=doc, dry_run=True)
        return 0

    conn = psycopg2.connect(DB_URL)
    try:
        with conn, conn.cursor() as cur:
            apply(cur, doc, dry_run=False)
        print("Committed.")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
