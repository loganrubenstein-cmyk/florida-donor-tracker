#!/usr/bin/env python3
"""
load_committee_targeted.py

Pushes committee data for specific acct_nums to Supabase, reading from their
public/data/committees/{acct_num}.json files (built by generate_committee_json_targeted.py).

Writes to:
  - committees            (upsert: acct_num, committee_name, total_received, num_contributions)
  - committee_top_donors  (delete-then-insert: top 100 donors)

Use after generate_committee_json_targeted.py to onboard closed committees whose
contribution data wasn't in contributions_deduped.csv (i.e., scraped by script 02b
after the last script 09 run).

Usage:
    .venv/bin/python scripts/load_committee_targeted.py
"""

import json
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

ROOT     = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "public" / "data" / "committees"
DOTENV   = ROOT / ".env.local"

ACCTS = ["70275"]


def load_db_url() -> str:
    for line in DOTENV.read_text().splitlines():
        if line.startswith("SUPABASE_DB_URL="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError("SUPABASE_DB_URL not found in .env.local")


def slugify(name: str) -> str:
    import re
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def main() -> int:
    db_url = load_db_url()
    conn = psycopg2.connect(db_url, connect_timeout=15)
    conn.autocommit = False

    for acct in ACCTS:
        json_path = DATA_DIR / f"{acct}.json"
        if not json_path.exists():
            print(f"SKIP {acct}: {json_path} not found — run generate_committee_json_targeted.py first")
            continue

        data = json.loads(json_path.read_text())
        committee_name  = data.get("committee_name", f"Committee {acct}")
        total_received  = data.get("total_received", 0)
        num_contribs    = data.get("num_contributions", 0)
        top_donors      = data.get("top_donors", [])

        print(f"\nLoading {acct}: {committee_name}")
        print(f"  total_received={total_received:,.0f}  num_contributions={num_contribs:,}  top_donors={len(top_donors)}")

        with conn.cursor() as cur:
            # 1. Upsert into committees
            execute_values(cur, """
                INSERT INTO committees (acct_num, committee_name, total_received, num_contributions)
                VALUES %s
                ON CONFLICT (acct_num) DO UPDATE SET
                  committee_name   = EXCLUDED.committee_name,
                  total_received   = EXCLUDED.total_received,
                  num_contributions = EXCLUDED.num_contributions
            """, [(acct, committee_name, total_received, num_contribs)])
            print(f"  ✓ committees row upserted")

            # 2. Clear existing top_donor rows then insert fresh
            cur.execute("DELETE FROM committee_top_donors WHERE acct_num = %s", (acct,))
            if top_donors:
                td_rows = [
                    (acct, td["name"], slugify(td["name"]),
                     td["total_amount"], td["num_contributions"], td.get("type", "individual"))
                    for td in top_donors
                ]
                execute_values(cur, """
                    INSERT INTO committee_top_donors
                      (acct_num, donor_name, donor_slug, total_amount, num_contributions, type)
                    VALUES %s
                """, td_rows)
                print(f"  ✓ {len(td_rows)} committee_top_donors rows inserted")

        conn.commit()
        print(f"  ✓ Committed")

    conn.close()
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
