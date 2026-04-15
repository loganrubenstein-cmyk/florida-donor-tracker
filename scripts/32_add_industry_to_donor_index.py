"""
32_add_industry_to_donor_index.py
Reads public/data/donors/index.json and adds an 'industry' field to each
donor entry using the existing top_occupation field. Fast — no CSV reading.
"""

import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from industry_classifier import classify_occupation

DATA = Path(__file__).resolve().parent.parent / 'public' / 'data'
INDEX_FILE = DATA / 'donors' / 'index.json'

print(f"Loading {INDEX_FILE} …")
with open(INDEX_FILE) as f:
    donors = json.load(f)

print(f"  {len(donors):,} donors loaded")

for d in donors:
    occ = d.get('top_occupation') or ''
    d['industry'] = classify_occupation(occ)

# Stats
from collections import Counter
counts = Counter(d['industry'] for d in donors)
print("\nIndustry breakdown:")
for industry, count in counts.most_common():
    print(f"  {industry:<30} {count:>8,}")

print(f"\nWriting {INDEX_FILE} …")
with open(INDEX_FILE, 'w') as f:
    json.dump(donors, f, separators=(',', ':'))

print("Done.")
