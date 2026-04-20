"""
32_add_industry_to_donor_index.py
Adds 'industry' field to each donor in public/data/donors/index.json.

Primary source: donors.industry (NAICS-derived bucket set by script 21b).
Fallback: classify_occupation(top_occupation) for donors without a DB bucket.

Usage:
    SUPABASE_DB_URL=postgres://... python scripts/32_add_industry_to_donor_index.py
"""

import json, os, sys, time
from collections import Counter
from pathlib import Path

import psycopg2

sys.path.insert(0, str(Path(__file__).parent))
from industry_classifier import classify_occupation

DATA = Path(__file__).resolve().parent.parent / 'public' / 'data'
INDEX_FILE = DATA / 'donors' / 'index.json'

DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set")


def load_db_industry_map():
    t0 = time.time()
    print("Loading donor industry map from Supabase…")
    conn = psycopg2.connect(DB_URL, keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=5)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT slug, industry FROM donors WHERE industry IS NOT NULL AND industry <> ''")
            rows = cur.fetchall()
    finally:
        conn.close()
    mapping = {slug: ind for slug, ind in rows if slug}
    print(f"  {len(mapping):,} donors with DB industry  ({time.time() - t0:.1f}s)")
    return mapping


def main():
    db_map = load_db_industry_map()

    print(f"Loading {INDEX_FILE} …")
    with open(INDEX_FILE) as f:
        donors = json.load(f)
    print(f"  {len(donors):,} donors loaded")

    source_counts = Counter()
    for d in donors:
        slug = d.get('slug')
        db_ind = db_map.get(slug) if slug else None
        if db_ind:
            d['industry'] = db_ind
            source_counts['db'] += 1
        else:
            d['industry'] = classify_occupation(d.get('top_occupation') or '')
            source_counts['occupation'] += 1

    print(f"\nSource breakdown:  db={source_counts['db']:,}  occupation_fallback={source_counts['occupation']:,}")

    counts = Counter(d['industry'] for d in donors)
    print("\nIndustry distribution:")
    for industry, count in counts.most_common():
        print(f"  {industry:<30} {count:>8,}")

    print(f"\nWriting {INDEX_FILE} …")
    with open(INDEX_FILE, 'w') as f:
        json.dump(donors, f, separators=(',', ':'))

    print("Done.")


if __name__ == "__main__":
    main()
