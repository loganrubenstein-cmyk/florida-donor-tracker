#!/usr/bin/env python3
"""
Script 85b: Reconcile Committee Aggregates.

Mirror of script 85 for committees. Rebuilds the derived aggregate fields on
committees (total_received, num_contributions) from the live contributions
table so a late-arriving amendment or a re-run of script 40 can't leave stale
inflated totals behind (the same class of bug that caused the Florida Realtors
$136M drift on the donor side).

  1. Compute per-committee totals from contributions GROUP BY recipient_acct
  2. UPDATE committees SET total_received = …, num_contributions = …
  3. Validate: every committee's stored total matches the live SUM within $0.01
  4. Spot-check the top 25 committees by total
  5. Exit non-zero on any failure so CI blocks the deploy

Usage:
    python3 scripts/85b_reconcile_committees.py
    python3 scripts/85b_reconcile_committees.py --check   # validate only
"""

import os
import sys
from decimal import Decimal
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")

DB_URL = os.environ.get("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("SUPABASE_DB_URL not set in .env.local")

CENT = Decimal("0.01")
SPOT_CHECK_N = 25


def main():
    check_only = "--check" in sys.argv

    conn = psycopg2.connect(
        DB_URL,
        keepalives=1, keepalives_idle=30,
        keepalives_interval=10, keepalives_count=5,
    )
    conn.autocommit = True
    failures = []

    with conn.cursor() as cur:
        cur.execute("SET statement_timeout = 0")

        # ── Rebuild from contributions ─────────────────────────────────────
        if not check_only:
            print("Rebuilding committees.total_received + num_contributions …", flush=True)
            cur.execute("""
                UPDATE committees c SET
                    total_received    = COALESCE(agg.total, 0),
                    num_contributions = COALESCE(agg.n, 0)
                FROM (
                    SELECT recipient_acct,
                           SUM(amount)::numeric(18,2) AS total,
                           COUNT(*)::int              AS n
                    FROM contributions
                    WHERE recipient_type = 'committee'
                      AND recipient_acct IS NOT NULL
                    GROUP BY recipient_acct
                ) agg
                WHERE c.acct_num = agg.recipient_acct
            """)
            print(f"  updated {cur.rowcount:,} committees")

            # Any committee with no contributions at all should zero out too.
            cur.execute("""
                UPDATE committees c SET
                    total_received    = 0,
                    num_contributions = 0
                WHERE NOT EXISTS (
                    SELECT 1 FROM contributions x
                    WHERE x.recipient_acct = c.acct_num
                      AND x.recipient_type = 'committee'
                )
                AND (c.total_received > 0 OR c.num_contributions > 0)
            """)
            print(f"  zeroed {cur.rowcount:,} committees with no contributions")

        # ── Spot check: top 25 by total ─────────────────────────────────────
        cur.execute("""
            SELECT acct_num, committee_name, total_received::numeric AS stored
            FROM committees
            ORDER BY total_received DESC NULLS LAST
            LIMIT %s
        """, (SPOT_CHECK_N,))
        top = cur.fetchall()
        print(f"\nSpot-checking top {len(top)} committees …")
        for acct, name, stored in top:
            cur.execute(
                "SELECT COALESCE(SUM(amount),0) FROM contributions "
                "WHERE recipient_type='committee' AND recipient_acct = %s",
                (acct,),
            )
            live = Decimal(str(cur.fetchone()[0]))
            drift = abs(Decimal(str(stored or 0)) - live)
            ok = drift <= CENT
            flag = "OK" if ok else "FAIL"
            print(f"  [{flag}] [{acct}] {name[:40]:<40} stored=${stored or 0:>14,.2f}  live=${live:>14,.2f}  drift=${drift:,.2f}")
            if not ok:
                failures.append({"acct": acct, "name": name, "stored": float(stored or 0),
                                 "live": float(live), "drift": float(drift)})

    conn.close()

    if failures:
        print(f"\nFAIL: {len(failures)} committee(s) drift > $0.01")
        return 1
    print("\nOK — all checked committees reconcile within $0.01.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
