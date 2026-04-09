#!/usr/bin/env python3
"""
53_backfill_top_donor_details.py

Ensures donor_committees, donor_candidates, and donor_by_year are fully
populated in Supabase for all donors with total_combined >= $10K (approx.
the top ~25K donors by giving volume).

Why this exists:
  The initial Supabase load (script 40) reads detail data from static JSON
  files in public/data/donors/*.json which are gitignored.  If a deployment
  or local re-setup skipped generating those files, the detail tables will be
  empty even though the donors row exists.  This script rebuilds them directly
  from the source CSVs so profiles render with rich content.

Usage:
    cd ~/Claude\ Projects/florida-donor-tracker
    source .venv/bin/activate
    python scripts/53_backfill_top_donor_details.py
    python scripts/53_backfill_top_donor_details.py --min-total 5000   # lower threshold
    python scripts/53_backfill_top_donor_details.py --dry-run           # show counts, no writes
"""

import argparse
import os
import re
import sys
from pathlib import Path
from collections import defaultdict

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env.local")

DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set in .env.local")

PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
DEDUPED_CSV      = PROCESSED_DIR / "contributions_deduped.csv"
CAND_CONTRIB_CSV = PROCESSED_DIR / "candidate_contributions.csv"
COMMITTEES_CSV   = PROCESSED_DIR / "committees.csv"

BATCH_SIZE  = 5000
TOP_COMM    = 25
TOP_CAND    = 20
DEFAULT_MIN = 10_000


def slugify(name: str) -> str:
    s = str(name).lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_]+", "-", s).strip("-")
    s = re.sub(r"-{2,}", "-", s)
    return s[:120]


def acct_from_source(source_file: str) -> str | None:
    if not isinstance(source_file, str):
        return None
    m = re.search(r"Contrib_(\d+)\.txt", source_file, re.IGNORECASE)
    return m.group(1) if m else None


def load_committee_names() -> dict:
    try:
        df = pd.read_csv(COMMITTEES_CSV, dtype=str, low_memory=False)
        acct_col = next((c for c in df.columns if "acct" in c.lower()), None)
        name_col = next((c for c in df.columns if "name" in c.lower()), None)
        if acct_col and name_col:
            return dict(zip(df[acct_col].str.strip(), df[name_col].str.strip()))
    except Exception as e:
        print(f"  Warning: could not load committee names: {e}")
    return {}


