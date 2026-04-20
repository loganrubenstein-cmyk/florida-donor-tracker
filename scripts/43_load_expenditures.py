#!/usr/bin/env python3
"""
43_load_expenditures.py

Bulk-loads row-level committee expenditures from data/processed/expenditures.csv
into the Supabase `expenditures` table (migration 022). Mirrors script 41's
COPY-based pattern but without donor-slug matching — vendors are kept raw for
now, pending vendor canonicalization (deferred E4).

Design:
  * Truncate + reload by default (simple, ~500K rows, fast).
  * acct_num parsed from source_file: "Expend_<N>.txt" → "<N>".
  * Dates auto-parsed; amounts → numeric; other fields pass through.

Usage:
    .venv/bin/python scripts/43_load_expenditures.py              # full load
    .venv/bin/python scripts/43_load_expenditures.py --append     # INSERT … ON CONFLICT DO NOTHING
    .venv/bin/python scripts/43_load_expenditures.py --limit 1000 # smoke
"""

import argparse
import io
import os
import re
import sys
import time
from pathlib import Path

import pandas as pd
import psycopg2
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env.local")
DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set")

CSV_PATH = PROJECT_ROOT / "data" / "processed" / "expenditures.csv"
CHUNK_ROWS = 100_000

SOURCE_FILE_RE = re.compile(r"Expend_([^.]+)\.txt$", re.IGNORECASE)

COPY_COLUMNS = [
    "acct_num", "report_year", "report_type", "expenditure_date", "amount",
    "vendor_name", "vendor_address", "vendor_city_state_zip", "purpose",
    "type_code", "source_file",
]


def parse_acct(source_file):
    if not isinstance(source_file, str):
        return None
    m = SOURCE_FILE_RE.search(source_file)
    return m.group(1) if m else None


def _esc(v) -> str:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return r"\N"
    s = str(v)
    if s == "":
        return r"\N"
    return (s.replace("\\", "\\\\").replace("\t", " ")
             .replace("\n", " ").replace("\r", " "))


def _fmt_num(v) -> str:
    if v is None or pd.isna(v):
        return r"\N"
    return f"{float(v):.2f}"


def _fmt_int(v) -> str:
    if v is None or pd.isna(v):
        return r"\N"
    try:
        return str(int(v))
    except (ValueError, TypeError):
        return r"\N"


def prepare_chunk(df: pd.DataFrame) -> tuple[str, int]:
    df = df.copy()
    df["acct_num"] = df["source_file"].map(parse_acct)
    df = df[df["acct_num"].notna() & (df["acct_num"] != "")]
    if df.empty:
        return "", 0

    df["expenditure_date"] = pd.to_datetime(df["expenditure_date"], errors="coerce").dt.strftime("%Y-%m-%d")
    date_mask = df["expenditure_date"].str.match(r"^\d{4}-\d{2}-\d{2}$", na=False)
    df.loc[~date_mask, "expenditure_date"] = None

    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
    df["report_year"] = pd.to_numeric(df["report_year"], errors="coerce").astype("Int64")

    for c in ("report_type", "vendor_name", "vendor_address",
              "vendor_city_state_zip", "purpose", "type_code", "source_file"):
        if c in df.columns:
            df[c] = df[c].fillna("").astype(str)
        else:
            df[c] = ""

    buf = io.StringIO()
    for row in df.itertuples(index=False):
        fields = [
            _esc(row.acct_num),
            _fmt_int(row.report_year),
            _esc(row.report_type),
            row.expenditure_date if isinstance(row.expenditure_date, str) and row.expenditure_date != "NaT" else r"\N",
            _fmt_num(row.amount),
            _esc(row.vendor_name),
            _esc(row.vendor_address),
            _esc(row.vendor_city_state_zip),
            _esc(row.purpose),
            _esc(row.type_code),
            _esc(row.source_file),
        ]
        buf.write("\t".join(fields) + "\n")
    return buf.getvalue(), len(df)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--append", action="store_true",
                    help="Insert with ON CONFLICT DO NOTHING (no truncate)")
    args = ap.parse_args()

    if not CSV_PATH.exists():
        sys.exit(f"ERROR: {CSV_PATH} not found")

    print(f"Source: {CSV_PATH} ({CSV_PATH.stat().st_size / 1e6:.1f} MB)")

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute("SET statement_timeout = 0")
    conn.commit()

    try:
        if not args.append:
            print("  TRUNCATE expenditures ...")
            conn.autocommit = True
            cur.execute("TRUNCATE expenditures RESTART IDENTITY")
            conn.autocommit = False
            cur.execute("SET statement_timeout = 0")
            conn.commit()

        # Always stage → dedupe on insert. The source CSV contains exact-dup
        # rows (same committee re-submitting the same expenditure across
        # amended quarterly filings), so a direct COPY hits UNIQUE violations.
        cur.execute("""
            CREATE TEMP TABLE expenditures_stage (LIKE expenditures INCLUDING DEFAULTS)
        """)
        target = "expenditures_stage"

        reader = pd.read_csv(CSV_PATH, dtype=str, chunksize=CHUNK_ROWS, low_memory=False)
        total = 0
        chunks = 0
        start = time.time()

        for chunk in reader:
            chunks += 1
            copy_text, row_count = prepare_chunk(chunk)
            if row_count == 0:
                continue
            buf = io.StringIO(copy_text)
            cur.copy_from(buf, target, sep="\t", null=r"\N", columns=COPY_COLUMNS)
            total += row_count
            conn.commit()
            if chunks % 4 == 0:
                rate = total / (time.time() - start)
                print(f"  chunk {chunks}: +{row_count:,}  (total {total:,}, {rate:,.0f}/s)", flush=True)
            if args.limit and total >= args.limit:
                break

        print(f"\n  Merging {total:,} staged rows into expenditures ...")
        cur.execute(f"""
            INSERT INTO expenditures ({','.join(COPY_COLUMNS)})
            SELECT {','.join(COPY_COLUMNS)} FROM expenditures_stage
            ON CONFLICT (acct_num, expenditure_date, amount, vendor_name, purpose, report_year, report_type)
            DO NOTHING
        """)
        merged = cur.rowcount
        conn.commit()
        print(f"  Merged {merged:,} rows (skipped {total - merged:,} duplicates)")

        cur.execute("SELECT COUNT(*), SUM(amount)::bigint FROM expenditures")
        n, s = cur.fetchone()
        elapsed = time.time() - start
        print(f"\n✓ Done in {elapsed:.1f}s")
        print(f"  expenditures now: {n:,} rows, sum amount ${(s or 0):,}")
    except Exception as e:
        conn.rollback()
        print(f"\nERROR: {e}")
        raise
    finally:
        cur.close()
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
