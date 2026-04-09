"""
34_create_lean_donor_index.py
Creates donors/index_lite.json — a lean directory index containing only
donors with profile pages (total_combined >= $1,000, same threshold as script 25).
Drops fields not needed for directory display.

Fields kept: slug, name, is_corporate, total_soft, total_hard, total_combined,
             top_location, num_committees, has_lobbyist_link, industry
Fields dropped: num_contributions, top_occupation, num_candidates
"""

import json, os
from pathlib import Path

DATA  = Path(__file__).resolve().parent.parent / 'public' / 'data'
SRC   = DATA / 'donors' / 'index.json'
DEST  = DATA / 'donors' / 'index_lite.json'

MIN_TOTAL = 1_000   # must match script 25 MIN_TOTAL
KEEP      = {'slug','name','is_corporate','total_soft','total_hard',
             'total_combined','top_location','num_committees','has_lobbyist_link','industry'}

print(f"Loading {SRC} …")
with open(SRC) as f:
    donors = json.load(f)

src_size = os.path.getsize(SRC)
print(f"  Full index: {src_size / 1_048_576:.1f} MB, {len(donors):,} donors")

# Filter to donors with profile pages + drop unused fields
lite = [
    {k: v for k, v in d.items() if k in KEEP}
    for d in donors
    if (d.get('total_combined') or 0) >= MIN_TOTAL
]

print(f"Writing {DEST} …")
with open(DEST, 'w') as f:
    json.dump(lite, f, separators=(',', ':'))

dest_size = os.path.getsize(DEST)
print(f"  Lite index: {dest_size / 1_048_576:.1f} MB, {len(lite):,} donors with profiles")
print(f"  Size reduction: {100*(1-dest_size/src_size):.0f}%")
print("Done.")
