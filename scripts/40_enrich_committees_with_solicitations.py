"""
Script 40: Enrich committee profiles with FL Public Solicitations data.

Reads:  public/data/solicitations/by_name.json
        public/data/solicitations/index.json
        public/data/committees/*.json       (individual profiles)
        public/data/committees/index.json

Adds to each matched committee profile:
  solicitation_id     int
  solicitation_type   str   (e.g. "Candidate (Legislative)")
  org_type            str   (e.g. "527 Established/Controlled")
  solicitors          [str]
  website_url         str
  solicitation_active bool
  solicitation_file_date str

Also updates committees/index.json to include website_url per entry.
"""

import json, re
from pathlib import Path

BASE   = Path(__file__).parent.parent / 'public' / 'data'
SOL_BY_NAME = BASE / 'solicitations' / 'by_name.json'
COMM_DIR    = BASE / 'committees'

def norm(s):
    return re.sub(r'[^A-Z0-9]', '', str(s).upper())

# ── Load solicitations ─────────────────────────────────────────────────────────
by_name = json.load(open(SOL_BY_NAME))
print(f"Solicitations by name: {len(by_name)} entries")

# ── Update committee index ──────────────────────────────────────────────────────
index_path = COMM_DIR / 'index.json'
comm_index = json.load(open(index_path))

index_updated = 0
for entry in comm_index:
    key = norm(entry.get('committee_name', ''))
    if key in by_name:
        sol = by_name[key]
        entry['website_url']         = sol.get('website', '')
        entry['solicitation_id']     = sol.get('id')
        entry['solicitation_active'] = not sol.get('withdrawn', True)
        index_updated += 1

with open(index_path, 'w') as f:
    json.dump(comm_index, f, indent=2)
print(f"Updated committee index: {index_updated} entries enriched")

# ── Update individual committee profiles ───────────────────────────────────────
profile_files = sorted(COMM_DIR.glob('*.json'))
# Exclude index itself
profile_files = [p for p in profile_files if p.name != 'index.json']

updated = 0
no_match = 0

for path in profile_files:
    try:
        data = json.load(open(path))
    except Exception:
        continue

    name = data.get('committee_name', '')
    key  = norm(name)

    if key in by_name:
        sol = by_name[key]
        data['solicitation_id']     = sol.get('id')
        data['solicitation_type']   = sol.get('type', '')
        data['org_type']            = sol.get('org_type', '')
        data['solicitors']          = sol.get('solicitors', [])
        data['website_url']         = sol.get('website', '')
        data['solicitation_active'] = not sol.get('withdrawn', True)
        data['solicitation_file_date'] = sol.get('file_date', '')
        with open(path, 'w') as f:
            json.dump(data, f, indent=2)
        updated += 1
    else:
        no_match += 1

print(f"Profiles updated: {updated}")
print(f"No solicitation match: {no_match}")

# ── Sample enriched data ───────────────────────────────────────────────────────
print("\nSample enriched committees (with website):")
for entry in comm_index:
    if entry.get('website_url'):
        print(f"  {entry['committee_name'][:50]:50s}  {entry['website_url']}")
        if sum(1 for e in comm_index if e.get('website_url')) > 5:
            break
