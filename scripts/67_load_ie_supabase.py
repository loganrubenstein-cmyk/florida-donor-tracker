"""
scripts/67_load_ie_supabase.py
---------------------------------
Loads independent expenditure / electioneering communication data into Supabase.

Creates two tables:
  ie_summary      — one row with global stats (total_amount, num_committees, etc.) + by_type JSON
  ie_committees   — one row per committee with rollup data

Reads from:
  public/data/ie/summary.json
  public/data/ie/by_committee/*.json
"""

import os, json, io, time
from pathlib import Path
import psycopg2

ROOT = Path(__file__).parent.parent
dotenv = ROOT / '.env.local'
for line in dotenv.read_text().split('\n'):
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1)
        os.environ.setdefault(k.strip(), v.strip())

DB_URL = os.environ['SUPABASE_DB_URL']
IE_DIR = ROOT / 'public' / 'data' / 'ie'

conn = psycopg2.connect(DB_URL)
conn.autocommit = True
cur = conn.cursor()

# ── ie_summary ─────────────────────────────────────────────────────────────
print("── Creating ie_summary ────────────────────────────────────────────────")
cur.execute("DROP TABLE IF EXISTS ie_summary")
cur.execute("""
    CREATE TABLE ie_summary (
        id             SERIAL PRIMARY KEY,
        total_amount   NUMERIC(14,2),
        total_rows     INTEGER,
        num_committees INTEGER,
        date_start     DATE,
        date_end       DATE,
        by_type        TEXT    -- JSON array
    )
""")

summary = json.loads((IE_DIR / 'summary.json').read_text())
cur.execute("""
    INSERT INTO ie_summary (total_amount, total_rows, num_committees, date_start, date_end, by_type)
    VALUES (%s, %s, %s, %s, %s, %s)
""", (
    summary.get('total_amount'),
    summary.get('total_rows'),
    summary.get('num_committees'),
    summary.get('date_range', {}).get('start'),
    summary.get('date_range', {}).get('end'),
    json.dumps(summary.get('by_type', [])),
))
print(f"  Inserted global summary row")

# ── ie_committees ───────────────────────────────────────────────────────────
print("\n── Creating ie_committees ─────────────────────────────────────────────")
cur.execute("DROP TABLE IF EXISTS ie_committees")
cur.execute("""
    CREATE TABLE ie_committees (
        acct_num        TEXT PRIMARY KEY,
        committee_name  TEXT,
        total_amount    NUMERIC(14,2),
        num_transactions INTEGER,
        date_start      DATE,
        date_end        DATE,
        year_min        INTEGER,
        year_max        INTEGER
    )
""")

files = sorted((IE_DIR / 'by_committee').glob('*.json'))
rows = []
for f in files:
    try:
        c = json.loads(f.read_text())
        by_year = c.get('by_year', [])
        year_min = by_year[0]['year']  if by_year else None
        year_max = by_year[-1]['year'] if by_year else None
        rows.append((
            str(c['acct_num']),
            c.get('committee_name'),
            c.get('total_amount'),
            c.get('num_transactions'),
            c.get('date_range', {}).get('start'),
            c.get('date_range', {}).get('end'),
            year_min,
            year_max,
        ))
    except Exception as e:
        print(f"  SKIP {f.name}: {e}")

buf = io.StringIO()
for r in rows:
    def fmt(v):
        if v is None: return r'\N'
        return str(v).replace('\t', ' ').replace('\n', ' ')
    buf.write('\t'.join(fmt(v) for v in r) + '\n')
buf.seek(0)

cur.copy_expert("COPY ie_committees (acct_num, committee_name, total_amount, num_transactions, date_start, date_end, year_min, year_max) FROM STDIN", buf)
print(f"  Loaded {len(rows)} committee rows")

# Spot check
cur.execute("SELECT acct_num, committee_name, total_amount FROM ie_committees ORDER BY total_amount DESC NULLS LAST LIMIT 5")
print("\nTop 5 IE committees:")
for r in cur.fetchall():
    print(f"  {r[0]:>7}  ${r[2]:>12,.0f}  {r[1]}")

print("\n✓ Done")
conn.close()
