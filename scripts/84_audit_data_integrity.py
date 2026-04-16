"""
Script 84: Data Integrity Audit (15 checks, A–O).

Read-only. Runs every check against the live DB, writes per-check results +
pass/fail summary to data/logs/integrity_audit_YYYY-MM-DD.json, and exits
non-zero if any check is classified FAIL.

Run this before every quarterly data update, after any backfill script, and
via the nightly-smoke workflow.

Exit codes:
  0  = all checks passed (WARN is non-blocking)
  1  = at least one check returned FAIL
  2  = script crashed before reaching the summary

Usage:
    .venv/bin/python scripts/84_audit_data_integrity.py
    .venv/bin/python scripts/84_audit_data_integrity.py --only A,B,M    # subset
"""

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path

import psycopg2
import psycopg2.extras
import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")

DB_URL = os.environ.get("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("SUPABASE_DB_URL not set in .env.local")

LOG_DIR = ROOT / "data" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
OUT_FILE = LOG_DIR / f"integrity_audit_{date.today()}.json"
ANCHORS_YAML = ROOT / "data" / "external_anchors.yaml"


# ── Helpers ───────────────────────────────────────────────────────────────────

class CheckResult:
    __slots__ = ("check", "status", "message", "details")

    def __init__(self, check, status, message, details=None):
        self.check = check
        self.status = status   # 'PASS' | 'WARN' | 'FAIL'
        self.message = message
        self.details = details or {}

    def to_dict(self):
        return {
            "check": self.check,
            "status": self.status,
            "message": self.message,
            "details": self.details,
        }


def _table_exists(cur, name):
    cur.execute(
        "select 1 from pg_class where relname = %s and relkind in ('r','m','v')",
        (name,),
    )
    return cur.fetchone() is not None


def _header(letter, title):
    print("\n" + "=" * 64)
    print(f"CHECK {letter}: {title}")
    print("=" * 64)


# ── Checks ────────────────────────────────────────────────────────────────────

def check_a_committee_mismatch(cur):
    """A — Committees with money but no contribution rows."""
    _header("A", "Committees with money but no contribution rows")
    cur.execute("""
        SELECT acct_num, committee_name, total_received::float,
               (SELECT COUNT(*) FROM contributions
                WHERE recipient_acct = committees.acct_num) AS contrib_count
        FROM committees
        WHERE total_received > 100000
          AND (SELECT COUNT(*) FROM contributions
               WHERE recipient_acct = committees.acct_num) = 0
        ORDER BY total_received DESC
        LIMIT 200
    """)
    rows = [dict(r) for r in cur.fetchall()]
    status = "FAIL" if rows else "PASS"
    msg = f"{len(rows)} committees have money but no contribution rows" if rows else "no mismatches"
    for r in rows[:10]:
        print(f"  [{r['acct_num']}] {r['committee_name'][:50]}  ${r['total_received']:,.2f}")
    return CheckResult("A_committee_mismatch", status, msg, {"rows": rows})


def check_b_aggregate_drift(cur):
    """B — donors_mv/donors total vs live SUM of contributions (drift > $100)."""
    _header("B", "Donor stored total vs live contributions SUM (drift > $100)")

    table = "donors_mv" if _table_exists(cur, "donors_mv") else "donors"
    total_col = "total_combined" if table == "donors_mv" else "total_soft"
    cur.execute(f"SELECT slug, name, {total_col}::float AS stored FROM {table} WHERE {total_col} > 10000")
    stored = {r["slug"]: r for r in cur.fetchall()}

    cur.execute("""
        SELECT donor_slug, SUM(amount)::float AS actual
        FROM contributions
        WHERE donor_slug IS NOT NULL
        GROUP BY donor_slug
    """)
    live = {r["donor_slug"]: r["actual"] for r in cur.fetchall()}

    rows = []
    for slug, d in stored.items():
        actual = live.get(slug, 0.0)
        drift = abs(d["stored"] - actual)
        if drift > 100:
            rows.append({"slug": slug, "name": d["name"], "stored": d["stored"], "actual": actual, "drift": drift})
    rows.sort(key=lambda x: -x["drift"])
    rows = rows[:100]

    status = "FAIL" if rows else "PASS"
    msg = f"{len(rows)} donors with drift > $100" if rows else "no aggregate drift"
    for r in rows[:5]:
        print(f"  {r['name'][:40]:<40}  stored=${r['stored']:>14,.2f}  actual=${r['actual']:>14,.2f}  drift=${r['drift']:>12,.2f}")
    return CheckResult("B_aggregate_drift", status, msg, {"source_table": table, "rows": rows})


def check_c_ghost_slugs(cur):
    """C — contributions rows whose donor_slug has no donors row."""
    _header("C", "Ghost donor slugs (contributions ref unknown donor)")
    target = "donors_mv" if _table_exists(cur, "donors_mv") else "donors"
    cur.execute(f"""
        SELECT COUNT(DISTINCT c.donor_slug) AS distinct_ghost_slugs,
               COUNT(*)::bigint             AS total_ghost_rows,
               SUM(c.amount)::float         AS total_ghost_amount
        FROM contributions c
        LEFT JOIN {target} d ON d.slug = c.donor_slug
        WHERE c.donor_slug IS NOT NULL AND d.slug IS NULL
    """)
    summary = cur.fetchone()
    print(f"  distinct={summary['distinct_ghost_slugs'] or 0:,}  rows={summary['total_ghost_rows'] or 0:,}  $={(summary['total_ghost_amount'] or 0):,.2f}")
    status = "FAIL" if (summary["distinct_ghost_slugs"] or 0) > 0 else "PASS"
    return CheckResult("C_ghost_slugs", status, f"{summary['distinct_ghost_slugs'] or 0} ghost slugs",
                       {"summary": dict(summary)})


def check_d_truncation(cur):
    """D — Suspiciously truncated donor names."""
    _header("D", "Possible truncated donor names (28–32 char all-caps)")
    table = "donors_mv" if _table_exists(cur, "donors_mv") else "donors"
    total_col = "total_combined" if table == "donors_mv" else "total_soft"
    cur.execute(f"""
        SELECT slug, name, {total_col}::float AS total
        FROM {table}
        WHERE LENGTH(name) BETWEEN 28 AND 32
          AND name = UPPER(name)
          AND name ~ '^[A-Z0-9 ,\\.&/-]+$'
          AND name NOT LIKE '% JR%' AND name NOT LIKE '% SR%'
          AND name NOT LIKE '% III%' AND name NOT LIKE '% II%'
        ORDER BY {total_col} DESC
        LIMIT 50
    """)
    rows = [dict(r) for r in cur.fetchall()]
    status = "WARN" if rows else "PASS"
    for r in rows[:5]:
        print(f"  [{len(r['name'])} chars] {r['name']:<32}  ${r['total']:>12,.2f}")
    return CheckResult("D_truncation_suspects", status,
                       f"{len(rows)} likely-truncated names" if rows else "none",
                       {"rows": rows})


def check_e_shadow_pac_gap(cur):
    """E — committees listed in a solicitation but missing from committees."""
    _header("E", "Committees in solicitations but missing from committees table")
    if not _table_exists(cur, "committee_solicitations"):
        return CheckResult("E_shadow_pac_gap", "PASS", "no solicitations table — skipping", {})
    cur.execute("""
        SELECT DISTINCT cs.acct_num
        FROM committee_solicitations cs
        LEFT JOIN committees c ON c.acct_num = cs.acct_num
        WHERE cs.acct_num IS NOT NULL
          AND c.acct_num IS NULL
    """)
    rows = [dict(r) for r in cur.fetchall()]
    status = "FAIL" if rows else "PASS"
    msg = f"{len(rows)} solicitation acct_nums missing from committees"
    return CheckResult("E_shadow_pac_gap", status, msg, {"missing_acct_nums": rows[:100]})


def check_f_orphan_aliases(cur):
    """F — contributions with donor_slug that has no donor_entities row."""
    _header("F", "Orphan donor_slugs (no donor_entities row)")
    if not _table_exists(cur, "donor_entities"):
        return CheckResult("F_orphan_aliases", "PASS", "no donor_entities — canonical model not applied", {})
    cur.execute("""
        SELECT c.donor_slug, COUNT(*)::int AS n, SUM(c.amount)::float AS total
        FROM contributions c
        LEFT JOIN donor_entities de ON de.canonical_slug = c.donor_slug
        WHERE c.donor_slug IS NOT NULL AND de.canonical_slug IS NULL
        GROUP BY c.donor_slug
        ORDER BY total DESC
        LIMIT 50
    """)
    rows = [dict(r) for r in cur.fetchall()]
    status = "FAIL" if rows else "PASS"
    return CheckResult("F_orphan_aliases", status,
                       f"{len(rows)} donor_slugs have no canonical entity",
                       {"rows": rows})


def check_g_missing_edges(cur):
    """G — candidates with filed solicitations but zero linkage edges."""
    _header("G", "Candidates with solicitation filings but no linkage edges")
    if not _table_exists(cur, "candidate_pc_edges"):
        return CheckResult("G_missing_edges", "PASS", "no candidate_pc_edges — skipping", {})
    # Candidates whose last_name appears in a solicitation but who have 0 edges.
    cur.execute("""
        SELECT c.acct_num, c.candidate_name
        FROM candidates c
        WHERE NOT EXISTS (
            SELECT 1 FROM candidate_pc_edges e
            WHERE e.candidate_acct_num = c.acct_num AND e.is_publishable
        )
        AND EXISTS (
            SELECT 1 FROM committee_solicitations cs
            WHERE cs.solicitors ILIKE '%' || split_part(c.candidate_name, ' ', -1) || '%'
        )
        LIMIT 50
    """)
    rows = [dict(r) for r in cur.fetchall()]
    status = "WARN" if rows else "PASS"
    return CheckResult("G_missing_edges", status,
                       f"{len(rows)} candidates have a solicitation but 0 edges",
                       {"rows": rows})


def check_h_conflicting_link_types(cur):
    """H — edges with identical (candidate, pc) but conflicting directions."""
    _header("H", "Conflicting link directions for same (candidate, pc) pair")
    if not _table_exists(cur, "candidate_pc_edges"):
        return CheckResult("H_conflicting_links", "PASS", "no edges table", {})
    cur.execute("""
        SELECT candidate_acct_num, pc_acct_num,
               COUNT(DISTINCT direction) AS n_directions
        FROM candidate_pc_edges
        WHERE is_publishable
          AND direction IS NOT NULL
          AND direction <> ''
          AND pc_acct_num IS NOT NULL
        GROUP BY candidate_acct_num, pc_acct_num
        HAVING COUNT(DISTINCT direction) > 1
    """)
    rows = [dict(r) for r in cur.fetchall()]
    status = "FAIL" if rows else "PASS"
    return CheckResult("H_conflicting_links", status,
                       f"{len(rows)} pairs with conflicting directions",
                       {"rows": rows[:50]})


def check_i_top_donors_consistency(cur):
    """I — homepage top-100: donors_mv total matches contributions SUM."""
    _header("I", "Top-100 donors: materialized view vs live SUM (per-donor)")
    table = "donors_mv" if _table_exists(cur, "donors_mv") else "donors"
    total_col = "total_combined" if table == "donors_mv" else "total_soft"
    cur.execute(f"""
        SELECT slug, name, {total_col}::float AS stored
        FROM {table}
        ORDER BY {total_col} DESC
        LIMIT 100
    """)
    top = cur.fetchall()
    if not top:
        return CheckResult("I_top_donors_consistency", "WARN", "no donors found", {})
    slugs = tuple(r["slug"] for r in top)
    cur.execute(
        "SELECT donor_slug, SUM(amount)::float AS actual FROM contributions "
        "WHERE donor_slug = ANY(%s) GROUP BY donor_slug",
        ([s for s in slugs],),
    )
    live = {r["donor_slug"]: r["actual"] for r in cur.fetchall()}
    drift = []
    for r in top:
        actual = live.get(r["slug"], 0.0)
        if abs((r["stored"] or 0) - actual) > 1:
            drift.append({"slug": r["slug"], "name": r["name"], "stored": r["stored"], "actual": actual})
    status = "FAIL" if drift else "PASS"
    return CheckResult("I_top_donors_consistency", status,
                       f"{len(drift)} of top 100 donors drift > $1", {"rows": drift})


def check_j_expend_gap(cur):
    """J — committees with >$1M raised but zero expenditures (likely scrape gap)."""
    _header("J", "Scrape-gap detector: $1M+ raised, 0 expenditures")
    if not _table_exists(cur, "committee_expenditure_summary"):
        return CheckResult("J_expend_gap", "PASS", "no expenditure_summary — skipping", {})
    cur.execute("""
        SELECT c.acct_num, c.committee_name, c.total_received::float
        FROM committees c
        LEFT JOIN committee_expenditure_summary e ON e.acct_num = c.acct_num
        WHERE c.total_received >= 1000000
          AND (e.num_expenditures IS NULL OR e.num_expenditures = 0)
        ORDER BY c.total_received DESC
        LIMIT 100
    """)
    rows = [dict(r) for r in cur.fetchall()]
    # This is usually expend.exe being down, not a data truth — classify WARN, not FAIL.
    status = "WARN" if rows else "PASS"
    return CheckResult("J_expend_gap", status,
                       f"{len(rows)} committees missing expenditures",
                       {"rows": rows[:20]})


def check_k_former_name_coverage(cur):
    """K — closed committees should have former_names OR a status reason."""
    _header("K", "Closed committees with no former_names entry")
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'committees' AND column_name IN ('former_names','status')
    """)
    cols = {r["column_name"] for r in cur.fetchall()}
    if not ("former_names" in cols and "status" in cols):
        return CheckResult("K_former_name_coverage", "PASS", "name-history columns not present", {})
    cur.execute("""
        SELECT acct_num, committee_name, status::text
        FROM committees
        WHERE status IN ('closed','terminated','revoked','dissolved')
          AND (former_names IS NULL OR jsonb_array_length(former_names) = 0)
        ORDER BY total_received DESC NULLS LAST
        LIMIT 100
    """)
    rows = [dict(r) for r in cur.fetchall()]
    status = "WARN" if rows else "PASS"
    return CheckResult("K_former_name_coverage", status,
                       f"{len(rows)} closed committees missing former_names",
                       {"rows": rows[:20]})


def check_l_solicitation_unmatched(cur):
    """L — solicitation orgs that didn't match any committee name."""
    _header("L", "Solicitation orgs with no matching committee")
    if not _table_exists(cur, "committee_solicitations"):
        return CheckResult("L_solicitation_unmatched", "PASS", "no solicitations table", {})
    cur.execute("""
        SELECT DISTINCT organization
        FROM committee_solicitations
        WHERE acct_num IS NULL
          AND organization IS NOT NULL
          AND organization <> ''
        LIMIT 100
    """)
    rows = [dict(r) for r in cur.fetchall()]
    status = "WARN" if rows else "PASS"
    return CheckResult("L_solicitation_unmatched", status,
                       f"{len(rows)} solicitations have no matched committee",
                       {"rows": rows[:30]})


def check_m_external_anchors(cur):
    """M — drift vs published totals in data/external_anchors.yaml."""
    _header("M", "External anchor comparison (data/external_anchors.yaml)")
    if not ANCHORS_YAML.exists():
        return CheckResult("M_external_anchors", "PASS", "no anchors file — skipping", {})
    anchors = yaml.safe_load(ANCHORS_YAML.read_text()).get("anchors", [])
    fail_rows, warn_rows = [], []
    for a in anchors:
        et = a["entity_type"]
        metric = a["anchor_metric"]
        expected = float(a["anchor_value"])
        tol = float(a.get("tolerance_pct", 5.0)) / 100.0
        actual = None
        if et == "donor":
            slug = a["entity_slug"]
            cur.execute(
                "SELECT COALESCE(SUM(amount),0)::float FROM contributions WHERE donor_slug = %s",
                (slug,),
            )
            actual = cur.fetchone()["coalesce"]
        elif et == "committee":
            acct = a["entity_acct_num"]
            cur.execute(
                "SELECT COALESCE(total_received,0)::float FROM committees WHERE acct_num = %s",
                (acct,),
            )
            r = cur.fetchone()
            actual = r["coalesce"] if r else 0.0
        elif et == "cycle":
            yr = int(a.get("anchor_year") or a["entity_slug"])
            cur.execute(
                "SELECT COALESCE(SUM(amount),0)::float FROM contributions "
                "WHERE EXTRACT(year FROM contribution_date) = %s",
                (yr,),
            )
            actual = cur.fetchone()["coalesce"]
        else:
            continue
        if actual is None:
            continue
        drift = abs(actual - expected) / expected if expected else 0.0
        record = {
            "anchor": a.get("entity_slug") or a.get("entity_acct_num"),
            "metric": metric,
            "expected": expected,
            "actual": actual,
            "drift_pct": drift * 100,
            "tolerance_pct": tol * 100,
        }
        if drift > tol:
            fail_rows.append(record)
            print(f"  FAIL  {record['anchor']:<32}  expected=${expected:>14,.0f}  actual=${actual:>14,.0f}  drift={drift*100:.1f}%")
        else:
            warn_rows.append(record)
            print(f"  pass  {record['anchor']:<32}  expected=${expected:>14,.0f}  actual=${actual:>14,.0f}  drift={drift*100:.1f}%")
    status = "FAIL" if fail_rows else "PASS"
    return CheckResult("M_external_anchors", status,
                       f"{len(fail_rows)} anchors outside tolerance",
                       {"fails": fail_rows, "passes": warn_rows})


def check_n_candidate_totals_present(cur):
    """N — spot check: 100 random candidates, totals > 0 where expected."""
    _header("N", "Candidate totals sanity (100 random candidates)")
    cur.execute("""
        SELECT acct_num, candidate_name, total_combined::float
        FROM candidates
        WHERE status_desc ILIKE '%active%' OR status_desc IS NULL
        ORDER BY random()
        LIMIT 100
    """)
    rows = cur.fetchall()
    zero = [dict(r) for r in rows if (r["total_combined"] or 0) == 0]
    # Many candidates legitimately have $0, so this is a WARN check not FAIL.
    status = "WARN" if len(zero) > 75 else "PASS"
    return CheckResult("N_candidate_totals", status,
                       f"{len(zero)}/100 sampled candidates have $0 total",
                       {"zero_candidates": zero[:20]})


def check_o_cycle_totals(cur):
    """O — report per-cycle contribution totals (for manual cross-check)."""
    _header("O", "Per-cycle contribution totals")
    cur.execute("""
        SELECT EXTRACT(year FROM contribution_date)::int AS year,
               COUNT(*)::bigint AS n,
               SUM(amount)::float AS total
        FROM contributions
        WHERE contribution_date IS NOT NULL
        GROUP BY year
        ORDER BY year DESC
        LIMIT 20
    """)
    rows = [dict(r) for r in cur.fetchall()]
    for r in rows[:10]:
        print(f"  {r['year']}  n={r['n']:>10,}  $={r['total']:>18,.0f}")
    return CheckResult("O_cycle_totals", "PASS", f"{len(rows)} cycles reported", {"rows": rows})


# ── Orchestrator ─────────────────────────────────────────────────────────────

ALL_CHECKS = [
    ("A", check_a_committee_mismatch),
    ("B", check_b_aggregate_drift),
    ("C", check_c_ghost_slugs),
    ("D", check_d_truncation),
    ("E", check_e_shadow_pac_gap),
    ("F", check_f_orphan_aliases),
    ("G", check_g_missing_edges),
    ("H", check_h_conflicting_link_types),
    ("I", check_i_top_donors_consistency),
    ("J", check_j_expend_gap),
    ("K", check_k_former_name_coverage),
    ("L", check_l_solicitation_unmatched),
    ("M", check_m_external_anchors),
    ("N", check_n_candidate_totals_present),
    ("O", check_o_cycle_totals),
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", help="comma-separated check letters (e.g. A,B,M)")
    args = parser.parse_args()

    selected = set((args.only or "").upper().split(",")) if args.only else None

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SET statement_timeout = 0")

    results = []
    for letter, fn in ALL_CHECKS:
        if selected and letter not in selected:
            continue
        try:
            results.append(fn(cur))
        except Exception as e:
            results.append(CheckResult(f"{letter}_error", "FAIL", f"exception: {e}"))

    cur.close()
    conn.close()

    # Summary
    print("\n" + "=" * 64)
    print("SUMMARY")
    print("=" * 64)
    tally = {"PASS": 0, "WARN": 0, "FAIL": 0}
    for r in results:
        tally[r.status] = tally.get(r.status, 0) + 1
        print(f"  [{r.status:<4}] {r.check:<32}  {r.message}")
    print(f"\n  PASS={tally['PASS']}  WARN={tally['WARN']}  FAIL={tally['FAIL']}")

    report = {
        "audit_date": str(date.today()),
        "tally": tally,
        "results": [r.to_dict() for r in results],
    }
    OUT_FILE.write_text(json.dumps(report, indent=2, default=str))
    print(f"\n  Full report → {OUT_FILE}")

    return 1 if tally["FAIL"] else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"FATAL: {e}", file=sys.stderr)
        sys.exit(2)
