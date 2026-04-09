"""
Script 64: Load committee expenditure data into Supabase.

Creates (if needed) and populates two tables:
  committee_expenditure_summary  — one row per committee: total_spent, num_expenditures, date range
  committee_top_vendors          — top vendors per committee

Reads from:
  public/data/expenditures/by_committee/{acct_num}.json  (produced by script 34)

Usage:
    python scripts/64_load_committee_expenditures_supabase.py
"""

import json
import os
import sys
from io import StringIO
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set in .env.local")

BY_COMM_DIR = Path(__file__).resolve().parent.parent / "public" / "data" / "expenditures" / "by_committee"
if not BY_COMM_DIR.exists():
    sys.exit(f"ERROR: {BY_COMM_DIR} not found. Run script 34 first.")

DDL = """
CREATE TABLE IF NOT EXISTS committee_expenditure_summary (
  id               bigint generated always as identity primary key,
  acct_num         text not null unique,
  total_spent      numeric(15,2) default 0,
  num_expenditures integer default 0,
  date_start       date,
  date_end         date
);

CREATE TABLE IF NOT EXISTS committee_top_vendors (
  id                      bigint generated always as identity primary key,
  acct_num                text not null,
  vendor_name             text,
  vendor_name_normalized  text,
  total_amount            numeric(15,2),
  num_payments            integer,
  pct                     numeric(6,2)
);

CREATE INDEX IF NOT EXISTS idx_comm_exp_summary_acct ON committee_expenditure_summary(acct_num);
CREATE INDEX IF NOT EXISTS idx_comm_top_vendors_acct  ON committee_top_vendors(acct_num);
"""


def tsv_row(values):
    parts = []
    for v in values:
        if v is None:
            parts.append("")
        else:
            parts.append(str(v).replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n"))
    return "\t".join(parts) + "\n"


def main() -> int:
    print("=== Script 64: Load Committee Expenditures → Supabase ===\n")

    files = sorted(BY_COMM_DIR.glob("*.json"))
    print(f"Found {len(files):,} by_committee JSON files")

    summary_rows = []
    vendor_rows  = []

    for f in files:
        try:
            d = json.loads(f.read_text())
        except Exception:
            continue

        acct = str(d.get("acct_num", "")).strip()
        if not acct:
            continue

        dr = d.get("date_range", {}) or {}
        summary_rows.append((
            acct,
            d.get("total_spent", 0.0) or 0.0,
            d.get("num_expenditures", 0) or 0,
            dr.get("start") or None,
            dr.get("end")   or None,
        ))

        for v in d.get("top_vendors", []):
            vendor_rows.append((
                acct,
                v.get("vendor_name", ""),
                v.get("vendor_name_normalized", ""),
                v.get("total_amount", 0.0) or 0.0,
                v.get("num_payments", 0) or 0,
                v.get("pct", 0.0) or 0.0,
            ))

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True

    with conn.cursor() as cur:
        cur.execute("SET statement_timeout = 0")

        print("Creating tables if needed...")
        cur.execute(DDL)

        print("Truncating existing data...")
        cur.execute("TRUNCATE TABLE committee_top_vendors, committee_expenditure_summary RESTART IDENTITY")

        print(f"Loading {len(summary_rows):,} summary rows...")
        buf = StringIO()
        for row in summary_rows:
            buf.write(tsv_row(row))
        buf.seek(0)
        cur.copy_expert(
            "COPY committee_expenditure_summary "
            "(acct_num, total_spent, num_expenditures, date_start, date_end) "
            "FROM STDIN WITH (FORMAT text, NULL '')",
            buf,
        )

        print(f"Loading {len(vendor_rows):,} vendor rows...")
        buf2 = StringIO()
        for row in vendor_rows:
            buf2.write(tsv_row(row))
        buf2.seek(0)
        cur.copy_expert(
            "COPY committee_top_vendors "
            "(acct_num, vendor_name, vendor_name_normalized, total_amount, num_payments, pct) "
            "FROM STDIN WITH (FORMAT text, NULL '')",
            buf2,
        )

    conn.close()

    total_spent = sum(r[1] for r in summary_rows)
    print(f"\nDone.")
    print(f"  committee_expenditure_summary: {len(summary_rows):,} committees, ${total_spent:,.0f} total")
    print(f"  committee_top_vendors:         {len(vendor_rows):,} rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
