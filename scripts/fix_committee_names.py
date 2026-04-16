#!/usr/bin/env python3
"""
fix_committee_names.py

Repairs "Committee Tracking System" placeholder names in:
  1. public/data/committees/index.json  (local build artifact)
  2. committees table in Supabase
  3. donor_committees table in Supabase  (denormalized copy — must match)

Source of truth: data/raw/contributions/closed_committees_manifest.json

Run any time after a pipeline re-run that reloads the committees table from
index.json (e.g., script 40 after pre_truncate_40.py). Safe to re-run.

Usage:
    .venv/bin/python scripts/fix_committee_names.py
"""

import json
import sys
from pathlib import Path

import psycopg2

ROOT     = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "data" / "raw" / "contributions" / "closed_committees_manifest.json"
INDEX    = ROOT / "public" / "data" / "committees" / "index.json"
DOTENV   = ROOT / ".env.local"
BAD_NAME = "Committee Tracking System"


def load_db_url() -> str:
    for line in DOTENV.read_text().splitlines():
        if line.startswith("SUPABASE_DB_URL="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError("SUPABASE_DB_URL not found in .env.local")


def load_manifest() -> dict:
    data = json.loads(MANIFEST.read_text())
    return {
        k: v["committee_name"]
        for k, v in data.get("committees", {}).items()
        if v.get("committee_name") and v["committee_name"] != BAD_NAME
    }


def fix_index_json(manifest: dict) -> int:
    if not INDEX.exists():
        print(f"SKIP index.json: {INDEX} not found")
        return 0
    index = json.loads(INDEX.read_text())
    fixed = 0
    for c in index:
        if c.get("committee_name") == BAD_NAME:
            correct = manifest.get(str(c["acct_num"]))
            if correct:
                c["committee_name"] = correct
                fixed += 1
    INDEX.write_text(json.dumps(index, separators=(",", ":")))
    print(f"  index.json: {fixed:,} entries fixed")
    return fixed


def fix_supabase_table(cur, table: str, manifest: dict) -> int:
    cur.execute(f"SELECT COUNT(*) FROM {table} WHERE committee_name = %s", (BAD_NAME,))
    bad_count = cur.fetchone()[0]
    if bad_count == 0:
        print(f"  {table}: 0 bad rows — nothing to do")
        return 0

    updates = list(manifest.items())
    BATCH = 500
    updated = 0
    for i in range(0, len(updates), BATCH):
        batch = updates[i:i + BATCH]
        vals = ",".join(
            cur.mogrify("(%s,%s)", (name, acct)).decode()
            for acct, name in batch
        )
        cur.execute(f"""
            UPDATE {table}
            SET committee_name = data.name
            FROM (VALUES {vals}) AS data(name, acct_num)
            WHERE {table}.acct_num = data.acct_num
              AND {table}.committee_name = '{BAD_NAME}'
        """)
        updated += cur.rowcount

    cur.execute(f"SELECT COUNT(*) FROM {table} WHERE committee_name = %s", (BAD_NAME,))
    remaining = cur.fetchone()[0]
    print(f"  {table}: {updated:,} rows fixed, {remaining} still bad")
    return updated


def main() -> int:
    print("Loading manifest...")
    manifest = load_manifest()
    print(f"  {len(manifest):,} valid name overrides")

    print("\nFixing index.json...")
    fix_index_json(manifest)

    print("\nConnecting to Supabase...")
    db_url = load_db_url()
    conn = psycopg2.connect(db_url, connect_timeout=15)
    conn.autocommit = False
    cur = conn.cursor()

    print("\nFixing committees table...")
    fix_supabase_table(cur, "committees", manifest)

    print("\nFixing donor_committees table...")
    fix_supabase_table(cur, "donor_committees", manifest)

    conn.commit()
    cur.close()
    conn.close()
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
