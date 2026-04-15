"""
Script 95: Load FL state contract data into Supabase.

Reads:
  data/processed/fl_contracts.csv           — vendor totals (from script 94)
  data/processed/donor_contract_matches.csv — donor/principal → vendor links

Creates / upserts two Supabase tables:
  fl_vendor_contracts   — one row per vendor with aggregate totals
  donor_contract_links  — one row per donor/principal ↔ vendor match

Run after script 94 completes.

Usage:
  python scripts/95_load_contracts_supabase.py
  python scripts/95_load_contracts_supabase.py --drop  # recreate tables from scratch
"""

import os
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

CONTRACTS_CSV = PROJECT_ROOT / "data" / "processed" / "fl_contracts.csv"
MATCHES_CSV   = PROJECT_ROOT / "data" / "processed" / "donor_contract_matches.csv"
BATCH_SIZE    = 2000


# ── Schema ────────────────────────────────────────────────────────────────────

CREATE_CONTRACTS = """
CREATE TABLE IF NOT EXISTS fl_vendor_contracts (
    id              SERIAL PRIMARY KEY,
    vendor_name     TEXT NOT NULL,
    vendor_slug     TEXT UNIQUE NOT NULL,
    total_amount    NUMERIC(18,2) DEFAULT 0,
    num_contracts   INTEGER DEFAULT 0,
    top_agency      TEXT,
    all_agencies    TEXT,
    year_range      TEXT,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fl_vendor_contracts_slug ON fl_vendor_contracts(vendor_slug);
CREATE INDEX IF NOT EXISTS idx_fl_vendor_contracts_amount ON fl_vendor_contracts(total_amount DESC);
"""

CREATE_LINKS = """
CREATE TABLE IF NOT EXISTS donor_contract_links (
    id                      SERIAL PRIMARY KEY,
    entity_slug             TEXT NOT NULL,
    entity_name             TEXT NOT NULL,
    entity_type             TEXT NOT NULL,  -- 'donor_corporate' | 'principal'
    total_contributions     NUMERIC(18,2) DEFAULT 0,
    vendor_name             TEXT NOT NULL,
    vendor_slug             TEXT NOT NULL,
    total_contract_amount   NUMERIC(18,2) DEFAULT 0,
    num_contracts           INTEGER DEFAULT 0,
    top_agency              TEXT,
    year_range              TEXT,
    match_score             INTEGER DEFAULT 0,
    match_method            TEXT,  -- 'exact' | 'fuzzy'
    updated_at              TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entity_slug, vendor_slug)
);
CREATE INDEX IF NOT EXISTS idx_donor_contract_links_entity ON donor_contract_links(entity_slug);
CREATE INDEX IF NOT EXISTS idx_donor_contract_links_vendor ON donor_contract_links(vendor_slug);
CREATE INDEX IF NOT EXISTS idx_donor_contract_links_amount ON donor_contract_links(total_contract_amount DESC);
"""

DROP_CONTRACTS = "DROP TABLE IF EXISTS fl_vendor_contracts CASCADE;"
DROP_LINKS     = "DROP TABLE IF EXISTS donor_contract_links CASCADE;"


def slugify(name: str) -> str:
    import re
    s = str(name).lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"\s+", "-", s.strip())
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:120]


def load_contracts(cur, drop: bool) -> int:
    if not CONTRACTS_CSV.exists():
        print(f"  WARNING: {CONTRACTS_CSV.name} not found — skipping contracts load")
        return 0

    df = pd.read_csv(CONTRACTS_CSV, dtype=str).fillna("")
    print(f"  {len(df):,} vendor rows in {CONTRACTS_CSV.name}")

    if drop:
        cur.execute(DROP_CONTRACTS)
    cur.execute(CREATE_CONTRACTS)

    rows = []
    for _, r in df.iterrows():
        try:
            amount = float(r.get("total_amount", 0) or 0)
        except ValueError:
            amount = 0.0
        try:
            num = int(r.get("num_contracts", 0) or 0)
        except ValueError:
            num = 0

        vendor = r.get("vendor_name", "").strip()
        if not vendor:
            continue

        rows.append((
            vendor,
            slugify(vendor),
            amount,
            num,
            r.get("top_agency", ""),
            r.get("all_agencies", ""),
            r.get("year_range", ""),
        ))

    if rows:
        execute_values(
            cur,
            """
            INSERT INTO fl_vendor_contracts
                (vendor_name, vendor_slug, total_amount, num_contracts,
                 top_agency, all_agencies, year_range)
            VALUES %s
            ON CONFLICT (vendor_slug) DO UPDATE SET
                vendor_name   = EXCLUDED.vendor_name,
                total_amount  = EXCLUDED.total_amount,
                num_contracts = EXCLUDED.num_contracts,
                top_agency    = EXCLUDED.top_agency,
                all_agencies  = EXCLUDED.all_agencies,
                year_range    = EXCLUDED.year_range,
                updated_at    = NOW()
            """,
            rows,
            page_size=BATCH_SIZE,
        )
        print(f"  Upserted {len(rows):,} vendor rows → fl_vendor_contracts")

    return len(rows)


