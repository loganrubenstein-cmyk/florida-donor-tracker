"""
Script 59: Load candidate_pc_links.csv into Supabase candidate_pc_links table.

Truncates existing data and reloads from the CSV produced by script 58.
Run this after script 58 whenever PC links are rebuilt.

Usage:
    python scripts/59_load_pc_links_supabase.py
"""

import os
import sys
from io import StringIO
from pathlib import Path

import pandas as pd
import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

DB_URL  = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set in .env.local")

CSV_PATH = Path(__file__).resolve().parent.parent / "data" / "processed" / "candidate_pc_links.csv"

if not CSV_PATH.exists():
    sys.exit(f"ERROR: {CSV_PATH} not found. Run script 58 first.")


def main() -> int:
    print("=== Script 59: Load PC Links → Supabase ===\n")

    df = pd.read_csv(CSV_PATH, dtype=str).fillna("")
    print(f"Loaded {len(df):,} rows from {CSV_PATH.name}")

    # Map CSV columns to Supabase table columns
    # CSV:       candidate_name, candidate_acct, pc_acct, pc_name, pc_type, link_type, confidence
    # Supabase:  candidate_acct_num, pc_acct_num, pc_name, pc_type, link_type, confidence
    df_out = pd.DataFrame({
        "candidate_acct_num": df["candidate_acct"].str.strip(),
        "pc_acct_num":        df["pc_acct"].str.strip().replace("", None),
        "pc_name":            df["pc_name"].str.strip(),
        "pc_type":            df["pc_type"].str.strip(),
        "link_type":          df["link_type"].str.strip(),
        "confidence":         pd.to_numeric(df["confidence"], errors="coerce").round(2),
    })

    print(f"Rows to load: {len(df_out):,}")
    print(f"Link type breakdown:")
    for lt, cnt in df_out["link_type"].value_counts().items():
        print(f"  {lt:<22s}: {cnt:,}")

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True

    with conn.cursor() as cur:
        cur.execute("SET statement_timeout = 0")

        # Truncate existing data
        print("\nTruncating existing candidate_pc_links...")
        cur.execute("TRUNCATE TABLE candidate_pc_links RESTART IDENTITY")
        print("Truncated.")

        # COPY via StringIO — fast bulk load
        print("Loading new data via COPY...")
        buf = StringIO()
        df_out.to_csv(buf, index=False, header=False)
        buf.seek(0)
        cur.copy_expert(
            "COPY candidate_pc_links (candidate_acct_num, pc_acct_num, pc_name, pc_type, link_type, confidence) FROM STDIN WITH CSV",
            buf,
        )

    conn.close()

    print(f"\nDone. {len(df_out):,} rows loaded into candidate_pc_links.")
    print("Candidate profiles reading from Supabase will now reflect the new links.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
