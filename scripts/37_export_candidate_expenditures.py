# scripts/37_export_candidate_expenditures.py
"""
Script 37: Export candidate expenditures to per-candidate JSON + updates top vendors.

Reads data/processed/candidate_expenditures.csv (produced by scripts 35 + 36) and writes:
  - public/data/expenditures/by_candidate/{acct_num}.json  (one per candidate)
  - public/data/expenditures/top_vendors_all.json          (top 500 combined committee + candidate)

The combined top_vendors_all.json merges data from both
  public/data/expenditures/top_vendors.json      (committees, from script 34)
  candidate_expenditures.csv                      (candidates, from script 36)
so the frontend can show "PAC Financial Management received money from both committees
and candidate campaigns."

Safe to re-run; overwrites output files.

Usage (from project root, with .venv activated):
    python scripts/37_export_candidate_expenditures.py
"""

import json
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR, PROJECT_ROOT

INPUT_CSV = PROCESSED_DIR / "candidate_expenditures.csv"
OUT_DIR   = PROJECT_ROOT / "public" / "data" / "expenditures"
BY_CAND_DIR   = OUT_DIR / "by_candidate"
TOP_VENDORS_COMMITTEE_FILE = OUT_DIR / "top_vendors.json"       # from script 34
TOP_VENDORS_ALL_FILE       = OUT_DIR / "top_vendors_all.json"   # combined

TOP_VENDORS_PER_CANDIDATE = 20
TOP_VENDORS_GLOBAL        = 500
TOP_ENTITIES_PER_VENDOR   = 10

_SUFFIX_RE = re.compile(
    r"[,\.]?\s*(INC|LLC|L\.L\.C\.|CO|CORP|CORPORATION|COMPANY|LTD|LP|LLP|PA|PLLC|PC)\.?$",
    re.IGNORECASE,
)
_PUNCT_RE = re.compile(r"[^\w\s&]")
_WS_RE    = re.compile(r"\s+")


def normalize_vendor(name: str) -> str:
    if not isinstance(name, str):
        return ""
    s = name.strip().upper()
    for _ in range(2):
        new = _SUFFIX_RE.sub("", s).strip()
        if new == s:
            break
        s = new
    s = _PUNCT_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    return s


