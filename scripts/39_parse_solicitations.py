"""
Script 39: Parse FL Public Solicitations XLS and export JSON data.

Source: FL Division of Elections — Public Solicitations report
        ~/Downloads/SolicitationsReport.xls

Outputs:
  public/data/solicitations/index.json        — all 1,060 records (for /solicitations page)
  public/data/solicitations/by_name.json      — normalized-name lookup for committee enrichment

Each record:
  id, organization, type, org_type, withdrawn, file_date,
  solicitors[], website, address, phone, source_url
"""

import json, re, os
from pathlib import Path
from collections import defaultdict

try:
    import xlrd
except ImportError:
    print("ERROR: xlrd not installed. Run: pip install xlrd")
    raise

# ── Config ────────────────────────────────────────────────────────────────────
XLS_PATH  = Path.home() / 'Downloads' / 'SolicitationsReport.xls'
OUT_DIR   = Path(__file__).parent.parent / 'public' / 'data' / 'solicitations'
SOURCE_URL = 'https://dos.fl.gov/elections/political-activities/registration/'

# ── Normalize name for matching ────────────────────────────────────────────────
def norm(s):
    return re.sub(r'[^A-Z0-9]', '', str(s).upper())

def clean_website(url):
    """Normalise to a proper URL with https://"""
    url = url.strip()
    if not url:
        return ''
    # Basic sanity: must contain a dot and no spaces in the domain part
    if ' ' in url.split('/')[0]:
        return ''
    if not url.startswith('http'):
        url = 'https://' + url
    return url

# ── Parse XLS ────────────────────────────────────────────────────────────────
print(f"Reading {XLS_PATH} ...")
wb   = xlrd.open_workbook(str(XLS_PATH))
sheet = wb.sheets()[0]
print(f"  {sheet.nrows} rows, {sheet.ncols} cols")

records = []
current = {}

for r in range(9, sheet.nrows):
    row = [str(sheet.cell_value(r, c)).strip() for c in range(sheet.ncols)]
    id_val = row[1]

    # ── New record block: numeric ID in col 1 ─────────────────────────────────
    if id_val and re.match(r'^\d+\.0$', id_val):
        if current:
            records.append(current)
        current = {
            'id':           int(float(id_val)),
            'type':         row[7].replace('\n', ' ').strip(),
            'file_date':    row[9],
            'withdrawn':    row[10] == 'YES',
            'organization': row[13].strip(),
            'solicitors':   [],
            'website':      '',
            'address':      '',
            'phone':        '',
            'org_type':     '',
        }
        continue

    if not current:
        continue

    cell = row[3]  # main data cell

    # Solicitor name: starts with title prefix
    if cell and any(cell.startswith(p) for p in ['Mr.', 'Ms.', 'Dr.', 'The Hon', 'Mrs.']):
        name = re.sub(r'\s+', ' ', cell).strip()
        if name not in current['solicitors']:
            current['solicitors'].append(name)
        continue

    # Address block: contains FL zip pattern
    if cell and re.search(r',\s*FL\s+\d{5}', cell):
        parts = cell.split('\n')
        current['address'] = ' '.join(parts[:-1]).strip() if len(parts) > 1 else cell
        current['phone']   = parts[-1].strip() if len(parts) > 1 else ''
        # Org type in col 13 on this same row
        if row[13] and not current['org_type']:
            current['org_type'] = row[13].replace('\n', ' ').strip()
        continue

    # Website: short string with a dot, no FL zip pattern, no spaces in domain
    if (cell
            and '.' in cell
            and '\n' not in cell
            and not current['website']
            and len(cell) < 120
            and 'FL' not in cell
            and not cell[0].isdigit()
            and ' ' not in cell.split('/')[0]):  # no space in domain portion
        current['website'] = clean_website(cell)

if current:
    records.append(current)

# ── Deduplicate by ID (merge multiple solicitor blocks) ───────────────────────
by_id = {}
for rec in records:
    sid = rec['id']
    if sid not in by_id:
        by_id[sid] = rec
    else:
        for s in rec['solicitors']:
            if s not in by_id[sid]['solicitors']:
                by_id[sid]['solicitors'].append(s)
        if rec['website'] and not by_id[sid]['website']:
            by_id[sid]['website'] = rec['website']
        if rec['address'] and not by_id[sid]['address']:
            by_id[sid]['address'] = rec['address']
        if rec['org_type'] and not by_id[sid]['org_type']:
            by_id[sid]['org_type'] = rec['org_type']

unique = sorted(by_id.values(), key=lambda x: x['id'])
print(f"  {len(unique)} unique solicitation IDs")

# Add source_url to all records
for rec in unique:
    rec['source_url'] = SOURCE_URL

# ── Stats ─────────────────────────────────────────────────────────────────────
active    = sum(1 for r in unique if not r['withdrawn'])
with_site = sum(1 for r in unique if r['website'])
print(f"  Active: {active}  |  With website: {with_site}")

# ── Build name lookup ─────────────────────────────────────────────────────────
by_name = {}
for rec in unique:
    key = norm(rec['organization'])
    if key:
        # Keep the one with a website if there's a collision
        if key not in by_name or (rec['website'] and not by_name[key]['website']):
            by_name[key] = rec

print(f"  Name lookup: {len(by_name)} entries")

# ── Write output ─────────────────────────────────────────────────────────────
OUT_DIR.mkdir(parents=True, exist_ok=True)

index_path   = OUT_DIR / 'index.json'
by_name_path = OUT_DIR / 'by_name.json'

with open(index_path, 'w') as f:
    json.dump(unique, f, indent=2)
print(f"Wrote {index_path}  ({index_path.stat().st_size // 1024}KB)")

with open(by_name_path, 'w') as f:
    json.dump(by_name, f, indent=2)
print(f"Wrote {by_name_path}  ({by_name_path.stat().st_size // 1024}KB)")

# ── Sample output ─────────────────────────────────────────────────────────────
print("\nSample records (with website):")
for r in [x for x in unique if x['website']][:5]:
    print(f"  [{r['id']:5d}] {r['organization'][:45]:45s}  {r['website']}")