def load_links(cur, drop: bool) -> int:
    if not MATCHES_CSV.exists():
        print(f"  WARNING: {MATCHES_CSV.name} not found — skipping links load")
        return 0

    df = pd.read_csv(MATCHES_CSV, dtype=str).fillna("")
    print(f"  {len(df):,} match rows in {MATCHES_CSV.name}")

    if drop:
        cur.execute(DROP_LINKS)
    cur.execute(CREATE_LINKS)

    rows = []
    for _, r in df.iterrows():
        entity_slug  = r.get("entity_slug", "").strip()
        vendor_name  = r.get("vendor_name", "").strip()
        entity_name  = r.get("entity_name", "").strip()

        if not entity_slug or not vendor_name:
            continue

        try:
            contrib = float(r.get("total_contributions", 0) or 0)
        except ValueError:
            contrib = 0.0
        try:
            contract_amt = float(r.get("total_contract_amount", 0) or 0)
        except ValueError:
            contract_amt = 0.0
        try:
            num = int(r.get("num_contracts", 0) or 0)
        except ValueError:
            num = 0
        try:
            score = int(float(r.get("match_score", 0) or 0))
        except ValueError:
            score = 0

        rows.append((
            entity_slug,
            entity_name,
            r.get("entity_type", ""),
            contrib,
            vendor_name,
            slugify(vendor_name),
            contract_amt,
            num,
            r.get("top_agency", ""),
            r.get("year_range", ""),
            score,
            r.get("match_method", ""),
        ))

    if rows:
        execute_values(
            cur,
            """
            INSERT INTO donor_contract_links
                (entity_slug, entity_name, entity_type, total_contributions,
                 vendor_name, vendor_slug, total_contract_amount, num_contracts,
                 top_agency, year_range, match_score, match_method)
            VALUES %s
            ON CONFLICT (entity_slug, vendor_slug) DO UPDATE SET
                entity_name           = EXCLUDED.entity_name,
                total_contributions   = EXCLUDED.total_contributions,
                total_contract_amount = EXCLUDED.total_contract_amount,
                num_contracts         = EXCLUDED.num_contracts,
                top_agency            = EXCLUDED.top_agency,
                year_range            = EXCLUDED.year_range,
                match_score           = EXCLUDED.match_score,
                match_method          = EXCLUDED.match_method,
                updated_at            = NOW()
            """,
            rows,
            page_size=BATCH_SIZE,
        )
        print(f"  Upserted {len(rows):,} link rows → donor_contract_links")

    return len(rows)


def main(drop: bool = False) -> int:
    print("=== Script 95: Load FL Contracts → Supabase ===\n")

    con = psycopg2.connect(DB_URL)
    con.autocommit = False
    cur = con.cursor()

    try:
        print("Loading fl_vendor_contracts ...")
        n_contracts = load_contracts(cur, drop=drop)

        print("\nLoading donor_contract_links ...")
        n_links = load_links(cur, drop=drop)

        con.commit()
        print(f"\n✓ Committed: {n_contracts:,} vendors, {n_links:,} links")

    except Exception as e:
        con.rollback()
        print(f"\nERROR: {e}", file=sys.stderr)
        return 1
    finally:
        cur.close()
        con.close()

    print("\n=== DONE ===")
    print("Tables: fl_vendor_contracts, donor_contract_links")
    print("Next: Build /contracts page and API route in Next.js")
    return 0


if __name__ == "__main__":
    drop = "--drop" in sys.argv
    sys.exit(main(drop=drop))
