"""
scripts/68_load_bill_disclosures_supabase.py
---------------------------------------------
Loads FL lobbyist bill disclosure data into Supabase.

Creates:  bill_disclosures  (68,785 rows)
  bill_slug TEXT   — filename slug (matches top_bills.json + URL params)
  bill_canon TEXT  — canonical bill number display
  lobbyist  TEXT
  principal TEXT
  firm      TEXT
  issues    TEXT   — JSON array
  year      INTEGER

Reads from: public/data/lobbyist_disclosures/by_bill/*.json
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
BILLS_DIR = ROOT / 'public' / 'data' / 'lobbyist_disclosures' / 'by_bill'

conn = psycopg2.connect(DB_URL)
conn.autocommit = True
cur = conn.cursor()

print("── Creating bill_disclosures table ────────────────────────────────────")
cur.execute("DROP TABLE IF EXISTS bill_disclosures")
cur.execute("""
    CREATE TABLE bill_disclosures (
        id         SERIAL PRIMARY KEY,
        bill_slug  TEXT,
        bill_canon TEXT,
        lobbyist   TEXT,
        principal  TEXT,
        firm       TEXT,
        issues     TEXT,
        year       INTEGER
    )
""")
cur.execute("CREATE INDEX bill_disclosures_slug_idx ON bill_disclosures (bill_slug)")
cur.execute("CREATE INDEX bill_disclosures_year_idx ON bill_disclosures (year)")
print("  Table created with slug + year indexes")

print("\n── Loading bill JSON files ─────────────────────────────────────────────")
files = sorted(BILLS_DIR.glob('*.json'))
total_rows = 0
buf = io.StringIO()

def esc(v):
    if v is None: return r'\N'
    return str(v).replace('\t', ' ').replace('\n', ' ').replace('\\', '\\\\')

t0 = time.time()
for f in files:
    slug = f.stem
    try:
        entries = json.loads(f.read_text())
        if not isinstance(entries, list): continue
        for e in entries:
            issues_json = json.dumps(e.get('issues') or [])
            buf.write('\t'.join([
                esc(slug),
                esc(e.get('bill_canon')),
                esc(e.get('lobbyist')),
                esc(e.get('principal')),
                esc(e.get('firm')),
                esc(issues_json),
                esc(e.get('year')),
            ]) + '\n')
            total_rows += 1
    except Exception as ex:
        print(f"  SKIP {f.name}: {ex}")

buf.seek(0)
cur.copy_expert(
    "COPY bill_disclosures (bill_slug, bill_canon, lobbyist, principal, firm, issues, year) FROM STDIN",
    buf
)

elapsed = time.time() - t0
print(f"  Loaded {total_rows:,} rows from {len(files):,} files in {elapsed:.1f}s")

print("\n── Spot check ─────────────────────────────────────────────────────────")
cur.execute("SELECT bill_slug, bill_canon, COUNT(*) as entries FROM bill_disclosures GROUP BY bill_slug, bill_canon ORDER BY entries DESC LIMIT 5")
for r in cur.fetchall():
    print(f"  {r[0]:40s}  {r[2]:4d} entries  [{r[1]}]")

print("\n✓ Done")
conn.close()
