"""
38_add_top_committees_to_principals.py

For each lobbying principal, builds "top_committees" — which committees received
the most donation money from the principal's matched contributors.

Data source: public/data/committees/*.lobbyists.json sidecar files, which already
have per-committee donation totals per principal.

Adds `top_committees: [{acct_num, name, total, num_contributions}]` (top 25)
to each individual principal profile JSON.
"""

import json
from collections import defaultdict
from pathlib import Path

DATA    = Path(__file__).resolve().parent.parent / 'public' / 'data'
COMM    = DATA / 'committees'
PRI_DIR = DATA / 'principals'

def slugify(name):
    import re
    s = str(name).lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_]+", "-", s).strip("-")
    return re.sub(r"-{2,}", "-", s)[:120]

# ── Load committee names from index ───────────────────────────────────────
print("Loading committee index …")
with open(COMM / 'index.json') as f:
    comm_index = json.load(f)
committee_names = {}
for c in comm_index:
    acct = str(c['acct_num'])
    name = (c.get('committee_name') or '').strip()
    if name and acct not in committee_names:
        committee_names[acct] = name
print(f"  {len(committee_names):,} committees with names")

# ── Scan all sidecar files: build principal → {acct → {total, count}} ────
print("Scanning sidecar files …")
# {principal_name → {acct_num → {'total': float, 'count': int}}}
principal_comm_totals = defaultdict(lambda: defaultdict(lambda: {'total': 0.0, 'count': 0}))

sidecars = sorted(COMM.glob('*.lobbyists.json'))
print(f"  {len(sidecars):,} sidecar files")

for i, path in enumerate(sidecars):
    if i % 200 == 0:
        print(f"  {i:,} / {len(sidecars):,} …")
    try:
        data = json.loads(path.read_text())
    except Exception:
        continue

    acct = str(data.get('acct_num', path.stem.split('.')[0]))

    for alert in data.get('connection_alerts', []):
        pname = alert.get('principal_name', '').strip()
        if not pname:
            continue
        total = float(alert.get('total_donated', 0) or 0)
        count = int(alert.get('num_contributions', 0) or 0)
        principal_comm_totals[pname][acct]['total'] += total
        principal_comm_totals[pname][acct]['count'] += count

print(f"  {len(principal_comm_totals):,} principals found across sidecars")

# ── Write top_committees to each principal profile ─────────────────────────
print("Writing to principal profiles …")
updated = skipped = 0

for pname, acct_map in principal_comm_totals.items():
    slug = slugify(pname)
    path = PRI_DIR / f"{slug}.json"
    if not path.exists():
        skipped += 1
        continue

    top = sorted(acct_map.items(), key=lambda x: -x[1]['total'])[:25]
    top_committees = [
        {
            'acct_num':         acct,
            'name':             committee_names.get(acct, f'Committee {acct}'),
            'total':            round(entry['total'], 2),
            'num_contributions': entry['count'],
        }
        for acct, entry in top
        if entry['total'] > 0
    ]

    with open(path) as f:
        profile = json.load(f)

    profile['top_committees'] = top_committees

    with open(path, 'w') as f:
        json.dump(profile, f, indent=2, default=str)

    updated += 1

print(f"  Updated {updated:,} profiles ({skipped} had no profile file)")
print("Done.")
