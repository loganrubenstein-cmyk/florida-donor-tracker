"""
Script 83: Backfill contributions for committee 70275 (Friends of Ron DeSantis)
and update all affected donor aggregate tables.

Why this exists: 70275 was absent from the original registry download (script 02),
so script 03 never scraped it. The committee was later manually inserted into the
committees table with approximate totals, but the 76,479 contribution rows were
never loaded into the contributions table. This means ~$228M of donations were
invisible to donor profiles, the transaction explorer, and all aggregate tables.

Steps:
  1. Parse Contrib (1).txt (76,479 rows)
  2. Resolve donor_slug for each contributor name via donors table
  3. COPY rows into contributions table
  4. UPDATE donors.total_soft + total_combined for affected donors
  5. UPSERT donor_by_year for affected (donor_slug, year) pairs
  6. UPSERT donor_committees links to 70275

Usage:
    .venv/bin/python scripts/83_backfill_contributions_70275.py
"""

import csv
import io
import os
import re
import sys
import collections
from datetime import datetime
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")

DL           = Path.home() / "Downloads"
CONTRIB_FILE = DL / "'Contrib (1).txt'"
ACCT_NUM     = "70275"
COMMITTEE_NAME = "Friends of Ron DeSantis (now Empower Parents PAC)"


def normalize(name):
    return re.sub(r'\s+', ' ', (name or '').upper().strip())

def slugify(name):
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-+", "-", s)
    return s.strip("-")

def parse_date(s):
    try:
        return datetime.strptime(s.strip(), "%m/%d/%Y").date()
    except (ValueError, AttributeError):
        return None

# ── Connect ───────────────────────────────────────────────────────────────────

db_url = os.environ.get("SUPABASE_DB_URL")
if not db_url:
    sys.exit("SUPABASE_DB_URL not set in .env.local")

conn = psycopg2.connect(db_url)
conn.autocommit = False
cur = conn.cursor()
cur.execute("SET statement_timeout = 0")  # disable timeout for this backfill session

# ── Step 1: Parse the file ────────────────────────────────────────────────────

print("Parsing contributions file...")
raw_rows = []
with open(CONTRIB_FILE, encoding="latin-1") as f:
    for r in csv.DictReader(f, delimiter="\t"):
        raw_rows.append(r)
print(f"  {len(raw_rows):,} rows")

# ── Step 2: Load existing donor slugs from DB ─────────────────────────────────

print("Loading donor slug map from DB...")
cur.execute("SELECT slug, name FROM donors")
slug_by_norm = {}
for slug, name in cur.fetchall():
    slug_by_norm[normalize(name)] = slug
print(f"  {len(slug_by_norm):,} donors indexed")

# Assign slugs
def resolve_slug(contributor_name):
    norm = normalize(contributor_name)
    if norm in slug_by_norm:
        return slug_by_norm[norm]
    return slugify(contributor_name)  # fallback: computed slug (may not exist in donors)

# ── Step 3: Build contribution rows ──────────────────────────────────────────

print("Building contribution rows...")
contrib_rows = []
for r in raw_rows:
    d = parse_date(r.get("Date", ""))
    contrib_rows.append({
        "recipient_type":            "committee",
        "recipient_acct":            ACCT_NUM,
        "contributor_name":          r["Contributor Name"],
        "contributor_name_normalized": normalize(r["Contributor Name"]),
        "donor_slug":                resolve_slug(r["Contributor Name"]),
        "amount":                    float(r["Amount"].replace(",", "") or 0),
        "contribution_date":         d,
        "report_year":               int(r["Rpt Yr"]) if r.get("Rpt Yr") else None,
        "report_type":               r.get("Rpt Type", ""),
        "type_code":                 r.get("Typ", ""),
        "in_kind_description":       r.get("InKind Desc", "") or None,
        "contributor_address":       r.get("Address", "") or None,
        "contributor_city_state_zip": r.get("City State Zip", "") or None,
        "contributor_occupation":    r.get("Occupation", "") or None,
        "source_file":               "Contrib (1).txt",
    })

# ── Step 4: COPY into contributions ──────────────────────────────────────────

