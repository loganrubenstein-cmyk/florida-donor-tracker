#!/usr/bin/env python3
"""
Load public/data/lobbyist_disclosures/by_bill/*.json → principal_lobbied_bills.

Each JSON file is a list of filing records with shape:
    {'bill_raw': 'HB 1019 : [SB 282]',
     'bill_canon': 'HB 1019 : [SB 282]',
     'lobbyist': '...', 'principal': '...', 'firm': '...',
     'issues': [...], 'year': 2024}

We extract every (HB|SB)\\s?\\d+ token from bill_raw, normalize to 'hb-N'/'sb-N',
map year → biennium start (odd year), group by (principal_slug, bill_slug,
session_year), count filings, collect year set.
"""
from __future__ import annotations
import glob
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values


def slugify(name: str) -> str:
    s = str(name or "").lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"\s+", "-", s.strip())
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:120]


BILL_RE = re.compile(r"\b([HS])B\s*0*(\d+)\b", re.IGNORECASE)


def extract_bill_slugs(bill_raw: str) -> list[tuple[str, str]]:
    """Return list of (bill_slug, display) for each distinct bill token."""
    seen: dict[str, str] = {}
    for m in BILL_RE.finditer(bill_raw or ""):
        chamber = "hb" if m.group(1).upper() == "H" else "sb"
        num = str(int(m.group(2)))
        slug = f"{chamber}-{num}"
        display = f"{chamber.upper()} {num}"
        seen.setdefault(slug, display)
    return list(seen.items())


def biennium_start(year: int) -> int:
    return year if year % 2 == 1 else year - 1


def load_env():
    env = Path(__file__).resolve().parent.parent / ".env.local"
    if env.exists():
        for line in env.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k, v)


def main():
    load_env()
    db_url = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: SUPABASE_DB_URL not set", file=sys.stderr)
        sys.exit(1)

    root = Path(__file__).resolve().parent.parent
    files = sorted(glob.glob(str(root / "public/data/lobbyist_disclosures/by_bill/*.json")))
    print(f"scanning {len(files)} by_bill JSON files …")

    # key: (principal_slug, bill_slug, session_year) -> {filing_count, years set, bill_number}
    agg: dict[tuple[str, str, int], dict] = defaultdict(
        lambda: {"filing_count": 0, "years": set(), "bill_number": None}
    )

    total_filings = 0
    skipped_no_principal = 0
    skipped_no_bill = 0
    skipped_no_year = 0

    for i, path in enumerate(files):
        with open(path) as fh:
            records = json.load(fh)
        for rec in records:
            total_filings += 1
            principal = rec.get("principal")
            year = rec.get("year")
            bill_raw = rec.get("bill_raw") or rec.get("bill_canon") or ""
            if not principal:
                skipped_no_principal += 1
                continue
            if not year:
                skipped_no_year += 1
                continue
            bills = extract_bill_slugs(bill_raw)
            if not bills:
                skipped_no_bill += 1
                continue
            pslug = slugify(principal)
            if not pslug:
                skipped_no_principal += 1
                continue
            session = biennium_start(int(year))
            for bslug, display in bills:
                k = (pslug, bslug, session)
                agg[k]["filing_count"] += 1
                agg[k]["years"].add(int(year))
                agg[k]["bill_number"] = display

        if (i + 1) % 2000 == 0:
            print(f"  {i + 1}/{len(files)} files, {total_filings} filings, {len(agg)} unique keys so far")

    print(
        f"\nparsed {total_filings} filings → {len(agg)} unique (principal, bill, session) rows\n"
        f"  skipped: no_principal={skipped_no_principal}, no_year={skipped_no_year}, no_bill={skipped_no_bill}"
    )

    rows = [
        (pslug, bslug, v["bill_number"], session, v["filing_count"], sorted(v["years"]))
        for (pslug, bslug, session), v in agg.items()
    ]

    print(f"\nupserting {len(rows)} rows into principal_lobbied_bills …")
    conn = psycopg2.connect(db_url, keepalives=1, keepalives_idle=30)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout='300s'")
            cur.execute("TRUNCATE principal_lobbied_bills")
            execute_values(
                cur,
                """
                INSERT INTO principal_lobbied_bills
                  (principal_slug, bill_slug, bill_number, session_year,
                   filing_count, years)
                VALUES %s
                """,
                rows,
                page_size=2000,
            )
        conn.commit()
        print("done.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    # Tiny sanity check
    conn = psycopg2.connect(db_url, keepalives=1, keepalives_idle=30)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT principal_slug, bill_slug, session_year, filing_count "
            "FROM principal_lobbied_bills "
            "WHERE principal_slug='florida-power-light-company' "
            "ORDER BY filing_count DESC LIMIT 5"
        )
        print("\nFPL top-filed bills:")
        for r in cur.fetchall():
            print(f"  {r}")
    conn.close()


if __name__ == "__main__":
    main()
