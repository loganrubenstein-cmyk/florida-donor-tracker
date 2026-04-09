"""
36_add_industry_to_principals.py
Adds an 'industry' field to principals/index.json using NAICS code sector mapping.
"""

import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / 'public' / 'data'
PATH = DATA / 'principals' / 'index.json'

# NAICS prefix → industry bucket (most specific first)
NAICS_MAP = [
    # 4-digit prefixes (specific)
    ('5411', 'Legal'),
    ('5241', 'Finance & Insurance'),
    ('5221', 'Finance & Insurance'),
    ('5222', 'Finance & Insurance'),
    ('5223', 'Finance & Insurance'),
    ('6211', 'Healthcare'),
    ('6212', 'Healthcare'),
    ('6213', 'Healthcare'),
    ('6214', 'Healthcare'),
    ('6215', 'Healthcare'),
    ('6216', 'Healthcare'),
    ('6219', 'Healthcare'),
    ('6221', 'Healthcare'),
    ('6222', 'Healthcare'),
    ('6223', 'Healthcare'),
    ('6231', 'Healthcare'),
    ('6232', 'Healthcare'),
    ('6233', 'Healthcare'),
    ('6239', 'Healthcare'),
    ('6241', 'Healthcare'),
    ('6111', 'Education'),
    ('6112', 'Education'),
    ('6113', 'Education'),
    ('6114', 'Education'),
    ('6115', 'Education'),
    ('6116', 'Education'),
    ('6117', 'Education'),
    ('5311', 'Real Estate'),
    ('5312', 'Real Estate'),
    ('5313', 'Real Estate'),
    ('2361', 'Construction'),
    ('2362', 'Construction'),
    ('2371', 'Construction'),
    ('2372', 'Construction'),
    ('2373', 'Construction'),
    ('2374', 'Construction'),
    ('2379', 'Construction'),
    ('2381', 'Construction'),
    ('2382', 'Construction'),
    ('2383', 'Construction'),
    ('2389', 'Construction'),
    ('8139', 'Political / Lobbying'),  # Business/Professional Associations
    ('8132', 'Political / Lobbying'),
    ('8133', 'Political / Lobbying'),
    ('9211', 'Government & Public Service'),
    ('9212', 'Government & Public Service'),
    ('9213', 'Government & Public Service'),
    ('9221', 'Government & Public Service'),
    ('9231', 'Government & Public Service'),
    ('9241', 'Government & Public Service'),
    ('9251', 'Government & Public Service'),
    ('9261', 'Government & Public Service'),
    ('9271', 'Government & Public Service'),
    ('9281', 'Government & Public Service'),
    # 2-digit sector prefixes (broad)
    ('11', 'Agriculture'),
    ('21', 'Agriculture'),   # Mining/Oil/Gas — close enough for FL
    ('22', 'Business & Consulting'),  # Utilities
    ('23', 'Construction'),
    ('31', 'Business & Consulting'),  # Manufacturing
    ('32', 'Business & Consulting'),
    ('33', 'Business & Consulting'),
    ('42', 'Retail & Hospitality'),   # Wholesale
    ('44', 'Retail & Hospitality'),
    ('45', 'Retail & Hospitality'),
    ('48', 'Business & Consulting'),  # Transportation
    ('49', 'Business & Consulting'),
    ('51', 'Business & Consulting'),  # Information/Media
    ('52', 'Finance & Insurance'),
    ('53', 'Real Estate'),
    ('54', 'Business & Consulting'),  # Professional Services
    ('55', 'Business & Consulting'),
    ('56', 'Business & Consulting'),
    ('61', 'Education'),
    ('62', 'Healthcare'),
    ('71', 'Retail & Hospitality'),   # Arts/Entertainment
    ('72', 'Retail & Hospitality'),   # Accommodation/Food
    ('81', 'Political / Lobbying'),   # Associations
    ('92', 'Government & Public Service'),
]

def classify_naics(code):
    if not code:
        return 'Other'
    code = str(code).strip()
    for prefix, bucket in NAICS_MAP:
        if code.startswith(prefix):
            return bucket
    return 'Other'

print(f"Loading {PATH} …")
with open(PATH) as f:
    principals = json.load(f)

print(f"  {len(principals):,} principals")

for p in principals:
    p['industry'] = classify_naics(p.get('naics', ''))

from collections import Counter
counts = Counter(p['industry'] for p in principals)
print("\nIndustry breakdown:")
for ind, count in counts.most_common():
    print(f"  {ind:<35} {count:>6,}")

print(f"\nWriting {PATH} …")
with open(PATH, 'w') as f:
    json.dump(principals, f, separators=(',', ':'))

print("Done.")
