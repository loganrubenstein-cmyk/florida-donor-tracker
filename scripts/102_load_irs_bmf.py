#!/usr/bin/env python3
"""
102_load_irs_bmf.py

Parse + load the downloaded IRS EO BMF files (from script 101) into the
irs_exempt_orgs table. Truncates first — idempotent rebuild.

Usage: .venv/bin/python -u scripts/102_load_irs_bmf.py
"""
import csv
import os
import re
import sys
import time
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

PROJECT = Path(__file__).resolve().parent.parent
SRC = PROJECT / "public" / "data" / "irs_bmf"
FILES = ["eo1.csv", "eo2.csv", "eo3.csv", "eo4.csv"]

DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set")


def normalize(raw: str) -> str:
    s = str(raw or "").upper()
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def parse_int(v):
    if not v:
        return None
    try:
        return int(v)
    except ValueError:
        return None


def parse_ruling_date(v):
    # YYYYMM format in BMF, e.g. '196908'
    if not v or len(v) < 6 or not v.isdigit():
        return None
    y = int(v[:4])
    m = int(v[4:6])
    if y < 1900 or m < 1 or m > 12:
        return None
    return f"{y:04d}-{m:02d}-01"


def main():
    t0 = time.time()
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()

    print("Truncating irs_exempt_orgs ...")
    cur.execute("truncate irs_exempt_orgs")

    total_loaded = 0
    for name in FILES:
        path = SRC / name
        if not path.exists():
            print(f"  {name}: missing, skip")
            continue
        t1 = time.time()
        batch = []
        loaded = 0
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f)
            for row in reader:
                ein = (row.get("EIN") or "").strip()
                nm = (row.get("NAME") or "").strip()
                if not ein or not nm:
                    continue
                batch.append((
                    ein,
                    nm,
                    normalize(nm),
                    (row.get("STATE") or "").strip() or None,
                    (row.get("CITY") or "").strip() or None,
                    (row.get("ZIP") or "").strip() or None,
                    (row.get("SUBSECTION") or "").strip() or None,
                    (row.get("CLASSIFICATION") or "").strip() or None,
                    (row.get("NTEE_CD") or "").strip() or None,
                    parse_int(row.get("ASSET_AMT")),
                    parse_int(row.get("INCOME_AMT")),
                    parse_ruling_date(row.get("RULING")),
                ))
                if len(batch) >= 10000:
                    execute_values(
                        cur,
                        "insert into irs_exempt_orgs "
                        "(ein, name, name_normalized, state, city, zip, subsection, "
                        " classification, ntee_code, asset_amt, income_amt, ruling_date) "
                        "values %s on conflict (ein) do nothing",
                        batch, page_size=10000,
                    )
                    loaded += len(batch)
                    batch = []
            if batch:
                execute_values(
                    cur,
                    "insert into irs_exempt_orgs "
                    "(ein, name, name_normalized, state, city, zip, subsection, "
                    " classification, ntee_code, asset_amt, income_amt, ruling_date) "
                    "values %s on conflict (ein) do nothing",
                    batch, page_size=10000,
                )
                loaded += len(batch)
        print(f"  {name}: {loaded:,} loaded  ({time.time()-t1:.1f}s)")
        total_loaded += loaded

    cur.execute("select count(*), count(distinct ntee_code), count(*) filter (where state='FL') from irs_exempt_orgs")
    tot, ntee_n, fl_n = cur.fetchone()
    print(f"\n✓ Total loaded: {tot:,} ({ntee_n:,} distinct NTEE codes, {fl_n:,} FL orgs)")
    print(f"✓ Done in {time.time()-t0:.1f}s")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
