"""
Script 77: Export per-cycle donor → committee flows.

Queries contributions table for top donor→committee pairs in each
2-year election cycle (2008–2026), joins with committees for names.
Writes public/data/donor_flows_by_year.json:

{
  "cycles": ["2008", "2010", ...],
  "by_cycle": {
    "2024": [{donor, committee, committee_acct, total_amount, num_contributions}, ...],
    ...
  }
}

Usage:
    python scripts/77_export_flows_by_cycle.py
"""

import json
import os
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras

PROJECT_ROOT = Path(__file__).parent.parent
OUTPUT_FILE  = PROJECT_ROOT / "public" / "data" / "donor_flows_by_year.json"

CYCLES = [2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024, 2026]
TOP_N  = 300  # flows per cycle


def get_conn():
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / ".env.local")
    url = os.environ.get("SUPABASE_DB_URL")
    if not url:
        print("ERROR: SUPABASE_DB_URL not set in .env.local", file=sys.stderr)
        sys.exit(1)
    return psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)


def fetch_cycle_flows(cur, cycle_year: int, top_n: int) -> list:
    # Each 2-year cycle: odd year + even year (e.g. 2024 = 2023+2024)
    # report_year in cycle = [cycle-1, cycle] (e.g. 2023, 2024 for 2024 cycle)
    start = cycle_year - 1
    end   = cycle_year

    cur.execute("""
        WITH ranked AS (
            SELECT
                c.contributor_name_normalized AS donor,
                c.recipient_acct              AS committee_acct,
                SUM(c.amount)                 AS total_amount,
                COUNT(*)                      AS num_contributions
            FROM contributions c
            WHERE c.recipient_type           = 'committee'
              AND c.report_year BETWEEN %s AND %s
              AND c.contributor_name_normalized IS NOT NULL
              AND c.amount > 0
            GROUP BY c.contributor_name_normalized, c.recipient_acct
            ORDER BY total_amount DESC
            LIMIT %s
        )
        SELECT
            r.donor,
            COALESCE(cm.committee_name, r.committee_acct) AS committee,
            r.committee_acct,
            r.total_amount::numeric::float8               AS total_amount,
            r.num_contributions::int                      AS num_contributions
        FROM ranked r
        LEFT JOIN committees cm ON cm.acct_num = r.committee_acct
        ORDER BY r.total_amount DESC
    """, (start, end, top_n))

    return [dict(row) for row in cur.fetchall()]


def main():
    print("=== Script 77: Export Flows By Cycle ===\n")
    conn = get_conn()
    cur  = conn.cursor()

    by_cycle = {}
    for cycle in CYCLES:
        print(f"  Fetching {cycle} cycle ({cycle-1}–{cycle})...", flush=True)
        rows = fetch_cycle_flows(cur, cycle, TOP_N)
        by_cycle[str(cycle)] = rows
        total = sum(r["total_amount"] for r in rows)
        print(f"    → {len(rows)} flows, ${total:,.0f} total")

    cur.close()
    conn.close()

    output = {
        "cycles": [str(c) for c in CYCLES],
        "by_cycle": by_cycle,
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(output), encoding="utf-8")
    size_kb = OUTPUT_FILE.stat().st_size / 1024
    print(f"\nWrote {OUTPUT_FILE} ({size_kb:.0f} KB)")
    print(f"Cycles: {', '.join(str(c) for c in CYCLES)}")


if __name__ == "__main__":
    main()
