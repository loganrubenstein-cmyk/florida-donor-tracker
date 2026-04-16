"""
Script 97b: Enrich donors table with FL corporation data.

This is a repair/standalone version of script 97's enrich_donors phase.
Run this if script 97 completed the matching step but the ALTER TABLE / UPDATE
failed due to a pgbouncer connection timeout.

Prerequisites:
  - data/processed/fl_corporations.csv must exist (produced by script 97)
  - fl_corporations table must exist in Supabase (produced by script 97)

What it does:
  1. Adds corp_number, corp_ein, corp_status, corp_match_score columns to donors
  2. Fuzzy-matches fl_corporations.entity_name → donors.name
  3. Updates matched donors with corporate structure data

Usage:
  python scripts/97b_enrich_donors_from_corps.py
  python scripts/97b_enrich_donors_from_corps.py --dry-run
"""

import os
import re
import sys
from collections import defaultdict
from pathlib import Path

import pandas as pd
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values
from rapidfuzz import fuzz

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR, PROJECT_ROOT

load_dotenv(PROJECT_ROOT / ".env.local")
DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set in .env.local")

OUTPUT_CSV      = PROCESSED_DIR / "fl_corporations.csv"
BATCH_SIZE      = 2000
FUZZY_THRESHOLD = 82

_PUNCT = re.compile(r"[^\w\s-]")
_CORP_SUFFIXES = re.compile(
    r"\b(LLC|INC|CORP|LTD|LP|LLP|CO\b|GROUP|HOLDINGS|PARTNERS|ENTERPRISES"
    r"|SERVICES|SOLUTIONS|ASSOCIATES|CONSULTING|TECHNOLOGIES|SYSTEMS"
    r"|MANAGEMENT|FOUNDATION|TRUST|FUND|PA\b|PL\b|PLC|COMPANY|COMPANIES"
    r"|INTERNATIONAL|GLOBAL|NATIONAL|INDUSTRIES|PROPERTIES|REALTY|VENTURES)\b",
    re.IGNORECASE,
)

ALTER_DONORS = """
ALTER TABLE donors
    ADD COLUMN IF NOT EXISTS corp_number      TEXT,
    ADD COLUMN IF NOT EXISTS corp_ein         TEXT,
    ADD COLUMN IF NOT EXISTS corp_status      TEXT,
    ADD COLUMN IF NOT EXISTS corp_match_score INTEGER;
"""

# Executed separately: fix NUMERIC(5,3) → INTEGER if a prior run used wrong type
FIX_MATCH_SCORE_TYPE = """
ALTER TABLE donors
    ALTER COLUMN corp_match_score TYPE INTEGER USING corp_match_score::INTEGER;
"""

CREATE_DONORS_IDX = """
CREATE INDEX IF NOT EXISTS idx_donors_corp_number ON donors(corp_number);
"""


def norm(s):
    return " ".join(_PUNCT.sub(" ", str(s).upper()).split())


def norm_strip_corp(s):
    n = norm(s)
    return " ".join(_CORP_SUFFIXES.sub("", n).split())