def main() -> int:
    print("=== Script 37: Export Candidate Expenditures ===\n")

    if not INPUT_CSV.exists():
        print(f"ERROR: {INPUT_CSV} does not exist. Run scripts 35 + 36 first.")
        return 1

    print(f"Reading {INPUT_CSV} ...", flush=True)
    df = pd.read_csv(INPUT_CSV, dtype={"acct_num": "string"}, low_memory=False)
    print(f"  loaded {len(df):,} rows")

    df["expenditure_date"] = pd.to_datetime(df["expenditure_date"], errors="coerce")
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)

    # date sanity (script 36 already filtered, but be defensive on re-runs)
    years = df["expenditure_date"].dt.year
    df = df.loc[~(years.isna() | (years < 1990) | (years > 2099))].copy()

    df["vendor_original"] = df["vendor_name"].fillna("").astype(str)
    df["vendor_norm"]     = df["vendor_original"].apply(normalize_vendor)
    df = df.loc[df["vendor_norm"] != ""].copy()
    df["year"] = df["expenditure_date"].dt.year.astype(int)

    print(f"Post-filter: {len(df):,} rows, {df['acct_num'].nunique():,} candidates")

    # Canonical original vendor name (most-frequent spelling)
    canonical_original = (
        df.groupby("vendor_norm")["vendor_original"]
        .agg(lambda s: s.value_counts().idxmax())
        .to_dict()
    )

    # --- Per-candidate JSONs ---
    BY_CAND_DIR.mkdir(parents=True, exist_ok=True)
    print(f"\nWriting per-candidate JSON to {BY_CAND_DIR}/ ...", flush=True)

    num_files = 0
    for acct_num, cdf in df.groupby("acct_num", sort=False):
        total_spent    = float(cdf["amount"].sum())
        num_expend     = int(len(cdf))
        date_min       = cdf["expenditure_date"].min()
        date_max       = cdf["expenditure_date"].max()

        vendor_groups = (
            cdf.groupby("vendor_norm")
            .agg(total_amount=("amount", "sum"), num_payments=("amount", "size"))
            .reset_index()
            .sort_values("total_amount", ascending=False)
            .head(TOP_VENDORS_PER_CANDIDATE)
        )
        top_vendors = [
            {
                "vendor_name":            canonical_original.get(r.vendor_norm, r.vendor_norm),
                "vendor_name_normalized": r.vendor_norm,
                "total_amount":           round(float(r.total_amount), 2),
                "num_payments":           int(r.num_payments),
                "pct":                    round(float(r.total_amount) / total_spent * 100, 2)
                                          if total_spent else 0.0,
            }
            for r in vendor_groups.itertuples(index=False)
        ]

        by_year = [
            {"year": int(y), "amount": round(float(a), 2)}
            for y, a in cdf.groupby("year")["amount"].sum().sort_index().items()
        ]

        payload = {
            "acct_num":       acct_num,
            "total_spent":    round(total_spent, 2),
            "num_expenditures": num_expend,
            "date_range": {
                "start": date_min.date().isoformat() if pd.notna(date_min) else None,
                "end":   date_max.date().isoformat() if pd.notna(date_max) else None,
            },
            "top_vendors": top_vendors,
            "by_year":     by_year,
        }

        (BY_CAND_DIR / f"{acct_num}.json").write_text(
            json.dumps(payload, separators=(",", ":"))
        )
        num_files += 1

    print(f"  wrote {num_files:,} candidate files")

    # --- Combined top vendors (committee + candidate) ---
    print("\nBuilding combined top vendors (committee + candidate) ...", flush=True)

    # Aggregate candidate side
    cand_totals = (
        df.groupby("vendor_norm")
        .agg(
            cand_amount=("amount", "sum"),
            cand_payments=("amount", "size"),
            cand_num_candidates=("acct_num", "nunique"),
        )
        .to_dict(orient="index")
    )

    # Load committee side from script 34 output
    comm_vendors: dict[str, dict] = {}
    if TOP_VENDORS_COMMITTEE_FILE.exists():
        comm_list = json.loads(TOP_VENDORS_COMMITTEE_FILE.read_text())
        for v in comm_list:
            norm = v["vendor_name_normalized"]
            comm_vendors[norm] = v
        print(f"  loaded {len(comm_list):,} committee vendors from script 34")
    else:
        print("  WARNING: top_vendors.json from script 34 not found; combined file will be candidate-only")

    # Merge: build a combined dict keyed by normalized name
    all_norms = set(cand_totals) | set(comm_vendors)
    combined_rows = []
    for norm in all_norms:
        cv = comm_vendors.get(norm, {})
        ct = cand_totals.get(norm, {})

        total_comm   = float(cv.get("total_amount", 0))
        total_cand   = float(ct.get("cand_amount", 0))
        total_all    = total_comm + total_cand

        combined_rows.append({
            "vendor_name":            cv.get("vendor_name") or canonical_original.get(norm, norm),
            "vendor_name_normalized": norm,
            "total_amount":           round(total_all, 2),
            "committee_amount":       round(total_comm, 2),
            "candidate_amount":       round(total_cand, 2),
            "num_payments":           int(cv.get("num_payments", 0)) + int(ct.get("cand_payments", 0)),
            "num_committees":         int(cv.get("num_committees", 0)),
            "num_candidates":         int(ct.get("cand_num_candidates", 0)),
        })

    combined_rows.sort(key=lambda r: r["total_amount"], reverse=True)
    combined_rows = combined_rows[:TOP_VENDORS_GLOBAL]

    TOP_VENDORS_ALL_FILE.write_text(json.dumps(combined_rows, separators=(",", ":")))
    print(f"  wrote {len(combined_rows):,} combined vendors to {TOP_VENDORS_ALL_FILE}")

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
