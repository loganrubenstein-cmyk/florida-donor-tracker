"""
Script 93: Load solicitation stub orgs (dark money / shadow PACs) into Supabase.

Reads:
  data/processed/solicitation_stubs_resolved.csv  — from script 92

Creates / upserts one Supabase table:
  shadow_orgs — one row per stub org with IRS enrichment + candidate links

Run after script 92 completes.

Usage:
  python scripts/93_load_shadow_pacs_supabase.py
  python scripts/93_load_shadow_pacs_supabase.py --drop  # recreate table
"""

import os
import re
import sys
from pathlib import Path

import pandas as pd
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env.local")

DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set in .env.local")

STUBS_CSV  = PROJECT_ROOT / "data" / "processed" / "solicitation_stubs_resolved.csv"
BATCH_SIZE = 500


# ── Schema ────────────────────────────────────────────────────────────────────

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS shadow_orgs (
    id                  SERIAL PRIMARY KEY,
    org_name            TEXT NOT NULL,
    org_slug            TEXT UNIQUE NOT NULL,
    stub_type           TEXT,          -- '527' | '501c4' | 'unknown'
    irs_ein             TEXT,
    irs_name            TEXT,
    irs_status          TEXT,
    irs_ntee_code       TEXT,
    pp_total_revenue    NUMERIC(18,2),
    pp_total_expenses   NUMERIC(18,2),
    pp_total_assets     NUMERIC(18,2),
    pp_filing_year      INTEGER,
    pp_url              TEXT,
    matched_candidates  TEXT,          -- pipe-separated candidate names
    num_candidates      INTEGER DEFAULT 0,
    match_method        TEXT,          -- 'exact' | 'fuzzy' | 'unresolved'
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shadow_orgs_slug ON shadow_orgs(org_slug);
CREATE INDEX IF NOT EXISTS idx_shadow_orgs_type ON shadow_orgs(stub_type);
CREATE INDEX IF NOT EXISTS idx_shadow_orgs_revenue ON shadow_orgs(pp_total_revenue DESC NULLS LAST);
"""

DROP_TABLE = "DROP TABLE IF EXISTS shadow_orgs CASCADE;"


def slugify(name: str) -> str:
    s = str(name).lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"\s+", "-", s.strip())
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:120]


def safe_float(v) -> float | None:
    try:
        return float(v) if v not in (None, "", "nan") else None
    except (ValueError, TypeError):
        return None


def safe_int(v) -> int | None:
    try:
        return int(float(v)) if v not in (None, "", "nan") else None
    except (ValueError, TypeError):
        return None


def main(drop: bool = False) -> int:
    print("=== Script 93: Load Shadow Orgs → Supabase ===\n")

    if not STUBS_CSV.exists():
        print(f"ERROR: {STUBS_CSV} not found. Run script 92 first.")
        return 1

    df = pd.read_csv(STUBS_CSV, dtype=str).fillna("")
    print(f"  {len(df):,} stub rows from {STUBS_CSV.name}")

    con = psycopg2.connect(DB_URL)
    con.autocommit = False
    cur = con.cursor()

    try:
        if drop:
            cur.execute(DROP_TABLE)
        cur.execute(CREATE_TABLE)

        rows = []
        for _, r in df.iterrows():
            org_name = r.get("org_name", "").strip()
            if not org_name:
                continue

            matched = r.get("matched_candidates", "").strip()
            num_candidates = len([c for c in matched.split("|") if c.strip()]) if matched else 0

            rows.append((
                org_name,
                slugify(org_name),
                r.get("stub_type", "unknown").strip() or "unknown",
                r.get("irs_ein", "").strip() or None,
                r.get("irs_name", "").strip() or None,
                r.get("irs_status", "").strip() or None,
                r.get("irs_ntee_code", "").strip() or None,
                safe_float(r.get("pp_total_revenue")),
                safe_float(r.get("pp_total_expenses")),
                safe_float(r.get("pp_total_assets")),
                safe_int(r.get("pp_filing_year")),
                r.get("pp_url", "").strip() or None,
                matched or None,
                num_candidates,
                r.get("match_method", "unresolved").strip() or "unresolved",
            ))

        if rows:
            execute_values(
                cur,
                """
                INSERT INTO shadow_orgs
                    (org_name, org_slug, stub_type, irs_ein, irs_name, irs_status,
                     irs_ntee_code, pp_total_revenue, pp_total_expenses, pp_total_assets,
                     pp_filing_year, pp_url, matched_candidates, num_candidates, match_method)
                VALUES %s
                ON CONFLICT (org_slug) DO UPDATE SET
                    stub_type         = EXCLUDED.stub_type,
                    irs_ein           = EXCLUDED.irs_ein,
                    irs_name          = EXCLUDED.irs_name,
                    irs_status        = EXCLUDED.irs_status,
                    irs_ntee_code     = EXCLUDED.irs_ntee_code,
                    pp_total_revenue  = EXCLUDED.pp_total_revenue,
                    pp_total_expenses = EXCLUDED.pp_total_expenses,
                    pp_total_assets   = EXCLUDED.pp_total_assets,
                    pp_filing_year    = EXCLUDED.pp_filing_year,
                    pp_url            = EXCLUDED.pp_url,
                    matched_candidates = EXCLUDED.matched_candidates,
                    num_candidates    = EXCLUDED.num_candidates,
                    match_method      = EXCLUDED.match_method,
                    updated_at        = NOW()
                """,
                rows,
                page_size=BATCH_SIZE,
            )

        con.commit()
        print(f"  ✓ Upserted {len(rows):,} rows → shadow_orgs")

        # Summary
        cur.execute("SELECT stub_type, COUNT(*) FROM shadow_orgs GROUP BY stub_type ORDER BY COUNT(*) DESC")
        print("\n  By type:")
        for row in cur.fetchall():
            print(f"    {row[0]}: {row[1]}")

        cur.execute("SELECT COUNT(*) FROM shadow_orgs WHERE irs_ein IS NOT NULL")
        irs_matched = cur.fetchone()[0]
        print(f"\n  IRS-matched: {irs_matched} orgs with EINs")

        cur.execute("SELECT COUNT(*) FROM shadow_orgs WHERE num_candidates > 0")
        cand_linked = cur.fetchone()[0]
        print(f"  Candidate-linked: {cand_linked} orgs soliciting for known candidates")

    except Exception as e:
        con.rollback()
        print(f"\nERROR: {e}", file=sys.stderr)
        return 1
    finally:
        cur.close()
        con.close()

    print("\n=== DONE ===")
    print("Table: shadow_orgs")
    print("Next: Wire into CandidateProfile 'Committees' tab as shadow PAC section.")
    return 0


if __name__ == "__main__":
    drop = "--drop" in sys.argv
    sys.exit(main(drop=drop))
