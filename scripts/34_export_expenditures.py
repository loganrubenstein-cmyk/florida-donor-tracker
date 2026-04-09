# scripts/34_export_expenditures.py
"""
Script 34: Export committee expenditures to per-committee JSON + global top vendors.

Reads data/processed/expenditures.csv (produced by script 07) and writes:
  - public/data/expenditures/by_committee/{acct_num}.json  (one per committee)
  - public/data/expenditures/top_vendors.json              (top 500 vendors overall)
  - public/data/expenditures/summary.json                  (sanity/coverage stats)

Applies the same 1990-2099 date sanity filter used in script 08 to drop
corrupt rows (script 07 silently coerces bad dates to NaT; we additionally
drop out-of-range years like 2999).

Safe to re-run; overwrites output files.

Usage (from project root, with .venv activated):
    python scripts/34_export_expenditures.py
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR, PROJECT_ROOT

INPUT_CSV = PROCESSED_DIR / "expenditures.csv"
OUT_DIR = PROJECT_ROOT / "public" / "data" / "expenditures"
BY_COMMITTEE_DIR = OUT_DIR / "by_committee"
TOP_VENDORS_FILE = OUT_DIR / "top_vendors.json"
SUMMARY_FILE = OUT_DIR / "summary.json"

MIN_YEAR = 1990
MAX_YEAR = 2099
TOP_VENDORS_PER_COMMITTEE = 20
TOP_VENDORS_GLOBAL = 500
TOP_COMMITTEES_PER_VENDOR = 10

_ACCT_RE = re.compile(r"Expend_(\d+)\.txt", re.IGNORECASE)

# Light vendor-name normalizer: uppercase, strip common corporate suffixes,
# collapse whitespace, drop punctuation. Keeps "ANEDOT" and "ANEDOT, INC."
# as the same bucket without doing fuzzy matching.
_SUFFIX_RE = re.compile(
    r"[,\.]?\s*(INC|LLC|L\.L\.C\.|CO|CORP|CORPORATION|COMPANY|LTD|LP|LLP|PA|PLLC|PC)\.?$",
    re.IGNORECASE,
)
_PUNCT_RE = re.compile(r"[^\w\s&]")
_WS_RE = re.compile(r"\s+")


def normalize_vendor(name: str) -> str:
    if not isinstance(name, str):
        return ""
    s = name.strip().upper()
    # Strip one or two trailing corporate suffixes
    for _ in range(2):
        new = _SUFFIX_RE.sub("", s).strip()
        if new == s:
            break
        s = new
    s = _PUNCT_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    return s


def acct_from_source(source_file: str) -> str | None:
    if not isinstance(source_file, str):
        return None
    m = _ACCT_RE.search(source_file)
    return m.group(1) if m else None


def main() -> int:
    print("=== Script 34: Export Committee Expenditures ===\n")

    if not INPUT_CSV.exists():
        print(f"ERROR: {INPUT_CSV} does not exist. Run script 07 first.")
        return 1

    print(f"Reading {INPUT_CSV} ...", flush=True)
    df = pd.read_csv(INPUT_CSV, dtype={"source_file": "string"}, low_memory=False)
    original_len = len(df)
    print(f"  loaded {original_len:,} rows")

    # --- Parse dates + amounts (script 07 should have done this, but be defensive) ---
    df["expenditure_date"] = pd.to_datetime(df["expenditure_date"], errors="coerce")
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)

    # --- Date sanity filter (mirrors scripts/08_export_json.py:213-225) ---
    years = df["expenditure_date"].dt.year
    bad_date_mask = years.isna() | (years < MIN_YEAR) | (years > MAX_YEAR)
    dropped_bad_date = int(bad_date_mask.sum())
    df = df.loc[~bad_date_mask].copy()
    print(f"  dropped {dropped_bad_date:,} rows with dates outside [{MIN_YEAR}, {MAX_YEAR}]")

    # --- Extract committee acct_num from source_file ---
    df["acct_num"] = df["source_file"].apply(acct_from_source)
    missing_acct = df["acct_num"].isna().sum()
    if missing_acct:
        print(f"  warning: {missing_acct:,} rows had unparseable source_file; dropping")
        df = df.dropna(subset=["acct_num"]).copy()

    # --- Normalize vendor names ---
    df["vendor_original"] = df["vendor_name"].fillna("").astype(str)
    df["vendor_norm"] = df["vendor_original"].apply(normalize_vendor)
    # Drop rows with empty vendor name (can't attribute)
    empty_vendor_mask = df["vendor_norm"] == ""
    dropped_empty_vendor = int(empty_vendor_mask.sum())
    df = df.loc[~empty_vendor_mask].copy()
    if dropped_empty_vendor:
        print(f"  dropped {dropped_empty_vendor:,} rows with empty vendor name")

    df["year"] = df["expenditure_date"].dt.year.astype(int)

    print(f"\nPost-filter: {len(df):,} rows across {df['acct_num'].nunique():,} committees")

    # --- Per-committee rollups ---
    BY_COMMITTEE_DIR.mkdir(parents=True, exist_ok=True)
    print(f"\nWriting per-committee JSON to {BY_COMMITTEE_DIR}/ ...", flush=True)

    # Pre-compute a canonical original spelling per normalized vendor
    # (most frequent original form wins)
    canonical_original = (
        df.groupby("vendor_norm")["vendor_original"]
        .agg(lambda s: s.value_counts().idxmax())
        .to_dict()
    )

    num_committee_files = 0
    for acct_num, cdf in df.groupby("acct_num", sort=False):
        total_spent = float(cdf["amount"].sum())
        num_expenditures = int(len(cdf))
        date_min = cdf["expenditure_date"].min()
        date_max = cdf["expenditure_date"].max()

        vendor_groups = (
            cdf.groupby("vendor_norm")
            .agg(total_amount=("amount", "sum"), num_payments=("amount", "size"))
            .reset_index()
            .sort_values("total_amount", ascending=False)
            .head(TOP_VENDORS_PER_COMMITTEE)
        )
        top_vendors = [
            {
                "vendor_name": canonical_original.get(row.vendor_norm, row.vendor_norm),
                "vendor_name_normalized": row.vendor_norm,
                "total_amount": round(float(row.total_amount), 2),
                "num_payments": int(row.num_payments),
                "pct": round(float(row.total_amount) / total_spent * 100, 2)
                if total_spent
                else 0.0,
            }
            for row in vendor_groups.itertuples(index=False)
        ]

        by_year = [
            {"year": int(y), "amount": round(float(a), 2)}
            for y, a in cdf.groupby("year")["amount"].sum().sort_index().items()
        ]

        payload = {
            "acct_num": acct_num,
            "total_spent": round(total_spent, 2),
            "num_expenditures": num_expenditures,
            "date_range": {
                "start": date_min.date().isoformat() if pd.notna(date_min) else None,
                "end": date_max.date().isoformat() if pd.notna(date_max) else None,
            },
            "top_vendors": top_vendors,
            "by_year": by_year,
        }

        out_path = BY_COMMITTEE_DIR / f"{acct_num}.json"
        out_path.write_text(json.dumps(payload, separators=(",", ":")))
        num_committee_files += 1

    print(f"  wrote {num_committee_files:,} committee files")

    # --- Global top vendors ---
    print("\nBuilding global top vendors ...", flush=True)
    vendor_totals = (
        df.groupby("vendor_norm")
        .agg(
            total_amount=("amount", "sum"),
            num_payments=("amount", "size"),
            num_committees=("acct_num", "nunique"),
        )
        .reset_index()
        .sort_values("total_amount", ascending=False)
        .head(TOP_VENDORS_GLOBAL)
    )

    # For each top vendor, compute its top recipient committees
    top_vendor_set = set(vendor_totals["vendor_norm"])
    per_vendor_committees: dict[str, list[tuple[str, float]]] = defaultdict(list)
    vendor_committee_agg = (
        df[df["vendor_norm"].isin(top_vendor_set)]
        .groupby(["vendor_norm", "acct_num"])["amount"]
        .sum()
        .reset_index()
    )
    for row in vendor_committee_agg.itertuples(index=False):
        per_vendor_committees[row.vendor_norm].append((row.acct_num, float(row.amount)))
    for k in per_vendor_committees:
        per_vendor_committees[k].sort(key=lambda t: t[1], reverse=True)
        per_vendor_committees[k] = per_vendor_committees[k][:TOP_COMMITTEES_PER_VENDOR]

    top_vendors_global = [
        {
            "vendor_name": canonical_original.get(row.vendor_norm, row.vendor_norm),
            "vendor_name_normalized": row.vendor_norm,
            "total_amount": round(float(row.total_amount), 2),
            "num_payments": int(row.num_payments),
            "num_committees": int(row.num_committees),
            "top_recipient_committees": [
                {"acct_num": a, "amount": round(amt, 2)}
                for a, amt in per_vendor_committees.get(row.vendor_norm, [])
            ],
        }
        for row in vendor_totals.itertuples(index=False)
    ]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    TOP_VENDORS_FILE.write_text(json.dumps(top_vendors_global, separators=(",", ":")))
    print(f"  wrote {len(top_vendors_global):,} top vendors to {TOP_VENDORS_FILE}")

    # --- Summary ---
    summary = {
        "total_amount": round(float(df["amount"].sum()), 2),
        "total_payments": int(len(df)),
        "num_committees": int(df["acct_num"].nunique()),
        "num_vendors_normalized": int(df["vendor_norm"].nunique()),
        "date_range": {
            "start": df["expenditure_date"].min().date().isoformat(),
            "end": df["expenditure_date"].max().date().isoformat(),
        },
        "source_rows": int(original_len),
        "dropped_rows_out_of_range_date": dropped_bad_date,
        "dropped_rows_empty_vendor": dropped_empty_vendor,
        "generated_by": "scripts/34_export_expenditures.py",
    }
    SUMMARY_FILE.write_text(json.dumps(summary, indent=2))
    print(f"\nWrote summary to {SUMMARY_FILE}")
    print(json.dumps(summary, indent=2))

    return 0


if __name__ == "__main__":
    sys.exit(main())