print("Loading into contributions table via COPY...")
cols = ["recipient_type","recipient_acct","contributor_name","contributor_name_normalized",
        "donor_slug","amount","contribution_date","report_year","report_type",
        "type_code","in_kind_description","contributor_address",
        "contributor_city_state_zip","contributor_occupation","source_file"]

buf = io.StringIO()
writer = csv.writer(buf)
for row in contrib_rows:
    writer.writerow([row[c] if row[c] is not None else "" for c in cols])
buf.seek(0)

cur.copy_expert(
    f"COPY contributions ({','.join(cols)}) FROM STDIN WITH (FORMAT csv, NULL '')",
    buf
)
print(f"  Inserted {len(contrib_rows):,} rows")

# ── Step 5: Aggregate by donor_slug for downstream updates ───────────────────

print("Aggregating by donor_slug...")

# Per-slug totals for this committee
by_slug = collections.defaultdict(lambda: {"total": 0.0, "n": 0, "years": collections.defaultdict(float)})
for r in contrib_rows:
    slug = r["donor_slug"]
    amt  = r["amount"]
    yr   = r["report_year"] or (r["contribution_date"].year if r["contribution_date"] else None)
    by_slug[slug]["total"] += amt
    by_slug[slug]["n"]     += 1
    if yr:
        by_slug[slug]["years"][yr] += amt

print(f"  {len(by_slug):,} distinct donor slugs")

# Only update donors that exist in the donors table
existing_slugs = set(slug_by_norm.values())
matched = {s: d for s, d in by_slug.items() if s in existing_slugs}
print(f"  {len(matched):,} matched to existing donor profiles")

# ── Step 6: Update donors table totals ───────────────────────────────────────

print("Updating donors.total_soft + total_combined...")
updated = 0
for slug, d in matched.items():
    cur.execute("""
        UPDATE donors
        SET total_soft        = total_soft + %s,
            total_combined    = total_combined + %s,
            num_contributions = num_contributions + %s
        WHERE slug = %s
    """, (d["total"], d["total"], d["n"], slug))
    updated += 1
print(f"  Updated {updated:,} donor rows")

# ── Step 7: Upsert donor_by_year ─────────────────────────────────────────────

print("Upserting donor_by_year...")
year_rows = 0
for slug, d in matched.items():
    for yr, amt in d["years"].items():
        cur.execute("""
            UPDATE donor_by_year
            SET soft  = soft  + %s,
                total = total + %s
            WHERE donor_slug = %s AND year = %s
        """, (amt, amt, slug, yr))
        if cur.rowcount == 0:
            cur.execute("""
                INSERT INTO donor_by_year (donor_slug, year, soft, hard, total)
                VALUES (%s, %s, %s, 0, %s)
            """, (slug, yr, amt, amt))
        year_rows += 1
print(f"  Upserted {year_rows:,} donor_by_year rows")

# ── Step 8: Upsert donor_committees ──────────────────────────────────────────

print("Upserting donor_committees (70275 links)...")
dc_rows = 0
for slug, d in matched.items():
    cur.execute(
        "UPDATE donor_committees SET total = total + %s, num_contributions = num_contributions + %s WHERE donor_slug = %s AND acct_num = %s",
        (d["total"], d["n"], slug, ACCT_NUM)
    )
    if cur.rowcount == 0:
        cur.execute(
            "INSERT INTO donor_committees (donor_slug, acct_num, committee_name, total, num_contributions) VALUES (%s, %s, %s, %s, %s)",
            (slug, ACCT_NUM, COMMITTEE_NAME, d["total"], d["n"])
        )
    dc_rows += 1
print(f"  Upserted {dc_rows:,} donor_committees rows")

# ── Commit ────────────────────────────────────────────────────────────────────

conn.commit()
cur.close()
conn.close()
print("\n✓ Script 83 complete.")
print(f"  {len(contrib_rows):,} contributions loaded")
print(f"  {updated:,} donor totals updated")
print(f"  {year_rows:,} year-bucket rows updated")
print(f"  {dc_rows:,} donor↔committee links added")
