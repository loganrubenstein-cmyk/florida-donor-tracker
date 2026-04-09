"""
31_export_connection_pages.py
Splits entity_connections_full.json into:
  - public/data/connections_pages/page_NNN.json  (2000 rows each, sorted by score desc)
  - public/data/connections_pages/by_committee/ACCT.json  (top 50 per committee)
"""

import json, os, math

DATA    = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
SRC     = os.path.join(DATA, 'entity_connections_full.json')
OUT_DIR = os.path.join(DATA, 'connections_pages')
COMM_DIR = os.path.join(OUT_DIR, 'by_committee')
PAGE_SIZE = 2000

os.makedirs(OUT_DIR,  exist_ok=True)
os.makedirs(COMM_DIR, exist_ok=True)

print("Loading entity_connections_full.json …")
with open(SRC) as f:
    full = json.load(f)

connections = full['connections']
total = len(connections)
print(f"  {total:,} connections loaded")

# ── Paginated pages ──────────────────────────────────────────────────────────
total_pages = math.ceil(total / PAGE_SIZE)
for i in range(total_pages):
    page_connections = connections[i * PAGE_SIZE:(i + 1) * PAGE_SIZE]
    page_data = {
        'page':              i + 1,
        'total_pages':       total_pages,
        'total_connections': total,
        'threshold':         full.get('threshold', 1),
        'connections':       page_connections,
    }
    path = os.path.join(OUT_DIR, f'page_{i + 1:03d}.json')
    with open(path, 'w') as f:
        json.dump(page_data, f, separators=(',', ':'))

print(f"  Wrote {total_pages} paginated files ({PAGE_SIZE} rows each)")

# Write index metadata file
index_meta = {
    'total_connections': total,
    'total_pages':       total_pages,
    'page_size':         PAGE_SIZE,
    'threshold':         full.get('threshold', 1),
}
with open(os.path.join(OUT_DIR, 'index.json'), 'w') as f:
    json.dump(index_meta, f, indent=2)

# ── Per-committee files ──────────────────────────────────────────────────────
by_committee = {}
for conn in connections:
    for side in ('entity_a', 'entity_b'):
        acct = conn.get(side, {}).get('acct_num')
        if acct:
            if acct not in by_committee:
                by_committee[acct] = []
            by_committee[acct].append(conn)

for acct_num, conns in by_committee.items():
    sorted_conns = sorted(conns, key=lambda x: x.get('connection_score', 0), reverse=True)
    path = os.path.join(COMM_DIR, f'{acct_num}.json')
    with open(path, 'w') as f:
        json.dump(sorted_conns[:50], f, separators=(',', ':'))

print(f"  Wrote {len(by_committee):,} per-committee files (top 50 each)")
print("Done.")
