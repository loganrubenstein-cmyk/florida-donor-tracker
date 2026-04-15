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
import sys
from datetime import datetime
from pathlib import Path

# Add scripts/ to path for industry_classifier import
sys.path.insert(0, str(Path(__file__).parent))
from industry_classifier import classify_occupation, bucket_names

import pandas as pd

BASE = Path(__file__).parent.parent
CONTRIBUTIONS = BASE / "data" / "processed" / "candidate_contributions.csv"
OUT = BASE / "public" / "data" / "industry_trends.json"


def main():
    print("Script 28 — Industry Trends by Cycle")
    print(f"Reading {CONTRIBUTIONS} ...")

    df = pd.read_csv(
        CONTRIBUTIONS,
        usecols=["election_year", "amount", "contributor_occupation", "is_corporate"],
        dtype={"amount": float, "election_year": str, "contributor_occupation": str, "is_corporate": str},
        low_memory=False,
    )

    print(f"  {len(df):,} rows loaded")

    # Drop rows with no year or no amount
    df = df.dropna(subset=["election_year", "amount"])
    df["election_year"] = df["election_year"].str.strip()

    # Classify industries (vectorized via map for speed)
    print("Classifying industries ...")
    df["contributor_occupation"] = df["contributor_occupation"].fillna("").astype(str)

    # Build occupation→industry cache to avoid re-classifying identical strings
    unique_occupations = df["contributor_occupation"].unique()
    print(f"  {len(unique_occupations):,} unique occupations")
    occ_map = {occ: classify_occupation(occ) for occ in unique_occupations}
    df["industry"] = df["contributor_occupation"].map(occ_map)

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
