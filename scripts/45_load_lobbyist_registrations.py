#!/usr/bin/env python3
"""
45_load_lobbyist_registrations.py

Loads data/processed/lobbyist_registrations.csv (written by
14c_parse_registration_pdfs.py) into Supabase `lobbyist_registrations`
(migration 023). One row per (lobbyist, principal, branch, year).

Usage:
    .venv/bin/python scripts/45_load_lobbyist_registrations.py
"""

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

CSV_PATH = PROJECT_ROOT / "data" / "processed" / "lobbyist_registrations.csv"

COPY_COLUMNS = [
    "year", "branch", "lobbyist_name", "lobbyist_phone", "lobbyist_addr",
    "principal_name", "principal_addr", "industry_code", "chamber_scope",
    "effective_date", "source_url",
]


def _esc(v) -> str:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return r"\N"
    s = str(v)
    if s == "" or s.lower() == "nan":
        return r"\N"
    return (s.replace("\\", "\\\\").replace("\t", " ")
             .replace("\n", " ").replace("\r", " "))


def _fmt_int(v) -> str:
    if v is None or pd.isna(v):
        return r"\N"
    try:
        return str(int(v))
    except (ValueError, TypeError):
        return r"\N"


def main() -> int:
    if not CSV_PATH.exists():
        sys.exit(f"ERROR: {CSV_PATH} not found — run 14c first")

    df = pd.read_csv(CSV_PATH, dtype=str, keep_default_na=False)
    print(f"Source: {CSV_PATH.name} ({len(df):,} rows)")

    # Required columns
    df = df[df["lobbyist_name"].str.strip() != ""]
    df = df[df["principal_name"].str.strip() != ""]
    df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("Int64")
    df = df[df["year"].notna()]

    # Effective date: keep YYYY-MM-DD or blank
    df["effective_date"] = df["effective_date"].where(
        df["effective_date"].str.match(r"^\d{4}-\d{2}-\d{2}$", na=False), ""
    )

    print(f"  After validation: {len(df):,} rows")

    buf = io.StringIO()
    for row in df.itertuples(index=False):
        fields = [
            _fmt_int(row.year),
            _esc(row.branch),
            _esc(row.lobbyist_name),
            _esc(row.lobbyist_phone),
            _esc(row.lobbyist_addr),
            _esc(row.principal_name),
            _esc(row.principal_addr),
            _esc(row.industry_code),
            _esc(row.chamber_scope),
            row.effective_date if row.effective_date else r"\N",
            _esc(row.source_url),
        ]
        buf.write("\t".join(fields) + "\n")

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute("SET statement_timeout = 0")
    conn.commit()

    try:
        print("  TRUNCATE lobbyist_registrations ...")
        conn.autocommit = True
        cur.execute("TRUNCATE lobbyist_registrations RESTART IDENTITY")
        conn.autocommit = False
        cur.execute("SET statement_timeout = 0")
        conn.commit()

        cur.execute("""
            CREATE TEMP TABLE lobreg_stage
            (LIKE lobbyist_registrations INCLUDING DEFAULTS)
        """)

        start = time.time()
        buf.seek(0)
        cur.copy_from(buf, "lobreg_stage", sep="\t", null=r"\N", columns=COPY_COLUMNS)

        print(f"  Merging {len(df):,} staged rows ...")
        cur.execute(f"""
            INSERT INTO lobbyist_registrations ({','.join(COPY_COLUMNS)})
            SELECT {','.join(COPY_COLUMNS)} FROM lobreg_stage
            ON CONFLICT (year, branch, lobbyist_name, principal_name)
            DO NOTHING
        """)
        merged = cur.rowcount
        conn.commit()

        cur.execute("""
            SELECT COUNT(*), COUNT(DISTINCT lobbyist_name),
                   COUNT(DISTINCT principal_name),
                   COUNT(DISTINCT industry_code)
            FROM lobbyist_registrations
        """)
        n, n_lob, n_prin, n_ind = cur.fetchone()
        elapsed = time.time() - start
        print(f"\n✓ Done in {elapsed:.1f}s")
        print(f"  {n:,} rows ({merged:,} inserted, {len(df) - merged:,} dedup-skipped)")
        print(f"  {n_lob:,} distinct lobbyists, {n_prin:,} distinct principals, {n_ind:,} industry codes")
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
