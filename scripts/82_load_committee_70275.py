"""
Script 82: Load contribution + expenditure data for committee 70275
(Friends of Ron DeSantis / Empower Parents PAC)

Reads:
  ~/Downloads/'Contrib (1).txt'  — 76,479 contribution rows
  ~/Downloads/'Expend.txt'       — 1,205 expenditure rows

Writes to Supabase:
  - committees: update num_contributions, date_start, date_end
  - committee_top_donors: top 25 donors for acct 70275
  - committee_expenditure_summary: total_spent, num_expenditures, date_start, date_end
  - committee_top_vendors: top 20 vendors with pct

Usage:
    .venv/bin/python scripts/82_load_committee_70275.py
"""

import csv
import collections
import os
import re
import sys
from datetime import datetime
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")
ROOT = Path(__file__).resolve().parent.parent
DL   = Path.home() / "Downloads"

CONTRIB_FILE = DL / "'Contrib (1).txt'"
EXPEND_FILE  = DL / "'Expend.txt'"
ACCT_NUM     = "70275"

# ── Slugify (mirrors lib/slugify.js) ──────────────────────────────────────────

def slugify(name):
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-+", "-", s)
    return s.strip("-")

# ── Parse contributions ───────────────────────────────────────────────────────

print("Reading contributions...")
contrib_rows = []
with open(CONTRIB_FILE, encoding="latin-1") as f:
    for r in csv.DictReader(f, delimiter="\t"):
        contrib_rows.append(r)

print(f"  {len(contrib_rows):,} rows")

# Aggregate by donor name
by_donor = collections.defaultdict(lambda: {"total": 0.0, "n": 0, "type": "OTHER"})
contrib_dates = []
for r in contrib_rows:
    amt = float(r["Amount"].replace(",", "") or 0)
    by_donor[r["Contributor Name"]]["total"] += amt
    by_donor[r["Contributor Name"]]["n"] += 1
    typ = r.get("Typ", "").strip()
    by_donor[r["Contributor Name"]]["type"] = typ
    try:
        contrib_dates.append(datetime.strptime(r["Date"], "%m/%d/%Y"))
    except (ValueError, KeyError):
        pass

contrib_total = sum(d["total"] for d in by_donor.values())
contrib_start = min(contrib_dates).date() if contrib_dates else None
contrib_end   = max(contrib_dates).date() if contrib_dates else None
print(f"  Total received in file: ${contrib_total:,.2f}")
print(f"  Date range: {contrib_start} → {contrib_end}")

top_donors = sorted(by_donor.items(), key=lambda x: -x[1]["total"])[:25]

# ── Parse expenditures ────────────────────────────────────────────────────────

print("\nReading expenditures...")
expend_rows = []
with open(EXPEND_FILE, encoding="latin-1") as f:
    for r in csv.DictReader(f, delimiter="\t"):
        expend_rows.append(r)

print(f"  {len(expend_rows):,} rows")

by_vendor = collections.defaultdict(lambda: {"total": 0.0, "n": 0})
expend_dates = []
for r in expend_rows:
    amt = float(r["Amount"].replace(",", "") or 0)
    vendor = r["Expense Paid To"].strip()
    by_vendor[vendor]["total"] += amt
    by_vendor[vendor]["n"] += 1
    try:
        expend_dates.append(datetime.strptime(r["Date"], "%m/%d/%Y"))
    except (ValueError, KeyError):
        pass

expend_total = sum(d["total"] for d in by_vendor.values())
expend_start = min(expend_dates).date() if expend_dates else None
expend_end   = max(expend_dates).date() if expend_dates else None
print(f"  Total spent: ${expend_total:,.2f}")
print(f"  Date range: {expend_start} → {expend_end}")

top_vendors = sorted(by_vendor.items(), key=lambda x: -x[1]["total"])[:20]

# ── Supabase connection ───────────────────────────────────────────────────────

db_url = os.environ.get("SUPABASE_DB_URL")
if not db_url:
    sys.exit("SUPABASE_DB_URL not set in .env")

conn = psycopg2.connect(db_url)
conn.autocommit = True
cur = conn.cursor()

# ── 1. Update committees row ──────────────────────────────────────────────────

print(f"\nUpdating committees row for {ACCT_NUM}...")
cur.execute("""
    UPDATE committees
    SET num_contributions = %s,
        date_start        = %s,
        date_end          = %s
    WHERE acct_num = %s
""", (len(contrib_rows), contrib_start, contrib_end, ACCT_NUM))
print(f"  num_contributions = {len(contrib_rows):,}, date_start = {contrib_start}, date_end = {contrib_end}")

# ── 2. Load committee_top_donors ─────────────────────────────────────────────

print(f"\nLoading top {len(top_donors)} donors into committee_top_donors...")
cur.execute("DELETE FROM committee_top_donors WHERE acct_num = %s", (ACCT_NUM,))

for name, d in top_donors:
    cur.execute("""
        INSERT INTO committee_top_donors (acct_num, donor_name, donor_slug, total_amount, num_contributions, type)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (
        ACCT_NUM,
        name,
        slugify(name),
        round(d["total"], 2),
        d["n"],
        d["type"] or "OTHER",
    ))

print("  Done.")

# ── 3. Load committee_expenditure_summary ─────────────────────────────────────

print(f"\nLoading expenditure summary for {ACCT_NUM}...")
cur.execute("DELETE FROM committee_expenditure_summary WHERE acct_num = %s", (ACCT_NUM,))
cur.execute("""
    INSERT INTO committee_expenditure_summary (acct_num, total_spent, num_expenditures, date_start, date_end)
    VALUES (%s, %s, %s, %s, %s)
""", (ACCT_NUM, round(expend_total, 2), len(expend_rows), expend_start, expend_end))
print(f"  total_spent = ${expend_total:,.2f}, num_expenditures = {len(expend_rows):,}")

# ── 4. Load committee_top_vendors ─────────────────────────────────────────────

print(f"\nLoading top {len(top_vendors)} vendors into committee_top_vendors...")
cur.execute("DELETE FROM committee_top_vendors WHERE acct_num = %s", (ACCT_NUM,))

for vendor, d in top_vendors:
    pct = round(d["total"] / expend_total * 100, 2) if expend_total > 0 else 0
    cur.execute("""
        INSERT INTO committee_top_vendors (acct_num, vendor_name, vendor_name_normalized, total_amount, num_payments, pct)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (
        ACCT_NUM,
        vendor,
        vendor.upper(),
        round(d["total"], 2),
        d["n"],
        pct,
    ))

print("  Done.")

cur.close()
conn.close()
print("\n✓ Script 82 complete.")
