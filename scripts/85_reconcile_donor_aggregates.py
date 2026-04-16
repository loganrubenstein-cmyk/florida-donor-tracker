#!/usr/bin/env python3
"""
Script 85: Reconcile Donor Aggregates (v2 — materialized view path).

Post-migration 016, donors is a derived view over donors_mv, which is a
materialized view rebuilt from contributions + donor_entities. This script:

    1. REFRESH MATERIALIZED VIEW CONCURRENTLY donors_mv
    2. Hard-validate: SUM(donors_mv.total_combined) must equal
       SUM(contributions.amount WHERE donor_slug IS NOT NULL) within $0.01
    3. Spot-check the top 25 donors by $: each donors_mv row equals
       SUM(contributions) for that slug within $0.01
    4. Check orphan aliases: every contributions.donor_slug has a
       donor_entities row
    5. Exit non-zero on any failure so CI blocks the deploy

This replaces the old one-directional "only raise totals" logic which left
inflated numbers behind when names were re-merged (the $136M Florida Realtors
drift).

Usage:
    python3 scripts/85_reconcile_donor_aggregates.py           # refresh + validate
    python3 scripts/85_reconcile_donor_aggregates.py --check   # validate only
"""

import os
import sys
from pathlib import Path
from decimal import Decimal

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

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True   # REFRESH CONCURRENTLY requires autocommit
    failures = []

    with conn.cursor() as cur:
        if not check_only:
            print("REFRESH MATERIALIZED VIEW CONCURRENTLY donors_mv …", flush=True)
            cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY donors_mv")
            print("  done.")

        # ── Global total ───────────────────────────────────────────────────
        cur.execute("SELECT COALESCE(SUM(total_combined), 0) FROM donors_mv")
        mv_total = Decimal(str(cur.fetchone()[0]))

        cur.execute("""
            SELECT COALESCE(SUM(amount), 0)
            FROM contributions
            WHERE donor_slug IS NOT NULL
        """)
        contrib_total = Decimal(str(cur.fetchone()[0]))

        drift = abs(mv_total - contrib_total)
        print(f"\nGlobal total:")
        print(f"  donors_mv sum:       ${mv_total:>18,.2f}")
        print(f"  contributions sum:   ${contrib_total:>18,.2f}")
        print(f"  drift:               ${drift:>18,.2f}")
        if drift > CENT:
            failures.append(f"Global drift ${drift:,.2f} exceeds $0.01 tolerance")

        # ── Spot check top N ───────────────────────────────────────────────
        print(f"\nSpot-checking top {SPOT_CHECK_N} donors by total_combined…")
        cur.execute("""
            SELECT slug, name, total_combined
            FROM donors_mv
            ORDER BY total_combined DESC
            LIMIT %s
        """, (SPOT_CHECK_N,))
        top = cur.fetchall()

        for slug, name, mv_amt in top:
            cur.execute("""
                SELECT COALESCE(SUM(amount), 0)
                FROM contributions
                WHERE donor_slug = %s
            """, (slug,))
            actual = Decimal(str(cur.fetchone()[0]))
            mv_amt_d = Decimal(str(mv_amt))
            d = abs(actual - mv_amt_d)
            ok = "OK " if d <= CENT else "FAIL"
            print(f"  [{ok}] {slug[:40]:40s}  mv=${mv_amt_d:>14,.2f}  contrib=${actual:>14,.2f}  Δ=${d:,.2f}")
            if d > CENT:
                failures.append(f"Donor {slug}: drift ${d:,.2f}")

        # ── Orphan check: donor_slug in contributions with no entity row ──
        print("\nOrphan donor_slug check…")
        cur.execute("""
            SELECT c.donor_slug, COUNT(*) AS cnt, SUM(c.amount) AS tot
            FROM contributions c
            LEFT JOIN donor_entities e ON e.canonical_slug = c.donor_slug
            WHERE c.donor_slug IS NOT NULL AND e.canonical_slug IS NULL
            GROUP BY c.donor_slug
            ORDER BY tot DESC NULLS LAST
            LIMIT 10
        """)
        orphans = cur.fetchall()
        if orphans:
            print(f"  {len(orphans)} orphan slugs (showing up to 10):")
            for slug, cnt, tot in orphans:
                print(f"    {slug}: {cnt:,} rows, ${Decimal(str(tot or 0)):,.2f}")
            failures.append(f"{len(orphans)} orphan donor_slug values in contributions")
        else:
            print("  clean.")

    conn.close()

    if failures:
        print("\nRECONCILE FAILED:", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        sys.exit(1)

    print("\nRECONCILE PASSED.")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
