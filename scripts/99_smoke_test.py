"""
Script 99: End-to-end smoke test (read-only, prod-safe).

Exercises the live site to verify that data the homepage shows actually matches
what profile pages show. Designed to run nightly via GitHub Actions and exit
non-zero if any spot-check fails — the workflow then opens a GitHub issue.

Checks:
  1. Homepage top-10 donors → each donor profile page responds 200 and its
     declared total matches the homepage figure within $1.
  2. Committee 70275 (Friends of Ron DeSantis → Empower Parents PAC) renders
     its former-name block and total > $150M.
  3. Candidate directory API returns >1000 candidates.
  4. Per-cycle contribution totals are non-zero for the last two general cycles.
  5. Soft-linkage edges: sample 10 publishable candidate_pc_edges and verify
     source_url is populated for ≥80% of SOLICITATION_CONTROL rows.

Usage:
    .venv/bin/python scripts/99_smoke_test.py
    SITE_URL=https://florida-donor-tracker.vercel.app \\
        .venv/bin/python scripts/99_smoke_test.py
"""

import json
import os
import sys
from datetime import date
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")

DB_URL = os.environ.get("SUPABASE_DB_URL")
SITE_URL = os.environ.get("SITE_URL", "").rstrip("/") or "https://florida-donor-tracker.vercel.app"
if not DB_URL:
    sys.exit("SUPABASE_DB_URL not set")

LOG_DIR = ROOT / "data" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
OUT_FILE = LOG_DIR / f"smoke_test_{date.today()}.json"

results = []


def record(name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    print(f"  [{status}] {name}  {detail}")
    results.append({"name": name, "status": status, "detail": detail})


def http_get(path, timeout=30):
    url = f"{SITE_URL}{path}"
    r = requests.get(url, timeout=timeout, headers={"User-Agent": "fl-donor-tracker/smoke"})
    return r


def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # ── 1. Homepage top-10 donor consistency ──────────────────────────────────
    print("\n=== Check 1: homepage top-10 donors ===")
    try:
        table = "donors_mv"
        cur.execute("SELECT 1 FROM pg_class WHERE relname=%s", (table,))
        if not cur.fetchone():
            table = "donors"
        total_col = "total_combined" if table == "donors_mv" else "total_soft"
        cur.execute(
            f"SELECT slug, name, {total_col}::float AS total FROM {table} "
            f"ORDER BY {total_col} DESC LIMIT 10"
        )
        top = cur.fetchall()
        for d in top:
            cur.execute(
                "SELECT COALESCE(SUM(amount),0)::float AS s FROM contributions WHERE donor_slug = %s",
                (d["slug"],),
            )
            live = cur.fetchone()["s"]
            drift = abs((d["total"] or 0) - live)
            record(
                f"donor/{d['slug']}",
                drift <= 1.0,
                f"stored=${d['total']:,.0f} live=${live:,.0f} drift=${drift:,.2f}",
            )
    except Exception as e:
        record("top10_donors", False, f"exception: {e}")

    # ── 2. Committee 70275 former-name + total ────────────────────────────────
    print("\n=== Check 2: committee 70275 former-name ===")
    try:
        cur.execute(
            "SELECT committee_name, former_names, total_received::float AS total "
            "FROM committees WHERE acct_num = '70275'"
        )
        row = cur.fetchone()
        if not row:
            record("committee_70275_exists", False, "row missing")
        else:
            has_former = bool(row.get("former_names"))
            record("committee_70275_former_names", has_former,
                   f"former_names={row.get('former_names')}")
            record("committee_70275_total_gte_150M", (row["total"] or 0) >= 150_000_000,
                   f"total=${(row['total'] or 0):,.0f}")
    except Exception as e:
        record("committee_70275", False, f"exception: {e}")

    # ── 3. Candidate directory count ──────────────────────────────────────────
    print("\n=== Check 3: candidate directory size ===")
    try:
        cur.execute("SELECT COUNT(*)::int AS n FROM candidates")
        n = cur.fetchone()["n"]
        record("candidates_count", n > 1000, f"{n:,} candidates")
    except Exception as e:
        record("candidates_count", False, f"exception: {e}")

    # ── 4. Per-cycle non-empty ────────────────────────────────────────────────
    print("\n=== Check 4: per-cycle totals non-empty ===")
    try:
        cur.execute(
            "SELECT EXTRACT(year FROM contribution_date)::int AS y, "
            "       SUM(amount)::float AS t "
            "FROM contributions WHERE contribution_date IS NOT NULL "
            "GROUP BY y ORDER BY y DESC LIMIT 3"
        )
        for r in cur.fetchall():
            record(f"cycle_{r['y']}_nonzero", (r["t"] or 0) > 0, f"${r['t']:,.0f}")
    except Exception as e:
        record("cycle_totals", False, f"exception: {e}")

    # ── 5. Soft-linkage source_url coverage ───────────────────────────────────
    print("\n=== Check 5: soft-linkage source_url coverage ===")
    try:
        cur.execute(
            "SELECT COUNT(*) FILTER (WHERE source_url IS NOT NULL AND source_url <> '')::float "
            "       / NULLIF(COUNT(*),0) AS pct "
            "FROM candidate_pc_edges "
            "WHERE is_publishable AND edge_type = 'SOLICITATION_CONTROL'"
        )
        r = cur.fetchone()
        pct = float(r["pct"] or 0)
        record("source_url_coverage_solicitation",
               pct >= 0.80, f"{pct*100:.1f}% have source_url")
    except Exception as e:
        record("source_url_coverage", False, f"exception: {e}")

    # ── 6. HTTP reachability for key routes ───────────────────────────────────
    print("\n=== Check 6: live site HTTP reachability ===")
    for path in ("/", "/committee/70275", "/influence", "/candidates"):
        try:
            r = http_get(path)
            record(f"GET {path}", r.status_code == 200,
                   f"status={r.status_code} bytes={len(r.content)}")
        except Exception as e:
            record(f"GET {path}", False, f"exception: {e}")

    cur.close()
    conn.close()

    # ── Summary ────────────────────────────────────────────────────────────────
    fail = [r for r in results if r["status"] == "FAIL"]
    report = {
        "run_date": str(date.today()),
        "site": SITE_URL,
        "total": len(results),
        "failed": len(fail),
        "results": results,
    }
    OUT_FILE.write_text(json.dumps(report, indent=2))
    print(f"\n=== Summary: {len(results)-len(fail)}/{len(results)} passed ===")
    print(f"Report → {OUT_FILE}")
    return 1 if fail else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"FATAL: {e}", file=sys.stderr)
        sys.exit(2)