def main(dry_run=False):
    print("=== Script 97b: Enrich Donors with FL Corp Data ===\n")
    if dry_run:
        print("  [DRY RUN] — no writes to Supabase\n")

    if not OUTPUT_CSV.exists():
        sys.exit(f"ERROR: {OUTPUT_CSV} not found. Run script 97 first.")

    # autocommit=True so no transaction is held open during the ~20min CSV load.
    # With transaction pooling, a SELECT in autocommit mode releases the server
    # connection immediately — no idle-in-transaction to block ALTER TABLE later.
    con = psycopg2.connect(DB_URL)
    con.autocommit = True
    cur = con.cursor()
    cur.execute("SET statement_timeout = 0")

    # ── 1. Fetch corporate donors ─────────────────────────────────────────────
    print("Step 1: Fetching corporate donors from Supabase ...", flush=True)
    cur.execute("""
        SELECT id, name FROM donors
        WHERE is_corporate = TRUE AND name IS NOT NULL AND name != ''
    """)
    donor_rows = cur.fetchall()

    if not donor_rows:
        _corp_pat = re.compile(
            r"\b(LLC|INC|CORP|LTD|LP|LLP|CO\b|GROUP|HOLDINGS|PARTNERS|ENTERPRISES"
            r"|SERVICES|SOLUTIONS|ASSOCIATES|CONSULTING|TECHNOLOGIES|SYSTEMS"
            r"|MANAGEMENT|FOUNDATION|TRUST|FUND|PA\b|PL\b|PLC)\b",
            re.IGNORECASE,
        )
        print("  No is_corporate=TRUE donors — fetching all + filtering ...", flush=True)
        cur.execute("SELECT id, name FROM donors WHERE name IS NOT NULL AND name != ''")
        all_rows = cur.fetchall()
        donor_rows = [(did, dname) for did, dname in all_rows if _corp_pat.search(str(dname))]

    print(f"  {len(donor_rows):,} corporate donors to match", flush=True)
    if not donor_rows:
        print("  Nothing to match. Exiting.")
        return 0

    # ── 2. Build corp lookup indexes from CSV ─────────────────────────────────
    print(f"\nStep 2: Building corp lookup from {OUTPUT_CSV.name} ...", flush=True)
    exact_by_norm  = {}
    exact_by_strip = {}
    prefix_index   = defaultdict(list)
    total_corps = 0

    for chunk in pd.read_csv(OUTPUT_CSV, dtype=str, chunksize=50_000):
        chunk = chunk.fillna("")
        for _, rec in chunk.iterrows():
            name = rec.get("entity_name", "")
            if not name:
                continue
            corp = {
                "corp_number":    rec["corp_number"],
                "ein":            rec.get("ein", ""),
                "status":         rec.get("status", ""),
                "name":           name,
                "norm":           norm(name),
                "norm_stripped":  norm_strip_corp(name),
            }
            exact_by_norm[corp["norm"]]           = corp
            exact_by_strip[corp["norm_stripped"]] = corp
            prefix_index[corp["norm_stripped"][:4]].append(corp)
            total_corps += 1

    print(f"  {total_corps:,} active FL corps loaded for matching", flush=True)

    # ── 3. Match ──────────────────────────────────────────────────────────────
    print(f"\nStep 3: Matching {len(donor_rows):,} donors ...", flush=True)
    matches = []
    for idx, (donor_id, donor_name) in enumerate(donor_rows):
        if idx % 5_000 == 0 and idx > 0:
            print(f"    {idx:,} / {len(donor_rows):,} processed ...", flush=True)

        d_norm  = norm(donor_name)
        d_strip = norm_strip_corp(donor_name)

        corp = exact_by_norm.get(d_norm) or exact_by_strip.get(d_strip)
        if corp:
            matches.append((corp["corp_number"], corp["ein"], corp["status"], 100, donor_id))
            continue

        candidates = prefix_index.get(d_strip[:4], [])
        best_score, best_corp = 0, None
        for c in candidates:
            score = fuzz.token_sort_ratio(d_strip, c["norm_stripped"])
            if score > best_score and score >= FUZZY_THRESHOLD:
                best_score, best_corp = score, c
        if best_corp:
            matches.append((best_corp["corp_number"], best_corp["ein"], best_corp["status"], best_score, donor_id))

    print(f"  Matched: {len(matches):,} donors linked to FL corporations", flush=True)
    if not matches:
        print("  No matches found.")
        return 0

    # ── 4. Apply schema changes + update ──────────────────────────────────────
    if dry_run:
        print(f"\n  [dry-run] Would write {len(matches):,} donor corp enrichments")
        print("  Sample (first 10):")
        try:
            cur.execute("SELECT id, name FROM donors WHERE id = ANY(%s)", ([m[4] for m in matches[:10]],))
            id_to_name = {row[0]: row[1] for row in cur.fetchall()}
        except Exception:
            id_to_name = {}
        for m in matches[:10]:
            print(f"    '{id_to_name.get(m[4], m[4])}' → corp {m[0]} (score={m[3]})")
        return len(matches)

    # Reconnect with autocommit=False for the DDL + UPDATE phase.
    # The initial connection used autocommit=True (every statement already
    # committed), so no rollback is needed — just close cleanly.
    try:
        cur.close()
        con.close()
    except Exception:
        pass
    con = psycopg2.connect(DB_URL)
    con.autocommit = False
    cur = con.cursor()
    cur.execute("SET statement_timeout = 0")

    print("\nStep 4: Applying ALTER TABLE + index ...", flush=True)
    cur.execute(ALTER_DONORS)
    cur.execute(FIX_MATCH_SCORE_TYPE)   # ensure INTEGER, not NUMERIC
    cur.execute(CREATE_DONORS_IDX)

    print("Step 5: Bulk-updating donors via temp table ...", flush=True)
    cur.execute("""
        CREATE TEMP TABLE _corp_enrichments (
            corp_number      TEXT,
            corp_ein         TEXT,
            corp_status      TEXT,
            corp_match_score INTEGER,
            donor_id         INTEGER
        ) ON COMMIT DROP
    """)
    execute_values(
        cur,
        "INSERT INTO _corp_enrichments VALUES %s",
        matches,
        page_size=BATCH_SIZE,
    )
    cur.execute("""
        UPDATE donors d
        SET    corp_number      = e.corp_number,
               corp_ein         = e.corp_ein,
               corp_status      = e.corp_status,
               corp_match_score = e.corp_match_score
        FROM   _corp_enrichments e
        WHERE  d.id = e.donor_id
    """)
    updated = cur.rowcount
    con.commit()
    print(f"  Updated {updated:,} donor rows with corp data", flush=True)

    cur.close()
    con.close()

    print("\n=== DONE ===")
    print(f"  {updated:,} donors now have corp_number / corp_ein / corp_status / corp_match_score")
    return 0


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    sys.exit(main(dry_run=dry_run))
