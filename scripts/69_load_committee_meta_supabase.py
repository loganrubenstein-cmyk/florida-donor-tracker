"""
Script 69: Load committee_meta from committees.csv into Supabase.

Populates chair_name, treasurer_name, and address_line for use in the
connections page (surfacing "Shared treasurer: Amy Rose" instead of just
showing a boolean flag).

Usage:
    python scripts/69_load_committee_meta_supabase.py
"""

import csv
import os
import sys
from io import StringIO
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

DB_URL   = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set in .env.local")

CSV_PATH = Path(__file__).resolve().parent.parent / "data" / "processed" / "committees.csv"
if not CSV_PATH.exists():
    sys.exit(f"ERROR: {CSV_PATH} not found")


def build_name(first, middle, last):
    parts = [p.strip().title() for p in [first, middle, last] if p and p.strip()]
    return " ".join(parts) or None


def build_address(row):
    parts = [row.get("addr1", ""), row.get("city", ""), row.get("state", ""), row.get("zip", "")]
    parts = [p.strip() for p in parts if p and p.strip()]
    return ", ".join(parts) or None


def main():
    print("=== Script 69: Load committee_meta → Supabase ===\n")

    rows = []
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            chair_name     = build_name(r.get("chair_first"), r.get("chair_middle"), r.get("chair_last"))
            treasurer_name = build_name(r.get("treasurer_first"), r.get("treasurer_middle"), r.get("treasurer_last"))
            address_line   = build_address(r)
            rows.append((
                r["acct_num"].strip(),
                r.get("committee_name", "").strip(),
                r.get("type_code", "").strip(),
                r.get("type_desc", "").strip(),
                r.get("addr1", "").strip(),
                r.get("addr2", "").strip(),
                r.get("city", "").strip(),
                r.get("state", "").strip(),
                r.get("zip", "").strip(),
                r.get("county", "").strip(),
                r.get("phone", "").strip(),
                chair_name,
                treasurer_name,
                address_line,
            ))

    print(f"Loaded {len(rows):,} committees from CSV")

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True

    with conn.cursor() as cur:
        cur.execute("TRUNCATE TABLE committee_meta RESTART IDENTITY")

        buf = StringIO()
        for r in rows:
            # Escape None as \N (Postgres COPY null)
            line = "\t".join("\\N" if v is None else v.replace("\t", " ").replace("\n", " ") for v in r)
            buf.write(line + "\n")
        buf.seek(0)

        cur.copy_expert(
            "COPY committee_meta (acct_num, committee_name, type_code, type_desc, "
            "addr1, addr2, city, state, zip, county, phone, chair_name, treasurer_name, address_line) "
            "FROM STDIN WITH (FORMAT text, NULL '\\N')",
            buf,
        )

    conn.close()
    print(f"Done. {len(rows):,} rows loaded into committee_meta.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
