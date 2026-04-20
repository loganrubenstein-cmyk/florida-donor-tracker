"""
Script 27: Export industry-level donation summaries from hard-money contributions.

Reads candidate_contributions.csv (3.18M rows), classifies each contributor's
occupation into one of 15 industry buckets, and exports:

  public/data/industry_summary.json
      Global breakdown: total donations + count per industry, top candidates per
      industry, and a per-candidate lookup table for the frontend.

  public/data/industries/{acct_num}.json  (one per candidate with hard money)
      Per-candidate industry breakdown for use in CandidateProfile.

Usage:
    python scripts/27_export_industry_summary.py
    python scripts/27_export_industry_summary.py --force
"""

import json
import os
import re
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import psycopg2

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR, PROJECT_ROOT
from industry_classifier import classify_occupation, bucket_names


def normalize_name(name) -> str:
    if not isinstance(name, str):
        return ""
    return re.sub(r"\s+", " ", name.strip().upper())


def load_db_industry_map():
    dsn = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not dsn:
        print("  [warn] SUPABASE_DB_URL not set — skipping NAICS map, occupation fallback only")
        return {}
    t0 = time.time()
    print("Loading donor industry map from Supabase…")
    conn = psycopg2.connect(dsn, keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=5)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT name, industry FROM donors WHERE industry IS NOT NULL AND industry <> ''")
            rows = cur.fetchall()
    finally:
        conn.close()
    m = {}
    for name, ind in rows:
        k = normalize_name(name)
        if k:
            m[k] = ind
    print(f"  {len(m):,} donors with DB industry  ({time.time() - t0:.1f}s)")
    return m

PUBLIC_DIR      = PROJECT_ROOT / "public" / "data"
SUMMARY_FILE    = PUBLIC_DIR / "industry_summary.json"
INDUSTRIES_DIR  = PUBLIC_DIR / "industries"
CONTRIB_CSV     = PROCESSED_DIR / "candidate_contributions.csv"
CANDIDATES_CSV  = PROCESSED_DIR / "candidates.csv"

USECOLS = [
    "contributor_name", "contributor_occupation",
    "amount", "acct_num", "is_corporate",
]


def write_json(data, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, default=str), encoding="utf-8")


