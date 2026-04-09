"""
37_add_industry_to_principal_profiles.py
Reads industry from principals/index.json and writes it into each
individual principal profile JSON (since script 36 only updated the index).
"""

import json
from pathlib import Path

DATA       = Path(__file__).resolve().parent.parent / 'public' / 'data'
INDEX_PATH = DATA / 'principals' / 'index.json'
PROF_DIR   = DATA / 'principals'

print(f"Loading index …")
with open(INDEX_PATH) as f:
    index = json.load(f)

# Build slug → industry map from index
slug_to_industry = {p['slug']: p.get('industry', 'Other') for p in index}
print(f"  {len(slug_to_industry):,} principals in index")

updated = 0
skipped = 0

for path in PROF_DIR.glob('*.json'):
    if path.name == 'index.json':
        continue
    try:
        with open(path) as f:
            profile = json.load(f)
    except Exception:
        skipped += 1
        continue

    slug = profile.get('slug') or path.stem
    industry = slug_to_industry.get(slug, 'Other')

    if profile.get('industry') == industry:
        continue  # already up to date

    profile['industry'] = industry
    with open(path, 'w') as f:
        json.dump(profile, f, indent=2, default=str)
    updated += 1

print(f"  Updated {updated:,} profile files ({skipped} skipped)")
print("Done.")
