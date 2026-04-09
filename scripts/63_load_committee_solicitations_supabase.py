"""
Script 63: Load committee solicitation data into Supabase.

Creates and populates:
  committee_solicitations — one row per committee that has a solicitation record

Reads from:
  public/data/committees/{acct_num}.json  (already on disk, ~1,688 files)

Fields extracted:
  acct_num, solicitation_id, solicitation_type, org_type,
  solicitors (JSON array → text), website_url, solicitation_active, solicitation_file_date

Usage:
    python scripts/63_load_committee_solicitations_supabase.py
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

COMM_DIR = Path(__file__).resolve().parent.parent / "public" / "data" / "committees"
if not COMM_DIR.exists():
    sys.exit(f"ERROR: {COMM_DIR} not found.")

DDL = """
CREATE TABLE IF NOT EXISTS committee_solicitations (
  id                    bigint generated always as identity primary key,
  acct_num              text not null unique,
  solicitation_id       integer,
  solicitation_type     text,
  org_type              text,
  solicitors            text,   -- JSON array serialized as text
  website_url           text,
  solicitation_active   boolean,
  solicitation_file_date text
);

CREATE INDEX IF NOT EXISTS idx_comm_solic_acct ON committee_solicitations(acct_num);
"""


def tsv_escape(v):
    if v is None:
        return ""
    return str(v).replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n")


def main() -> int:
    print("=== Script 63: Load Committee Solicitations → Supabase ===\n")

    files = [f for f in COMM_DIR.glob("*.json") if f.stem.count(".") == 0]
    print(f"Scanning {len(files):,} committee JSON files...")

    rows = []
    for f in files:
        try:
            d = json.loads(f.read_text())
        except Exception:
            continue

        if not isinstance(d, dict) or not d.get("solicitation_id"):
            continue

        acct = str(d.get("acct_num", "")).strip()
        if not acct:
            continue

        solicitors_raw = d.get("solicitors", [])
        solicitors_json = json.dumps(solicitors_raw) if solicitors_raw else "[]"

        rows.append((
            acct,
            d.get("solicitation_id"),
            d.get("solicitation_type", "") or "",
            d.get("org_type", "") or "",
            solicitors_json,
            d.get("website_url", "") or "",
            d.get("solicitation_active"),
            d.get("solicitation_file_date", "") or "",
        ))

    print(f"Found {len(rows):,} committees with solicitation data")

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True

    with conn.cursor() as cur:
        cur.execute("SET statement_timeout = 0")

        print("Creating table if needed...")
        cur.execute(DDL)

        print("Truncating existing data...")
        cur.execute("TRUNCATE TABLE committee_solicitations RESTART IDENTITY")

        print(f"Loading {len(rows):,} rows...")
        buf = StringIO()
        for row in rows:
            parts = []
            for v in row:
                if v is None:
                    parts.append("")
                elif isinstance(v, bool):
                    parts.append("true" if v else "false")
                else:
                    parts.append(tsv_escape(v))
            buf.write("\t".join(parts) + "\n")
        buf.seek(0)

        cur.copy_expert(
            "COPY committee_solicitations "
            "(acct_num, solicitation_id, solicitation_type, org_type, solicitors, website_url, solicitation_active, solicitation_file_date) "
            "FROM STDIN WITH (FORMAT text, NULL '')",
            buf,
        )

    conn.close()
    print(f"\nDone. Loaded {len(rows):,} solicitation records.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
