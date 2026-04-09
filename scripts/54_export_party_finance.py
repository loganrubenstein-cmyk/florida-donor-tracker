# scripts/54_export_party_finance.py
"""
Script 54: Export party-level campaign finance summary.

Aggregates candidate fundraising + donor giving by political party,
producing a party comparison view useful for homepage charts and
party finance breakdown pages.

Outputs:
  public/data/party_finance/summary.json        overall party comparison
  public/data/party_finance/by_party/{party}.json  per-party detail

Usage (from project root, with .venv activated):
    python scripts/54_export_party_finance.py
"""

import json
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR, PROJECT_ROOT

DATA_DIR = PROJECT_ROOT / "public" / "data"
OUT_DIR  = DATA_DIR / "party_finance"

PARTY_LABELS = {
    "REP": "Republican",
    "DEM": "Democrat",
    "NOP": "No Party Affiliation / Non-Partisan",
    "NPA": "No Party Affiliation",
    "LPF": "Libertarian",
    "GRE": "Green",
    "IND": "Independent",
    "WRI": "Write-In",
    "LIB": "Libertarian",
    "TEA": "Tea Party",
    "CPF": "Constitution Party",
    "REF": "Reform",
}

MIN_YEAR = 1990
MAX_YEAR = 2099


def main() -> int:
    print("=== Script 54: Export Party Finance Summary ===\n")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    by_party_dir = OUT_DIR / "by_party"
    by_party_dir.mkdir(parents=True, exist_ok=True)

    # ── Load candidate stats ──────────────────────────────────────────────────
    cand_stats_path = DATA_DIR / "candidate_stats.json"
    if not cand_stats_path.exists():
        print(f"ERROR: {cand_stats_path} not found.")
        return 1
    cand_stats = json.loads(cand_stats_path.read_text())
    print(f"Loaded {len(cand_stats):,} candidates")

    # Build party → candidate rollup
    party_data: dict[str, dict] = {}

    for c in cand_stats:
        party = c.get("party_code", "UNK") or "UNK"
        total = c.get("total_combined", 0) or 0
        hard  = c.get("hard_money_total", 0) or 0
        soft  = c.get("soft_money_total", 0) or 0
        year  = int(c.get("election_year", 0) or 0)

        if party not in party_data:
            party_data[party] = {
                "party_code":    party,
                "party_label":   PARTY_LABELS.get(party, party),
                "num_candidates": 0,
                "total_raised":  0.0,
                "hard_money":    0.0,
                "soft_money":    0.0,
                "by_year":       {},
                "by_office":     {},
                "top_candidates": [],
            }

        pd_entry = party_data[party]
        pd_entry["num_candidates"] += 1
        pd_entry["total_raised"]   += total
        pd_entry["hard_money"]     += hard
        pd_entry["soft_money"]     += soft

        # By year
        if year and MIN_YEAR <= year <= MAX_YEAR:
            by_yr = pd_entry["by_year"]
            by_yr[year] = by_yr.get(year, 0.0) + total

        # By office
        office = c.get("office_code", "UNK") or "UNK"
        pd_entry["by_office"][office] = pd_entry["by_office"].get(office, 0.0) + total

        # Collect for top candidates
        pd_entry["top_candidates"].append({
            "acct_num":       str(c.get("acct_num", "")),
            "candidate_name": c.get("candidate_name", ""),
            "office_desc":    c.get("office_desc", ""),
            "election_year":  year,
            "total_raised":   round(total, 2),
        })

    print(f"Found {len(party_data)} parties")

    # ── Load contributions data to see donor-party flows ─────────────────────
    contrib_path = PROCESSED_DIR / "contributions.csv"
    donor_party_totals: dict[str, dict] = {}   # party_code → {corporate: $, individual: $}

    if contrib_path.exists():
        print(f"Loading contributions from {contrib_path.name} ...")
        # Sample: read to get donor type distribution by candidate/committee
        df = pd.read_csv(contrib_path, low_memory=False,
                         usecols=["amount", "type_code"],
                         dtype=str)
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)

        # Map candidate names to party — build lookup from cand_stats
        # This is approximate since contributions are at committee level
        print("  (Note: donor-to-party flows require candidate-level contribution data)")

    # ── Build party summary ───────────────────────────────────────────────────
    print("\nBuilding party summary ...")
    all_parties = []
    for party, data in party_data.items():
        # Finalize top_candidates (top 20 by total raised)
        data["top_candidates"] = sorted(
            data["top_candidates"],
            key=lambda x: x["total_raised"], reverse=True
        )[:20]

        # Convert by_year to sorted list
        data["by_year"] = [
            {"year": yr, "total_raised": round(total, 2)}
            for yr, total in sorted(data["by_year"].items())
        ]

        # Convert by_office to sorted list
        data["by_office"] = sorted(
            [{"office_code": oc, "total_raised": round(total, 2)}
             for oc, total in data["by_office"].items()],
            key=lambda x: x["total_raised"], reverse=True
        )[:10]

        # Round totals
        data["total_raised"] = round(data["total_raised"], 2)
        data["hard_money"]   = round(data["hard_money"], 2)
        data["soft_money"]   = round(data["soft_money"], 2)

        all_parties.append(data)

    all_parties.sort(key=lambda x: x["total_raised"], reverse=True)

    # Write per-party files
    for party_entry in all_parties:
        party_code = party_entry["party_code"]
        safe_name  = re.sub(r"[^\w]", "_", party_code).lower()
        path       = by_party_dir / f"{safe_name}.json"
        path.write_text(json.dumps(party_entry, separators=(",", ":"), ensure_ascii=False))

    print(f"Wrote {len(all_parties)} party files")

    # Write summary
    summary = {
        "num_parties":     len(all_parties),
        "total_raised_all": round(sum(p["total_raised"] for p in all_parties), 2),
        "parties": [
            {
                "party_code":    p["party_code"],
                "party_label":   p["party_label"],
                "num_candidates": p["num_candidates"],
                "total_raised":  p["total_raised"],
                "hard_money":    p["hard_money"],
                "soft_money":    p["soft_money"],
            }
            for p in all_parties
        ],
        "generated_by": "scripts/54_export_party_finance.py",
    }
    (OUT_DIR / "summary.json").write_text(json.dumps(summary, indent=2))
    print(f"Wrote summary.json")

    print("\nTop 5 parties by candidate fundraising:")
    for p in all_parties[:5]:
        print(f"  {p['party_code']:6} {p['party_label']:40} ${p['total_raised']:>14,.0f}  ({p['num_candidates']:4d} candidates)")

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
