"""
Script 86: Ghost Slug Analysis & High-Value Re-matching

Identifies contributions rows whose donor_slug has no matching donors row
(the giving is invisible on any donor profile page). For high-value ghost
slugs, attempts to find a canonical match in the donors table via:
  1. Exact normalized-name match
  2. Fuzzy first+last token match (for truncations like RGA)

Outputs two CSVs to data/logs/:
  ghost_slugs_YYYY-MM-DD.csv      — all ghosts above $5K with proposed match
  ghost_remaps_YYYY-MM-DD.csv     — only confident single-match remaps

NO writes to the DB. Review the remaps CSV, then run script 86b to apply.

Usage:
    .venv/bin/python scripts/86_ghost_slug_report.py
"""

import csv
import os
import re
import sys
from datetime import date
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")

db_url = os.environ.get("SUPABASE_DB_URL")
if not db_url:
    sys.exit("SUPABASE_DB_URL not set in .env.local")

LOG_DIR = ROOT / "data" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
TODAY = date.today()

conn = psycopg2.connect(db_url)
conn.autocommit = True
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
cur.execute("SET statement_timeout = 0")


def normalize(name):
    return re.sub(r'\s+', ' ', (name or '').upper().strip())


# ── Step 1: Load all ghost slugs above $5K ───────────────────────────────────

print("Loading ghost slugs (contributions with no donor profile)...")
print("  threshold: $5,000 total")

cur.execute("""
    SELECT c.donor_slug,
           SUM(c.amount)::float AS total,
           COUNT(*)::int AS n,
           array_agg(DISTINCT c.contributor_name
                     ORDER BY c.contributor_name)::text[] AS names
    FROM contributions c
    WHERE c.donor_slug IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM donors d WHERE d.slug = c.donor_slug)
    GROUP BY c.donor_slug
    HAVING SUM(c.amount) >= 5000
    ORDER BY total DESC
""")
ghosts = cur.fetchall()
print(f"  {len(ghosts):,} ghost slugs above $5K")
print(f"  Total dollars invisible: ${sum(g['total'] for g in ghosts):,.2f}")

# ── Step 2: Load donors table for matching ────────────────────────────────────

print("\nLoading donors table for matching...")
cur.execute("SELECT slug, name FROM donors")
donor_rows = cur.fetchall()

# Build lookup: normalized_name → slug
norm_to_slug = {}
for d in donor_rows:
    norm = normalize(d["name"])
    norm_to_slug[norm] = d["slug"]

print(f"  {len(norm_to_slug):,} donors indexed")


def try_match(ghost_slug, contributor_names):
    """
    Returns (proposed_slug, confidence) or (None, None).
    confidence: 'exact' | 'fuzzy' | None
    """
    # Try exact normalized match on each contributor name
    for name in contributor_names:
        norm = normalize(name)
        if norm in norm_to_slug:
            matched_slug = norm_to_slug[norm]
            if matched_slug != ghost_slug:
                return matched_slug, "exact"

    # Fuzzy: first + last token match
    for name in contributor_names[:3]:  # check up to 3 names
        norm = normalize(name)
        tokens = norm.split()
        if len(tokens) < 2:
            continue
        first_tok = tokens[0]
        last_tok  = tokens[-1]
        if len(first_tok) < 3 or len(last_tok) < 3:
            continue
        candidates = [
            slug for n, slug in norm_to_slug.items()
            if first_tok in n and last_tok in n and slug != ghost_slug
        ]
        if len(candidates) == 1:
            return candidates[0], "fuzzy"

    return None, None


# ── Step 3: Attempt matching ──────────────────────────────────────────────────

print("\nAttempting canonical matching for each ghost...")

all_results = []
confident_remaps = []

for g in ghosts:
    ghost_slug = g["donor_slug"]
    names = g["names"] or []
    proposed, confidence = try_match(ghost_slug, names)

    row = {
        "ghost_slug":      ghost_slug,
        "total":           round(g["total"], 2),
        "num_rows":        g["n"],
        "sample_names":    " | ".join((names or [])[:3]),
        "proposed_slug":   proposed or "",
        "confidence":      confidence or "",
    }
    all_results.append(row)

    if confidence in ("exact", "fuzzy") and proposed:
        confident_remaps.append(row)

print(f"  {len(all_results):,} ghost slugs analyzed")
print(f"  {len(confident_remaps):,} confident remaps found")
remaps_dollars = sum(r["total"] for r in confident_remaps)
print(f"  ${remaps_dollars:,.2f} in remap-eligible contributions")

# ── Step 4: Write CSVs ────────────────────────────────────────────────────────

all_file    = LOG_DIR / f"ghost_slugs_{TODAY}.csv"
remap_file  = LOG_DIR / f"ghost_remaps_{TODAY}.csv"

cols = ["ghost_slug", "total", "num_rows", "sample_names", "proposed_slug", "confidence"]

with open(all_file, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    w.writerows(all_results)

with open(remap_file, "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    w.writerows(confident_remaps)

print(f"\n  All ghosts → {all_file}")
print(f"  Confident remaps → {remap_file}")

# ── Step 5: Print top 30 ghosts ───────────────────────────────────────────────

print("\nTop 30 ghost slugs by dollar value:")
print(f"  {'GHOST SLUG':<45}  {'TOTAL':>14}  {'PROPOSED':<40}  CONF")
print("  " + "-"*120)
for r in all_results[:30]:
    print(f"  {r['ghost_slug']:<45}  ${r['total']:>13,.2f}  {r['proposed_slug']:<40}  {r['confidence']}")

print(f"\n✓ Script 86 complete.")
print(f"  Review {remap_file}")
print(f"  Then run: .venv/bin/python scripts/86b_apply_ghost_remaps.py")

cur.close()
conn.close()
