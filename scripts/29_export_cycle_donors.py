"""
Script 29 — Export top donors per election cycle (hard money only).

Reads candidate_contributions.csv and aggregates by (election_year, contributor_name)
to find the top 20 hard-money donors per cycle.

Output: public/data/cycle_donors.json
  {
    "2018": [
      {"name": "FLORIDA POWER & LIGHT COMPANY", "total": 4200000, "is_corporate": true, "num_contributions": 312},
      ...
    ],
    ...
  }

Runtime: ~30 seconds.
"""

import json
from pathlib import Path

import pandas as pd

BASE = Path(__file__).parent.parent
CONTRIBUTIONS = BASE / "data" / "processed" / "candidate_contributions.csv"
OUT = BASE / "public" / "data" / "cycle_donors.json"

TOP_N = 20


def main():
    print("Script 29 — Cycle Top Donors")
    print(f"Reading {CONTRIBUTIONS} ...")

    df = pd.read_csv(
        CONTRIBUTIONS,
        usecols=["election_year", "contributor_name", "amount", "is_corporate"],
        dtype={"amount": float, "election_year": str, "contributor_name": str, "is_corporate": str},
        low_memory=False,
    )

    print(f"  {len(df):,} rows loaded")
    df = df.dropna(subset=["election_year", "amount", "contributor_name"])
    df["election_year"] = df["election_year"].str.strip()

    # Normalize is_corporate to bool
    df["is_corporate"] = df["is_corporate"].str.upper().isin({"TRUE", "1", "YES", "Y"})

    years = sorted(df["election_year"].unique().tolist())
    result = {}

    for year in years:
        ydf = df[df["election_year"] == year]
        grouped = (
            ydf.groupby("contributor_name")
            .agg(
                total=("amount", "sum"),
                num_contributions=("amount", "count"),
                is_corporate=("is_corporate", "any"),
            )
            .reset_index()
            .sort_values("total", ascending=False)
            .head(TOP_N)
        )
        result[year] = [
            {
                "name": row["contributor_name"],
                "total": round(row["total"], 2),
                "num_contributions": int(row["num_contributions"]),
                "is_corporate": bool(row["is_corporate"]),
            }
            for _, row in grouped.iterrows()
        ]
        top = result[year][0] if result[year] else {}
        print(f"  {year}: #{1} {top.get('name', '?')} ${top.get('total', 0):,.0f}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(result, f, separators=(",", ":"))

    print(f"\nWrote {OUT}")
    print(f"File size: {OUT.stat().st_size // 1024} KB")
    print("Done.")


if __name__ == "__main__":
    main()
