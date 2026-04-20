"""
Script 28 — Export industry trends by election cycle.

Reads candidate_contributions.csv (3.18M rows), classifies each row by industry,
and aggregates by (election_year, industry) to produce:

  public/data/industry_trends.json
    {
      "generated_at": "...",
      "years": [2008, 2010, ..., 2026],
      "industries": ["Legal", "Real Estate", ...],   # 15 + Other, ordered
      "by_year": {
        "2018": {
          "total": 157000000,
          "by_industry": {"Legal": 22000000, "Real Estate": 11000000, ...}
        },
        ...
      }
    }

Runtime: ~3 minutes (same as script 27).
"""

import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import psycopg2

sys.path.insert(0, str(Path(__file__).parent))
from industry_classifier import classify_occupation, bucket_names

import pandas as pd

BASE = Path(__file__).parent.parent
CONTRIBUTIONS = BASE / "data" / "processed" / "candidate_contributions.csv"
OUT = BASE / "public" / "data" / "industry_trends.json"


def normalize_name(name) -> str:
    if not isinstance(name, str):
        return ""
    return re.sub(r"\s+", " ", name.strip().upper())


def load_db_industry_map():
    dsn = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL")
    if not dsn:
        print("  [warn] SUPABASE_DB_URL not set — occupation fallback only")
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


def main():
    print("Script 28 — Industry Trends by Cycle")
    print(f"Reading {CONTRIBUTIONS} ...")

    df = pd.read_csv(
        CONTRIBUTIONS,
        usecols=["election_year", "amount", "contributor_name", "contributor_occupation", "is_corporate"],
        dtype={"amount": float, "election_year": str, "contributor_name": str, "contributor_occupation": str, "is_corporate": str},
        low_memory=False,
    )

    print(f"  {len(df):,} rows loaded")

    # Drop rows with no year or no amount
    df = df.dropna(subset=["election_year", "amount"])
    df["election_year"] = df["election_year"].str.strip()

    db_map = load_db_industry_map()

    print("Classifying industries (NAICS preferred, occupation fallback)…")
    df["contributor_occupation"] = df["contributor_occupation"].fillna("").astype(str)
    df["contributor_name"] = df["contributor_name"].fillna("").astype(str)

    unique_occupations = df["contributor_occupation"].unique()
    occ_map = {occ: classify_occupation(occ) for occ in unique_occupations}

    df["_norm"] = df["contributor_name"].apply(normalize_name)
    db_hits = 0
    occ_hits = 0
    def classify(n, occ):
        nonlocal db_hits, occ_hits
        ind = db_map.get(n) if n else None
        if ind:
            db_hits += 1
            return ind
        occ_hits += 1
        return occ_map.get(occ, "Other")
    df["industry"] = [classify(n, o) for n, o in zip(df["_norm"], df["contributor_occupation"])]
    df.drop(columns=["_norm"], inplace=True)
    print(f"  db={db_hits:,}  occupation_fallback={occ_hits:,}")

    print("Aggregating by year and industry ...")

    years = sorted(df["election_year"].unique().tolist())
    industries = bucket_names()  # 15 + Other in display order

    by_year = {}
    for year in years:
        ydf = df[df["election_year"] == year]
        year_total = float(ydf["amount"].sum())
        by_industry = (
            ydf.groupby("industry")["amount"]
            .sum()
            .reindex(industries, fill_value=0.0)
            .round(2)
            .to_dict()
        )
        by_year[year] = {
            "total": round(year_total, 2),
            "by_industry": by_industry,
        }
        print(f"  {year}: ${year_total:,.0f} across {len(ydf):,} contributions")

    out = {
        "generated_at": datetime.now().isoformat(),
        "years": years,
        "industries": industries,
        "by_year": by_year,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))

    print(f"\nWrote {OUT}")
    size_kb = OUT.stat().st_size // 1024
    print(f"File size: {size_kb} KB")
    print("Done.")


if __name__ == "__main__":
    main()
