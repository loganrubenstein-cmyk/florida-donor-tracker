"""
Script 70: Load lobbyist principal compensation quarterly data into Supabase.

Reads public/data/lobbyist_comp/by_principal/*.json (5,734 files, ~45K rows)
and populates the `lobbyist_principal_comp` table.

Schema created by this script:
    CREATE TABLE lobbyist_principal_comp (
        id          bigserial primary key,
        principal_slug  text not null,
        principal_name  text not null,
        year        int  not null,
        quarter     int  not null,
        branch      text not null,   -- 'Executive' | 'Legislative'
        total_comp  int  not null default 0
    );
    CREATE INDEX idx_lpc_slug    ON lobbyist_principal_comp (principal_slug);
    CREATE INDEX idx_lpc_year    ON lobbyist_principal_comp (year, quarter);

Usage:
    python scripts/70_load_principal_comp_supabase.py
"""

import json
import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set in .env.local")

DATA_DIR = Path(__file__).resolve().parent.parent / "public" / "data" / "lobbyist_comp" / "by_principal"
if not DATA_DIR.exists():
    sys.exit(f"ERROR: {DATA_DIR} not found")

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS lobbyist_principal_comp (
    id             bigserial primary key,
    principal_slug text not null,
    principal_name text not null,
    year           int  not null,
    quarter        int  not null,
    branch         text not null,
    total_comp     int  not null default 0
);

CREATE INDEX IF NOT EXISTS idx_lpc_slug ON lobbyist_principal_comp (principal_slug);
CREATE INDEX IF NOT EXISTS idx_lpc_year ON lobbyist_principal_comp (year, quarter);
"""

def main():
    files = sorted(DATA_DIR.glob("*.json"))
    print(f"Found {len(files)} principal files")

    conn = psycopg2.connect(
        DB_URL,
        keepalives=1, keepalives_idle=30,
        keepalives_interval=10, keepalives_count=5,
    )
    conn.autocommit = True
    cur = conn.cursor()

    # Create table if not exists
    cur.execute(CREATE_TABLE)
    print("Table ready")

    # Clear existing data
    cur.execute("TRUNCATE TABLE lobbyist_principal_comp RESTART IDENTITY")
    print("Cleared existing rows")

    rows = []
    skipped = 0

    for path in files:
        try:
            with open(path) as f:
                d = json.load(f)
        except Exception as e:
            print(f"  SKIP {path.name}: {e}")
            skipped += 1
            continue

        slug = d.get("slug") or d.get("principal_slug") or path.stem
        name = d.get("principal_name", "")
        by_quarter = d.get("by_quarter", [])

        for q in by_quarter:
            rows.append((
                slug,
                name,
                q.get("year"),
                q.get("quarter"),
                q.get("branch", ""),
                q.get("total_comp", 0),
            ))

    print(f"Collected {len(rows)} rows ({skipped} files skipped)")

    # Batch insert in chunks of 1,000
    CHUNK = 1_000
    inserted = 0
    for i in range(0, len(rows), CHUNK):
        chunk = rows[i:i + CHUNK]
        args = ",".join(
            cur.mogrify("(%s,%s,%s,%s,%s,%s)", r).decode() for r in chunk
        )
        cur.execute(
            f"INSERT INTO lobbyist_principal_comp "
            f"(principal_slug,principal_name,year,quarter,branch,total_comp) "
            f"VALUES {args}"
        )
        inserted += len(chunk)
        if inserted % 10_000 == 0 or inserted == len(rows):
            print(f"  Inserted {inserted}/{len(rows)} rows")

    cur.close()
    conn.close()
    print(f"Done — {inserted} rows loaded into lobbyist_principal_comp")

if __name__ == "__main__":
    main()
