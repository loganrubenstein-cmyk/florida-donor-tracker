"""
Script 100: Apply Manual Name Aliases

Fixes contributions where donor_slug IS NULL because the contributor_name
was truncated, had a variant spelling, or used a different legal entity name
that we know maps to an existing canonical donor slug.

This is distinct from script 86b (ghost slug remaps) — here the contributions
have no slug at all, not a wrong slug.

Aliases are hard-coded and manually verified. Add new rows to ALIASES as
additional cases are discovered.

Usage:
    .venv/bin/python scripts/100_apply_name_aliases.py           # apply
    .venv/bin/python scripts/100_apply_name_aliases.py --dry-run # preview
"""

import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")

# ---------------------------------------------------------------------------
# ALIASES: (contributor_name_exact, canonical_donor_slug)
# contributor_name_exact must match the value in contributions.contributor_name
# exactly (case-insensitive comparison is used at query time).
# ---------------------------------------------------------------------------
ALIASES = [
    # DNC — truncated at 24 chars in older state files
    ("DEMOCRATIC NATIONAL COMMI",              "democratic-national-committee"),

    # FL Realtors — Florida Association of Realtors is the same org as Florida Realtors
    ("FLORIDA ASSOCIATION OF REALTORS",        "florida-realtors"),
    ("FLA. ASSOCIATION OF REALTORS ADVOCACY FUND",  "florida-realtors"),
    ("FLORIDA ASSN. OF REALTORS ADVOCACY FUND",     "florida-realtors"),
    ("FLORIDA ASSN. OF REALTORS ADVO CACY FUND",    "florida-realtors"),
    ("FLORIDA ASSOCIATION OF REALTORS  ADVOCACY FUND", "florida-realtors"),

    # Las Vegas Sands — corp / corporation variants map to the existing las-vegas-sands-co donor
    ("LAS VEGAS SANDS CORP.",                 "las-vegas-sands-co"),
    ("LAS VEGAS SANDS CORPORATION",           "las-vegas-sands-co"),
]


def get_conn():
    return psycopg2.connect(os.environ["SUPABASE_DB_URL"])


def verify_canonical_slugs(cur):
    """Confirm every target slug exists in donors before touching contributions."""
    missing = []
    seen = set()
    for _, slug in ALIASES:
        if slug in seen:
            continue
        seen.add(slug)
        cur.execute("SELECT 1 FROM donors WHERE slug = %s", (slug,))
        if not cur.fetchone():
            missing.append(slug)
    return missing


def main():
    dry_run = "--dry-run" in sys.argv

    conn = get_conn()
    cur = conn.cursor()

    # Pre-flight: verify all canonical slugs exist
    missing = verify_canonical_slugs(cur)
    if missing:
        print("ERROR: The following canonical slugs do not exist in donors:")
        for s in missing:
            print(f"  {s}")
        print("Aborting — fix canonical slugs before running this script.")
        conn.close()
        sys.exit(1)

    # Extend statement timeout for bulk UPDATEs on the contributions table
    cur.execute("SET statement_timeout = '300s'")

    print(f"Script 100: Apply Name Aliases{'  [DRY RUN]' if dry_run else ''}")
    print(f"  {len(ALIASES)} aliases defined")
    print()

    total_rows = 0
    total_dollars = 0.0

    for name, slug in ALIASES:
        # Count + sum affected rows
        cur.execute(
            """
            SELECT COUNT(*), COALESCE(SUM(amount), 0)
            FROM contributions
            WHERE donor_slug IS NULL
              AND UPPER(contributor_name) = UPPER(%s)
            """,
            (name,),
        )
        cnt, dollars = cur.fetchone()
        if cnt == 0:
            continue

        total_rows += cnt
        total_dollars += float(dollars)

        tag = "[DRY RUN] Would update" if dry_run else "Updating"
        print(f"  {tag}: {name!r}")
        print(f"    → {slug}  ({cnt} rows, ${dollars:,.2f})")

        if not dry_run:
            cur.execute(
                """
                UPDATE contributions
                SET donor_slug = %s
                WHERE donor_slug IS NULL
                  AND UPPER(contributor_name) = UPPER(%s)
                """,
                (slug, name),
            )

    if not dry_run:
        conn.commit()
        print()
        print(f"✓ Script 100 complete.")
        print(f"  {total_rows} contribution rows updated")
        print(f"  ${total_dollars:,.2f} now linked to canonical donor profiles")
        print()
        print("Next: run script 85 to reconcile donor aggregate totals.")
    else:
        print()
        print(f"[DRY RUN] Would update {total_rows} rows (${total_dollars:,.2f})")

    conn.close()


if __name__ == "__main__":
    main()
