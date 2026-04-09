"""
33_export_industry_donors.py
Reads donors/index.json (which now has 'industry' field from script 32)
and writes per-industry top-donor files to public/data/industry_donors/.
"""

import json, os, re
from pathlib import Path
from collections import defaultdict

DATA    = Path(__file__).resolve().parent.parent / 'public' / 'data'
SRC     = DATA / 'donors' / 'index.json'
OUT_DIR = DATA / 'industry_donors'
TOP_N   = 100

os.makedirs(OUT_DIR, exist_ok=True)

def slugify(s):
    s = str(s).lower().strip()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    return s.strip('-')

print(f"Loading {SRC} …")
with open(SRC) as f:
    donors = json.load(f)

print(f"  {len(donors):,} donors")

by_industry = defaultdict(list)
for d in donors:
    ind = d.get('industry') or 'Other'
    if d.get('total_combined', 0) > 0:
        by_industry[ind].append(d)

print(f"  {len(by_industry)} industries found")

for industry, ind_donors in sorted(by_industry.items(), key=lambda x: -len(x[1])):
    top = sorted(ind_donors, key=lambda x: x.get('total_combined', 0), reverse=True)[:TOP_N]
    slug = slugify(industry)
    path = OUT_DIR / f'{slug}.json'
    out = {
        'industry':     industry,
        'slug':         slug,
        'total_donors': len(ind_donors),
        'top_donors':   top,
    }
    with open(path, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print(f"  {industry:<35} {len(ind_donors):>8,} donors → {path.name}")

# Write index of all industries
index = [
    {
        'industry':     industry,
        'slug':         slugify(industry),
        'total_donors': len(ind_donors),
        'top_total':    sorted(ind_donors, key=lambda x: x.get('total_combined', 0), reverse=True)[0].get('total_combined', 0) if ind_donors else 0,
    }
    for industry, ind_donors in by_industry.items()
]
index.sort(key=lambda x: -x['total_donors'])
with open(OUT_DIR / 'index.json', 'w') as f:
    json.dump(index, f, indent=2)

print(f"\nWrote {len(by_industry)} industry files + index.json")
print("Done.")