def main(force: bool = False) -> int:
    if not force and SUMMARY_FILE.exists():
        print("industry_summary.json exists — skipping (use --force to rebuild)")
        return 0

    print("=== Script 27: Export Industry Summary ===")

    print("Loading candidates…")
    cands = pd.read_csv(CANDIDATES_CSV, dtype=str).fillna("")
    cands["candidate_name"] = (cands["first_name"] + " " + cands["last_name"]).str.strip()
    acct_to_name = dict(zip(cands["acct_num"], cands["candidate_name"]))
    print(f"  {len(cands):,} candidates loaded")

    print("Loading candidate contributions…")
    df = pd.read_csv(
        CONTRIB_CSV,
        dtype=str,
        usecols=[c for c in USECOLS if c != "acct_num"] + ["acct_num"],
    )
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
    df = df[df["amount"] > 0]
    print(f"  {len(df):,} contributions loaded")

    db_map = load_db_industry_map()

    print("Classifying contributions (NAICS preferred, occupation fallback)…")
    df["_norm"] = df["contributor_name"].apply(normalize_name)
    db_hits = 0
    occ_hits = 0
    def classify_row(norm, occ):
        nonlocal db_hits, occ_hits
        ind = db_map.get(norm) if norm else None
        if ind:
            db_hits += 1
            return ind
        occ_hits += 1
        return classify_occupation(occ or "")
    df["industry"] = [classify_row(n, o) for n, o in zip(df["_norm"], df["contributor_occupation"])]
    df.drop(columns=["_norm"], inplace=True)
    print(f"  db={db_hits:,}  occupation_fallback={occ_hits:,}")

    # ── Global summary ────────────────────────────────────────────────────────
    print("Building global summary…")
    global_agg = (
        df.groupby("industry")["amount"]
        .agg(total="sum", count="count")
        .reset_index()
        .sort_values("total", ascending=False)
    )
    total_all = df["amount"].sum()
    global_rows = []
    for _, row in global_agg.iterrows():
        global_rows.append({
            "industry": row["industry"],
            "total":    round(float(row["total"]), 2),
            "count":    int(row["count"]),
            "pct":      round(100 * float(row["total"]) / total_all, 1) if total_all else 0,
        })

    # ── Per-candidate breakdown ───────────────────────────────────────────────
    print("Building per-candidate industry breakdowns…")
    cand_industry = (
        df.groupby(["acct_num", "industry"])["amount"]
        .sum()
        .reset_index()
        .rename(columns={"amount": "total"})
    )
    cand_industry["total"] = cand_industry["total"].round(2)

    # Build per-candidate lookup: {acct_num: [{industry, total}]}
    cand_lookup = defaultdict(list)
    for _, row in cand_industry.iterrows():
        cand_lookup[row["acct_num"]].append({
            "industry": row["industry"],
            "total":    float(row["total"]),
        })
    # Sort each candidate's list by total desc
    for acct in cand_lookup:
        cand_lookup[acct].sort(key=lambda x: -x["total"])

    # ── Top candidates per industry ───────────────────────────────────────────
    print("Finding top candidates per industry…")
    industry_top_cands = defaultdict(list)
    for acct, rows in cand_lookup.items():
        for r in rows:
            industry_top_cands[r["industry"]].append({
                "acct_num": acct,
                "name":     acct_to_name.get(acct, acct),
                "total":    r["total"],
            })
    for ind in industry_top_cands:
        industry_top_cands[ind].sort(key=lambda x: -x["total"])
        industry_top_cands[ind] = industry_top_cands[ind][:10]

    # ── Top donors per industry ───────────────────────────────────────────────
    print("Finding top donors per industry…")
    industry_top_donors = defaultdict(list)
    donor_industry = (
        df.groupby(["contributor_name", "industry"])["amount"]
        .sum()
        .reset_index()
        .rename(columns={"amount": "total"})
    )
    for _, row in donor_industry.iterrows():
        industry_top_donors[row["industry"]].append({
            "name":  row["contributor_name"],
            "total": round(float(row["total"]), 2),
        })
    for ind in industry_top_donors:
        industry_top_donors[ind].sort(key=lambda x: -x["total"])
        industry_top_donors[ind] = industry_top_donors[ind][:10]

    # Merge both into global rows
    ind_top_map  = dict(industry_top_cands)
    ind_don_map  = dict(industry_top_donors)
    for row in global_rows:
        row["top_candidates"] = ind_top_map.get(row["industry"], [])
        row["top_donors"]     = ind_don_map.get(row["industry"], [])

    # ── Write global summary ──────────────────────────────────────────────────
    summary = {
        "generated_at":   datetime.now(timezone.utc).isoformat(),
        "total_amount":   round(total_all, 2),
        "total_count":    int(len(df)),
        "bucket_order":   bucket_names(),
        "industries":     global_rows,
    }
    write_json(summary, SUMMARY_FILE)
    print(f"  Wrote {SUMMARY_FILE.name}")

    # ── Write per-candidate files ─────────────────────────────────────────────
    print(f"Writing {len(cand_lookup):,} per-candidate industry files…")
    INDUSTRIES_DIR.mkdir(parents=True, exist_ok=True)
    for acct, rows in cand_lookup.items():
        write_json({"acct_num": acct, "by_industry": rows}, INDUSTRIES_DIR / f"{acct}.json")

    print("\n=== Done ===")
    print(f"Global totals by industry (top 10):")
    for row in global_rows[:10]:
        print(f"  {row['industry']:<30s}  ${row['total']:>14,.0f}  ({row['pct']:.1f}%)")

    return 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(main(force=force))
