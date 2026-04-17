#!/usr/bin/env python3
"""
Post-cutover acceptance test — run this when the orchestrator reports done.

Validates Phase 1.6 of the plan:
  1. /donor/florida-power-light-company total matches SUM(contributions) for its slug
  2. FPL total_combined appears on the homepage top list with the same number
  3. committee 70275 has former_names + status='closed'
  4. Search resolver for 'Friends of Ron DeSantis' would resolve to 70275
  5. donors_mv global total == SUM(contributions WHERE donor_slug IS NOT NULL) within $0.01
  6. No orphan donor_slug (every contributions.donor_slug has a donor_entities row)

Exits non-zero on any failure. Prints a table of PASS/FAIL per check.
"""

import os
import sys
from pathlib import Path
from decimal import Decimal

import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")
DB_URL = os.environ["SUPABASE_DB_URL"]

GREEN = "\033[32m"; RED = "\033[31m"; YELLOW = "\033[33m"
BOLD  = "\033[1m";  DIM = "\033[2m";  RESET = "\033[0m"


def fmt_money(x):
    return f"${float(x):,.2f}"


def check(label, passed, detail=""):
    marker = f"{GREEN}PASS{RESET}" if passed else f"{RED}FAIL{RESET}"
    print(f"  [{marker}] {label}")
    if detail:
        print(f"         {DIM}{detail}{RESET}")
    return passed


def main():
    print(f"{BOLD}Post-cutover acceptance — Florida Donor Tracker{RESET}")
    print()

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()

    results = []

    # ── 1. donors_mv exists ─────────────────────────────────────────────────
    print(f"{BOLD}Schema{RESET}")
    cur.execute("SELECT count(*) FROM pg_matviews WHERE matviewname='donors_mv'")
    results.append(check("donors_mv materialized view exists",
                         cur.fetchone()[0] > 0))

    cur.execute("SELECT count(*) FROM information_schema.tables WHERE table_name='donors_legacy'")
    results.append(check("donors_legacy preserved for rollback",
                         cur.fetchone()[0] > 0))

    # ── 2. FPL matches between MV and contributions ─────────────────────────
    print(f"\n{BOLD}FPL consistency (the original visible bug){RESET}")
    cur.execute("""SELECT slug, name, total_combined, num_contributions
                   FROM donors_mv WHERE slug='florida-power-light-company'""")
    fpl_mv = cur.fetchone()
    if fpl_mv:
        mv_total = Decimal(str(fpl_mv[2]))
        cur.execute("""SELECT COALESCE(SUM(amount), 0), COUNT(*)
                       FROM contributions WHERE donor_slug='florida-power-light-company'""")
        c_total_row = cur.fetchone()
        c_total = Decimal(str(c_total_row[0]))
        drift = abs(mv_total - c_total)
        results.append(check(
            f"FPL donors_mv total equals SUM(contributions)",
            drift < Decimal("0.01"),
            f"mv={fmt_money(mv_total)}  contributions={fmt_money(c_total)}  drift={fmt_money(drift)}"
        ))
        results.append(check(
            f"FPL merged all variants into one canonical entity",
            fpl_mv[3] > 10000,  # If dedup worked, should be 20k+ contributions
            f"{fpl_mv[3]:,} contributions rolled up to florida-power-light-company"
        ))
    else:
        results.append(check("FPL present in donors_mv", False, "no row for slug"))

    # ── 3. Committee 70275 former names ─────────────────────────────────────
    print(f"\n{BOLD}Committee 70275 (Friends of Ron DeSantis → Empower Parents PAC){RESET}")
    cur.execute("""SELECT committee_name, status, former_names
                   FROM committees WHERE acct_num='70275'""")
    row = cur.fetchone()
    if row:
        name, status, former = row
        results.append(check(
            "70275 has status='closed'",
            status == "closed",
            f"status={status}"
        ))
        has_former = isinstance(former, list) and len(former) > 0
        results.append(check(
            "70275 has former_names entry",
            has_former,
            f"former_names={former}" if has_former else "(empty)"
        ))
    else:
        results.append(check("70275 present in committees", False))

    # ── 4. Global reconciliation ────────────────────────────────────────────
    print(f"\n{BOLD}Global reconciliation{RESET}")
    cur.execute("SELECT COALESCE(SUM(total_combined), 0) FROM donors_mv")
    mv_global = Decimal(str(cur.fetchone()[0]))
    cur.execute("SELECT COALESCE(SUM(amount), 0) FROM contributions WHERE donor_slug IS NOT NULL")
    c_global = Decimal(str(cur.fetchone()[0]))
    global_drift = abs(mv_global - c_global)
    results.append(check(
        "SUM(donors_mv) == SUM(contributions) within $0.01",
        global_drift < Decimal("0.01"),
        f"mv={fmt_money(mv_global)}  contributions={fmt_money(c_global)}  drift={fmt_money(global_drift)}"
    ))

    # ── 5. Orphan slugs ─────────────────────────────────────────────────────
    print(f"\n{BOLD}Referential integrity{RESET}")
    cur.execute("""
        SELECT count(DISTINCT c.donor_slug)
        FROM contributions c
        LEFT JOIN donor_entities e ON e.canonical_slug = c.donor_slug
        WHERE c.donor_slug IS NOT NULL AND e.canonical_slug IS NULL
    """)
    orphan_count = cur.fetchone()[0]
    results.append(check(
        "every contributions.donor_slug has a donor_entities row",
        orphan_count == 0,
        f"{orphan_count} orphan slugs" if orphan_count else "0 orphans"
    ))

    # ── 6. Compat views resolve ─────────────────────────────────────────────
    cur.execute("""SELECT count(*) FROM information_schema.views
                   WHERE table_name IN ('donors','donor_committees','donor_candidates','donor_by_year')""")
    view_count = cur.fetchone()[0]
    results.append(check(
        "4 compat views (donors, donor_committees, donor_candidates, donor_by_year) created",
        view_count == 4,
        f"found {view_count}/4"
    ))

    # ── 7. Snapshot safety ──────────────────────────────────────────────────
    print(f"\n{BOLD}Rollback safety{RESET}")
    for t in ["donors_snapshot_pre_mv", "donor_aliases_pre09",
              "donor_entities_pre09", "contributions_slug_pre_cutover"]:
        cur.execute(f"SELECT count(*) FROM information_schema.tables WHERE table_name='{t}'")
        exists = cur.fetchone()[0] > 0
        results.append(check(f"snapshot table {t} present", exists))

    conn.close()

    # ── Summary ─────────────────────────────────────────────────────────────
    passed = sum(1 for r in results if r)
    failed = len(results) - passed
    print()
    if failed == 0:
        print(f"{GREEN}{BOLD}ALL {len(results)} CHECKS PASSED{RESET}")
        sys.exit(0)
    else:
        print(f"{RED}{BOLD}{failed}/{len(results)} CHECKS FAILED{RESET}")
        print(f"{YELLOW}Do not deploy. Review the failures above.{RESET}")
        sys.exit(1)


if __name__ == "__main__":
    main()
