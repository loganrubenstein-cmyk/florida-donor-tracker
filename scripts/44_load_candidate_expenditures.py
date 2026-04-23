#!/usr/bin/env python3
"""
44_load_candidate_expenditures.py

Loads data/processed/candidate_expenditures.csv into Supabase
`candidate_expenditures` (migration 022). acct_num is already a column in the
source CSV (unlike committee expenditures, which derive it from source_file).

Joins candidate_id via candidates.acct_num — multiple candidates may share an
acct_num across election years; we pick the most-recent by election_year.

Usage:
    .venv/bin/python scripts/44_load_candidate_expenditures.py
    .venv/bin/python scripts/44_load_candidate_expenditures.py --limit 5000
"""

import argparse
import io
import os
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

CSV_PATH = PROJECT_ROOT / "data" / "processed" / "candidate_expenditures.csv"
CHUNK_ROWS = 100_000

COPY_COLUMNS = [
    "acct_num", "candidate_id", "report_year", "report_type",
    "expenditure_date", "amount", "vendor_name", "vendor_address",
    "vendor_city_state_zip", "purpose", "type_code", "source_file",
]


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


def load_candidate_map(cur) -> dict:
    """{acct_num: latest candidate_id by election_year}."""
    cur.execute("""
        SELECT DISTINCT ON (acct_num) acct_num, id
        FROM candidates
        WHERE acct_num IS NOT NULL
        ORDER BY acct_num, election_year DESC NULLS LAST
    """)
    return {r[0]: r[1] for r in cur.fetchall()}


def prepare_chunk(df: pd.DataFrame, cand_map: dict) -> tuple[str, int]:
    df = df.copy()
    df["acct_num"] = df["acct_num"].astype(str).str.strip()
    df = df[df["acct_num"].notna() & (df["acct_num"] != "") & (df["acct_num"] != "nan")]
    if df.empty:
        return "", 0

    df["candidate_id"] = df["acct_num"].map(cand_map)

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
            _fmt_int(row.candidate_id),
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
    args = ap.parse_args()

    if not CSV_PATH.exists():
        sys.exit(f"ERROR: {CSV_PATH} not found")

    print(f"Source: {CSV_PATH} ({CSV_PATH.stat().st_size / 1e6:.1f} MB)")

    # TCP keepalives — see 41_load_contributions.py for rationale.
    conn = psycopg2.connect(
        DB_URL,
        keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=5,
    )
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute("SET statement_timeout = 0")
    conn.commit()

    try:
        print("  TRUNCATE candidate_expenditures ...")
        conn.autocommit = True
        cur.execute("TRUNCATE candidate_expenditures RESTART IDENTITY")
        conn.autocommit = False
        cur.execute("SET statement_timeout = 0")
        conn.commit()

        cand_map = load_candidate_map(cur)
        print(f"  Loaded {len(cand_map):,} candidate acct_num → id mappings")

        cur.execute("""
            CREATE TEMP TABLE candidate_expenditures_stage
            (LIKE candidate_expenditures INCLUDING DEFAULTS)
        """)

        reader = pd.read_csv(CSV_PATH, dtype=str, chunksize=CHUNK_ROWS, low_memory=False)
        total = 0
        chunks = 0
        start = time.time()
        for chunk in reader:
            chunks += 1
            copy_text, row_count = prepare_chunk(chunk, cand_map)
            if row_count == 0:
                continue
            buf = io.StringIO(copy_text)
            cur.copy_from(buf, "candidate_expenditures_stage", sep="\t", null=r"\N", columns=COPY_COLUMNS)
            total += row_count
            conn.commit()
            if chunks % 4 == 0:
                rate = total / (time.time() - start)
                print(f"  chunk {chunks}: +{row_count:,}  (total {total:,}, {rate:,.0f}/s)", flush=True)
            if args.limit and total >= args.limit:
                break

        print(f"\n  Merging {total:,} staged rows ...")
        cur.execute(f"""
            INSERT INTO candidate_expenditures ({','.join(COPY_COLUMNS)})
            SELECT {','.join(COPY_COLUMNS)} FROM candidate_expenditures_stage
            ON CONFLICT (acct_num, expenditure_date, amount, vendor_name, purpose, report_year, report_type)
            DO NOTHING
        """)
        merged = cur.rowcount
        conn.commit()
        print(f"  Merged {merged:,} rows (skipped {total - merged:,} duplicates)")

        cur.execute("""
            SELECT COUNT(*), COUNT(candidate_id), SUM(amount)::bigint
            FROM candidate_expenditures
        """)
        n, with_cand, s = cur.fetchone()
        elapsed = time.time() - start
        print(f"\n✓ Done in {elapsed:.1f}s")
        print(f"  candidate_expenditures: {n:,} rows, {with_cand:,} matched to candidate_id, sum ${(s or 0):,}")
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
