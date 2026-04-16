#!/usr/bin/env python3
"""
13b_load_entity_connections_supabase.py

Truncates entity_connections and loads all rows from entity_connections_full.json.
The main script 40_load_supabase.py only loads the top-500 trimmed file.
This script loads the full 56K+ connection graph.

Usage (from project root, with .venv activated):
    python scripts/13b_load_entity_connections_supabase.py
"""

import json
import os
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env.local")

DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set in .env.local")

FULL_FILE  = PROJECT_ROOT / "public" / "data" / "entity_connections_full.json"
BATCH_SIZE = 2000


def main():
    print(f"Loading {FULL_FILE} ...")
    with open(FULL_FILE, encoding="utf-8") as f:
        data = json.load(f)

    connections = data.get("connections", [])
    print(f"  {len(connections):,} connections found")

    rows = []
    for c in connections:
        ea = c["entity_a"]
        eb = c["entity_b"]
        ea_name = ea["name"] if isinstance(ea, dict) else ea
        eb_name = eb["name"] if isinstance(eb, dict) else eb
        ea_acct = ea.get("acct_num") if isinstance(ea, dict) else None
        eb_acct = eb.get("acct_num") if isinstance(eb, dict) else None
        rows.append((
            ea_name, eb_name, ea_acct, eb_acct,
            c.get("connection_score", 0),
            bool(c.get("shared_treasurer", False)),
            bool(c.get("shared_address", False)),
            bool(c.get("shared_phone", False)),
            bool(c.get("shared_chair", False)),
            float(c.get("donor_overlap_pct", 0) or 0),
            float(c.get("money_between", 0) or 0),
        ))

    print("Connecting to Supabase...")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        print("Truncating entity_connections...")
        cur.execute("TRUNCATE TABLE entity_connections RESTART IDENTITY CASCADE")
        conn.commit()

        print(f"Inserting {len(rows):,} rows in batches of {BATCH_SIZE}...")
        insert_sql = """
            INSERT INTO entity_connections
              (entity_a, entity_b, entity_a_acct, entity_b_acct, connection_score,
               shared_treasurer, shared_address, shared_phone, shared_chair,
               donor_overlap_pct, money_between)
            VALUES %s
        """
        execute_values(cur, insert_sql, rows, page_size=BATCH_SIZE)
        conn.commit()

        cur.execute("SELECT COUNT(*) FROM entity_connections")
        count = cur.fetchone()[0]
        print(f"\n✓ entity_connections: {count:,} rows loaded")

    except Exception as e:
        conn.rollback()
        print(f"\nERROR: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