def flush(cur, sql, rows):
    if not rows:
        return 0
    execute_values(cur, sql, rows, page_size=BATCH_SIZE)
    return len(rows)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-total", type=float, default=DEFAULT_MIN,
                        help=f"Minimum total_combined to qualify (default: ${DEFAULT_MIN:,.0f})")
    parser.add_argument("--dry-run", action="store_true",
                        help="Compute counts only, do not write to Supabase")
    args = parser.parse_args()

    print(f"=== Script 53: Backfill Top Donor Details (min ${args.min_total:,.0f}) ===")
    if args.dry_run:
        print("  DRY RUN — no writes")

    # ── Load soft money ───────────────────────────────────────────────────────
    print("Loading soft-money contributions…")
    soft = pd.read_csv(
        DEDUPED_CSV,
        dtype={"source_file": str, "canonical_name": str,
               "contributor_occupation": str, "contributor_city_state_zip": str},
        low_memory=False,
    )
    soft["amount"]      = pd.to_numeric(soft["amount"], errors="coerce").fillna(0)
    soft["report_year"] = pd.to_numeric(soft["report_year"], errors="coerce")
    soft["acct_num"]    = soft["source_file"].apply(acct_from_source)
    soft = soft.dropna(subset=["canonical_name", "acct_num"])
    soft = soft[soft["amount"] > 0]
    print(f"  {len(soft):,} rows")

    # ── Load hard money ───────────────────────────────────────────────────────
    print("Loading hard-money (candidate) contributions…")
    hard = pd.read_csv(
        CAND_CONTRIB_CSV,
        dtype={"acct_num": str, "contributor_name": str},
        low_memory=False,
    )
    hard["amount"]      = pd.to_numeric(hard["amount"], errors="coerce").fillna(0)
    hard["report_year"] = pd.to_numeric(hard["report_year"], errors="coerce")
    hard = hard[hard["amount"] > 0]
    hard["canonical_name"] = hard["contributor_name"].str.strip().str.upper()
    print(f"  {len(hard):,} rows")

    # ── Identify qualifying donor names ───────────────────────────────────────
    print(f"Identifying donors with total_combined >= ${args.min_total:,.0f}…")
    soft_totals = soft.groupby("canonical_name")["amount"].sum()
    hard_totals = hard.groupby("canonical_name")["amount"].sum()
    combined    = soft_totals.add(hard_totals, fill_value=0)
    qualifying  = combined[combined >= args.min_total].index
    print(f"  {len(qualifying):,} qualifying donors")

    committee_names = load_committee_names()
    print(f"  {len(committee_names):,} committee names loaded")

    # ── Build detail rows ─────────────────────────────────────────────────────
    print("Building detail rows…")
    soft_by_donor = soft[soft["canonical_name"].isin(qualifying)].groupby("canonical_name")
    hard_by_donor = hard[hard["canonical_name"].isin(qualifying)].groupby("canonical_name")
    hard_names    = set(hard_by_donor.groups.keys())

    dc_rows, dcan_rows, dy_rows = [], [], []

    for i, name in enumerate(qualifying):
        slug = slugify(name)
        if not slug:
            continue
        if i % 5_000 == 0 and i > 0:
            print(f"  {i:,}/{len(qualifying):,}…")

        # ── committees ───────────────────────────────────────────────────────
        if name in soft_by_donor.groups:
            sg = soft_by_donor.get_group(name)
            cg = (sg.groupby("acct_num")["amount"]
                    .agg(total="sum", num_contributions="count")
                    .reset_index()
                    .sort_values("total", ascending=False)
                    .head(TOP_COMM))
            for _, row in cg.iterrows():
                acct = str(row["acct_num"])
                dc_rows.append((slug, acct,
                                committee_names.get(acct, ""),
                                round(float(row["total"]), 2),
                                int(row["num_contributions"])))

        # ── candidates ───────────────────────────────────────────────────────
        if name in hard_names:
            hg = hard_by_donor.get_group(name)
            cg = (hg.groupby("acct_num")["amount"]
                    .agg(total="sum", num_contributions="count")
                    .reset_index()
                    .sort_values("total", ascending=False)
                    .head(TOP_CAND))
            hg_by_acct = hg.groupby("acct_num")
            for _, row in cg.iterrows():
                acct    = str(row["acct_num"])
                cname   = ""
                try:
                    grp   = hg_by_acct.get_group(row["acct_num"])
                    cname = str(grp["candidate_name"].dropna().mode().iloc[0]) if "candidate_name" in grp.columns else ""
                except Exception:
                    pass
                dcan_rows.append((slug, acct, cname,
                                  round(float(row["total"]), 2),
                                  int(row["num_contributions"])))

        # ── by_year ──────────────────────────────────────────────────────────
        year_soft = pd.Series(dtype=float)
        if name in soft_by_donor.groups:
            year_soft = (soft_by_donor.get_group(name)
                         .groupby("report_year")["amount"].sum())

        year_hard = pd.Series(dtype=float)
        if name in hard_names:
            year_hard = (hard_by_donor.get_group(name)
                         .groupby("report_year")["amount"].sum())

        all_years = set(year_soft.index) | set(year_hard.index)
        for yr in sorted(all_years):
            if pd.isna(yr):
                continue
            s = float(year_soft.get(yr, 0))
            h = float(year_hard.get(yr, 0))
            dy_rows.append((slug, int(yr), round(s, 2), round(h, 2), round(s + h, 2)))

    print(f"  Built {len(dc_rows):,} committee rows, "
          f"{len(dcan_rows):,} candidate rows, {len(dy_rows):,} by-year rows")

    if args.dry_run:
        print("DRY RUN complete — no writes")
        return 0

    # ── Upsert into Supabase ──────────────────────────────────────────────────
    print("Connecting to Supabase…")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        print("Upserting donor_committees…")
        # Delete existing for these slugs then re-insert (simpler than ON CONFLICT on 2 cols)
        slugs_list = list({r[0] for r in dc_rows})
        if slugs_list:
            cur.execute(
                "DELETE FROM donor_committees WHERE donor_slug = ANY(%s)",
                (slugs_list,)
            )
            n = flush(cur, """
                INSERT INTO donor_committees
                  (donor_slug, acct_num, committee_name, total, num_contributions)
                VALUES %s
            """, dc_rows)
            print(f"  → {n:,} rows")

        print("Upserting donor_candidates…")
        slugs_list = list({r[0] for r in dcan_rows})
        if slugs_list:
            cur.execute(
                "DELETE FROM donor_candidates WHERE donor_slug = ANY(%s)",
                (slugs_list,)
            )
            n = flush(cur, """
                INSERT INTO donor_candidates
                  (donor_slug, acct_num, candidate_name, total, num_contributions)
                VALUES %s
            """, dcan_rows)
            print(f"  → {n:,} rows")

        print("Upserting donor_by_year…")
        slugs_list = list({r[0] for r in dy_rows})
        if slugs_list:
            cur.execute(
                "DELETE FROM donor_by_year WHERE donor_slug = ANY(%s)",
                (slugs_list,)
            )
            n = flush(cur, """
                INSERT INTO donor_by_year
                  (donor_slug, year, soft, hard, total)
                VALUES %s
            """, dy_rows)
            print(f"  → {n:,} rows")

        conn.commit()
        print("Committed.")
    except Exception as e:
        conn.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        cur.close()
        conn.close()

    print("\n=== Done ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
