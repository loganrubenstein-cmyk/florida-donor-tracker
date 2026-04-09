"""
Script 62: Load lobbying firm data into Supabase.

Creates and populates three tables:
  lobbying_firms         — one row per firm: slug, firm_name, total_comp, num_principals, num_quarters
  lobbying_firm_clients  — top clients per firm: firm_slug, principal_name, principal_slug, total_comp
  lobbying_firm_quarters — quarterly breakdown: firm_slug, year, quarter, period, branch, total_comp

Reads from:
  public/data/lobbyist_comp/by_firm/{slug}.json  (439 files)

Usage:
    python scripts/62_load_lobbying_firms_supabase.py
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

BY_FIRM_DIR = Path(__file__).resolve().parent.parent / "public" / "data" / "lobbyist_comp" / "by_firm"
if not BY_FIRM_DIR.exists():
    sys.exit(f"ERROR: {BY_FIRM_DIR} not found.")

DDL = """
CREATE TABLE IF NOT EXISTS lobbying_firms (
  id             bigint generated always as identity primary key,
  slug           text not null unique,
  firm_name      text,
  total_comp     numeric(15,2) default 0,
  num_principals integer default 0,
  num_quarters   integer default 0
);

CREATE TABLE IF NOT EXISTS lobbying_firm_clients (
  id             bigint generated always as identity primary key,
  firm_slug      text not null,
  principal_name text,
  principal_slug text,
  total_comp     numeric(15,2) default 0
);

CREATE TABLE IF NOT EXISTS lobbying_firm_quarters (
  id             bigint generated always as identity primary key,
  firm_slug      text not null,
  year           integer,
  quarter        integer,
  period         text,
  branch         text,
  total_comp     numeric(15,2) default 0
);

CREATE INDEX IF NOT EXISTS idx_lobbying_firms_slug        ON lobbying_firms(slug);
CREATE INDEX IF NOT EXISTS idx_lf_clients_firm_slug       ON lobbying_firm_clients(firm_slug);
CREATE INDEX IF NOT EXISTS idx_lf_quarters_firm_slug      ON lobbying_firm_quarters(firm_slug);
"""


def tsv_row(values):
    parts = []
    for v in values:
        if v is None:
            parts.append("")
        else:
            # Escape tabs and newlines for COPY TEXT format
            parts.append(str(v).replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n"))
    return "\t".join(parts) + "\n"


def main() -> int:
    print("=== Script 62: Load Lobbying Firms → Supabase ===\n")

    files = sorted(BY_FIRM_DIR.glob("*.json"))
    print(f"Found {len(files):,} firm JSON files")

    firm_rows    = []
    client_rows  = []
    quarter_rows = []

    for f in files:
        try:
            d = json.loads(f.read_text())
        except Exception:
            continue

        slug = str(d.get("slug", "")).strip()
        if not slug:
            slug = f.stem

        firm_rows.append((
            slug,
            d.get("firm_name", ""),
            d.get("total_comp", 0) or 0,
            d.get("num_principals", 0) or 0,
            d.get("num_quarters", 0) or 0,
        ))

        for c in d.get("top_clients", []):
            client_rows.append((
                slug,
                c.get("principal_name", ""),
                c.get("slug", ""),
                c.get("total_comp", 0) or 0,
            ))

        for q in d.get("by_quarter", []):
            quarter_rows.append((
                slug,
                q.get("year"),
                q.get("quarter"),
                q.get("period", ""),
                q.get("branch", ""),
                q.get("total_comp", 0) or 0,
            ))

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True

    with conn.cursor() as cur:
        cur.execute("SET statement_timeout = 0")

        print("Creating tables if needed...")
        cur.execute(DDL)
        print("Tables ready.")

        print("Truncating existing data...")
        cur.execute("TRUNCATE TABLE lobbying_firm_quarters, lobbying_firm_clients, lobbying_firms RESTART IDENTITY")

        # Load firms
        print(f"Loading {len(firm_rows):,} firms...")
        buf = StringIO()
        for row in firm_rows:
            buf.write(tsv_row(row))
        buf.seek(0)
        cur.copy_expert(
            "COPY lobbying_firms (slug, firm_name, total_comp, num_principals, num_quarters) "
            "FROM STDIN WITH (FORMAT text, NULL '')",
            buf,
        )

        # Load clients
        print(f"Loading {len(client_rows):,} client rows...")
        buf2 = StringIO()
        for row in client_rows:
            buf2.write(tsv_row(row))
        buf2.seek(0)
        cur.copy_expert(
            "COPY lobbying_firm_clients (firm_slug, principal_name, principal_slug, total_comp) "
            "FROM STDIN WITH (FORMAT text, NULL '')",
            buf2,
        )

        # Load quarters
        print(f"Loading {len(quarter_rows):,} quarter rows...")
        buf3 = StringIO()
        for row in quarter_rows:
            buf3.write(tsv_row(row))
        buf3.seek(0)
        cur.copy_expert(
            "COPY lobbying_firm_quarters (firm_slug, year, quarter, period, branch, total_comp) "
            "FROM STDIN WITH (FORMAT text, NULL '')",
            buf3,
        )

    conn.close()

    total_comp = sum(r[2] for r in firm_rows)
    print(f"\nDone.")
    print(f"  lobbying_firms:         {len(firm_rows):,} firms, ${total_comp:,.0f} total est. comp")
    print(f"  lobbying_firm_clients:  {len(client_rows):,} rows")
    print(f"  lobbying_firm_quarters: {len(quarter_rows):,} rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
