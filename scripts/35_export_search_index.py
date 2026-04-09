"""
35_export_search_index.py
Builds split cross-entity search indexes:
  search_index_meta.json  — committees, candidates, lobbyists, principals (~0.8MB, fast)
  search_index_donors.json — donors only (~7MB, background load)
Schema: [{id, n, t, u, s}]
"""

import json, os
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / 'public' / 'data'

def add(entries, id_, name, type_, url, sub=''):
    entries.append({'id': id_, 'n': name, 't': type_, 'u': url, 's': sub})

donor_entries = []
meta_entries  = []

# ── Donors (44K with profiles) ────────────────────────────────────────────
print("Loading donors …")
with open(DATA / 'donors' / 'index_lite.json') as f:
    donors = json.load(f)
for d in donors:
    sub = ''
    if d.get('top_location'):
        sub = d['top_location'].strip()
    if d.get('industry') and d['industry'] not in ('Not Employed', 'Other'):
        sub = d['industry'] + (f' · {sub}' if sub else '')
    add(donor_entries, d['slug'], d['name'], 'donor', f"/donor/{d['slug']}", sub)
print(f"  {len(donors):,} donors")

# ── Committees ────────────────────────────────────────────────────────────
print("Loading committees …")
with open(DATA / 'committees' / 'index.json') as f:
    committees = json.load(f)
for c in committees:
    add(meta_entries, f"c_{c['acct_num']}", c['committee_name'], 'committee', f"/committee/{c['acct_num']}", '')
print(f"  {len(committees):,} committees")

# ── Candidates ────────────────────────────────────────────────────────────
print("Loading candidates …")
with open(DATA / 'candidate_stats.json') as f:
    candidates = json.load(f)
for c in candidates:
    sub = f"{c.get('office_desc','') or ''} {c.get('election_year','') or ''}".strip()
    add(meta_entries, f"cand_{c['acct_num']}", c['candidate_name'], 'candidate', f"/candidate/{c['acct_num']}", sub)
print(f"  {len(candidates):,} candidates")

# ── Lobbyists ─────────────────────────────────────────────────────────────
print("Loading lobbyists …")
with open(DATA / 'lobbyists' / 'index.json') as f:
    lobbyists = json.load(f)
for l in lobbyists:
    sub = l.get('firm') or l.get('city') or ''
    add(meta_entries, l['slug'], l['name'], 'lobbyist', f"/lobbyist/{l['slug']}", sub)
print(f"  {len(lobbyists):,} lobbyists")

# ── Principals ────────────────────────────────────────────────────────────
print("Loading principals …")
with open(DATA / 'principals' / 'index.json') as f:
    principals = json.load(f)
for p in principals:
    sub = p.get('city') or ''
    add(meta_entries, p['slug'], p['name'], 'principal', f"/principal/{p['slug']}", sub)
print(f"  {len(principals):,} principals")

# ── Write ─────────────────────────────────────────────────────────────────
out_meta   = DATA / 'search_index_meta.json'
out_donors = DATA / 'search_index_donors.json'

with open(out_meta, 'w') as f:
    json.dump(meta_entries, f, separators=(',', ':'))
with open(out_donors, 'w') as f:
    json.dump(donor_entries, f, separators=(',', ':'))

meta_mb   = os.path.getsize(out_meta)   / 1_048_576
donors_mb = os.path.getsize(out_donors) / 1_048_576
print(f"\nWritten: {out_meta.name} ({meta_mb:.2f} MB)  —  {len(meta_entries):,} entries")
print(f"Written: {out_donors.name} ({donors_mb:.1f} MB)  —  {len(donor_entries):,} entries")
print("Done.")
