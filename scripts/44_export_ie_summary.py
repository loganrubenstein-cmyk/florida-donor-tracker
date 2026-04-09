# scripts/44_export_ie_summary.py
"""
Script 44: Export Independent Expenditure (IE) and Electioneering Communication (EC) data.

IE/EC data already exists in data/processed/expenditures.csv. These rows are identified
by FL DOE type codes:
  IEC = Independent Expenditure - Communication  (express advocacy; for/against a candidate)
  IEI = Independent Expenditure - In-kind
  ECC = Electioneering Communication - Communication  (mentions candidate; 60 days before election)
  ECI = Electioneering Communication - In-kind

The purpose field encodes the target candidate/race. This script extracts and exports:
  - public/data/ie/summary.json                  overall totals + type breakdown
  - public/data/ie/by_committee/{acct_num}.json  per-committee IE/EC activity
  - public/data/ie/top_spenders.json             top 200 committees by IE amount
  - public/data/ie/by_candidate_targeted.json    candidates targeted (parsed from purpose)

Usage (from project root, with .venv activated):
    python scripts/44_export_ie_summary.py
"""

import json
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR, PROJECT_ROOT

INPUT_CSV    = PROCESSED_DIR / "expenditures.csv"
OUT_DIR      = PROJECT_ROOT / "public" / "data" / "ie"
BY_COMM_DIR  = OUT_DIR / "by_committee"

IE_TYPES = {"IEC", "IEI", "ECC", "ECI"}
TYPE_LABELS = {
    "IEC": "Independent Expenditure – Communication",
    "IEI": "Independent Expenditure – In-Kind",
    "ECC": "Electioneering Communication – Communication",
    "ECI": "Electioneering Communication – In-Kind",
}

_ACCT_RE = re.compile(r"Expend_(\d+)\.txt", re.IGNORECASE)

# Patterns to extract a candidate name from the purpose field.
# The purpose for IEC/ECC often contains candidate names in free text like:
#   "FOR FRANK CAROLLO SIGNS"
#   "MANOLO REYES MIAMI DI 4"
#   "VILLALOBOS SIGNS, STATE SEN #38"
# We extract the first run of ALL-CAPS words as a candidate name candidate.
_CAND_NAME_RE = re.compile(r"\bFOR\s+([A-Z][A-Z\s\-\'\.]{3,40}?)(?:\s+SIGN|\s+MAILER|\s+AD|\s+RADIO|\s+CANV|\s+CAMP|,|$)")


def extract_candidate_hint(purpose: str) -> str | None:
    """Best-effort extraction of targeted candidate name from purpose string."""
    if not isinstance(purpose, str) or not purpose.strip():
        return None
    m = _CAND_NAME_RE.search(purpose.upper())
    if m:
        name = m.group(1).strip().rstrip(".,;")
        if 4 < len(name) < 50:
            return name
    return None


def main() -> int:
    print("=== Script 44: Export IE / Electioneering Summary ===\n")

    if not INPUT_CSV.exists():
        print(f"ERROR: {INPUT_CSV} not found. Run scripts 04 + 07 first.")
        return 1

    print(f"Reading {INPUT_CSV} ...", flush=True)
    df = pd.read_csv(INPUT_CSV, low_memory=False)
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
    df["expenditure_date"] = pd.to_datetime(df["expenditure_date"], errors="coerce")

    # Filter to IE/EC rows only
    ie = df[df["type_code"].isin(IE_TYPES)].copy()
    print(f"Found {len(ie):,} IE/EC rows (out of {len(df):,} total expenditure rows)")
    print(f"Total IE/EC amount: ${ie['amount'].sum():,.2f}")

    ie["acct_num"] = ie["source_file"].apply(
        lambda s: (m := _ACCT_RE.search(str(s))) and m.group(1)
    )
    ie["year"] = ie["expenditure_date"].dt.year
    ie["candidate_hint"] = ie["purpose"].apply(extract_candidate_hint)

    # Load committee names for enrichment
    comm_index_path = PROJECT_ROOT / "public" / "data" / "committees" / "index.json"
    comm_names: dict[str, str] = {}
    if comm_index_path.exists():
        for c in json.loads(comm_index_path.read_text()):
            comm_names[str(c["acct_num"])] = c["committee_name"]

    # --- Summary ---
    type_breakdown = (
        ie.groupby("type_code")
        .agg(total_amount=("amount", "sum"), num_rows=("amount", "size"))
        .reset_index()
    )
    summary = {
        "total_amount":    round(float(ie["amount"].sum()), 2),
        "total_rows":      int(len(ie)),
        "num_committees":  int(ie["acct_num"].nunique()),
        "date_range": {
            "start": ie["expenditure_date"].min().date().isoformat() if ie["expenditure_date"].notna().any() else None,
            "end":   ie["expenditure_date"].max().date().isoformat() if ie["expenditure_date"].notna().any() else None,
        },
        "by_type": [
            {
                "type_code":   row.type_code,
                "label":       TYPE_LABELS.get(row.type_code, row.type_code),
                "total_amount": round(float(row.total_amount), 2),
                "num_rows":    int(row.num_rows),
            }
            for row in type_breakdown.itertuples(index=False)
        ],
        "generated_by": "scripts/44_export_ie_summary.py",
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "summary.json").write_text(json.dumps(summary, indent=2))
    print(f"\nWrote summary.json")
    print(json.dumps(summary, indent=2))

    # --- Per-committee JSONs ---
    BY_COMM_DIR.mkdir(parents=True, exist_ok=True)
    print(f"\nWriting per-committee JSONs ...", flush=True)
    num_files = 0
    for acct_num, cdf in ie.groupby("acct_num", sort=False):
        if not acct_num:
            continue
        total      = float(cdf["amount"].sum())
        num_txn    = int(len(cdf))
        date_min   = cdf["expenditure_date"].min()
        date_max   = cdf["expenditure_date"].max()

        by_type = [
            {"type_code": tc, "label": TYPE_LABELS.get(tc, tc),
             "total_amount": round(float(g["amount"].sum()), 2), "num_rows": int(len(g))}
            for tc, g in cdf.groupby("type_code")
        ]
        by_year = [
            {"year": int(y), "amount": round(float(a), 2)}
            for y, a in cdf.groupby("year")["amount"].sum().sort_index().items()
            if not pd.isna(y)
        ]

        # Top vendors paid for IE/EC activity
        top_vendors = (
            cdf.groupby("vendor_name")
            .agg(total_amount=("amount", "sum"), num_payments=("amount", "size"))
            .reset_index()
            .sort_values("total_amount", ascending=False)
            .head(15)
        )
        top_vendors_list = [
            {"vendor_name": r.vendor_name, "total_amount": round(float(r.total_amount), 2),
             "num_payments": int(r.num_payments)}
            for r in top_vendors.itertuples(index=False)
        ]

        # Candidate targets hinted from purpose field
        hints = cdf["candidate_hint"].dropna()
        candidate_targets = list(hints.value_counts().head(10).index.tolist())

        payload = {
            "acct_num":          acct_num,
            "committee_name":    comm_names.get(str(acct_num), ""),
            "total_amount":      round(total, 2),
            "num_transactions":  num_txn,
            "date_range": {
                "start": date_min.date().isoformat() if pd.notna(date_min) else None,
                "end":   date_max.date().isoformat() if pd.notna(date_max) else None,
            },
            "by_type":           by_type,
            "by_year":           by_year,
            "top_vendors":       top_vendors_list,
            "candidate_targets": candidate_targets,
        }
        (BY_COMM_DIR / f"{acct_num}.json").write_text(
            json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        )
        num_files += 1
    print(f"  wrote {num_files:,} committee files")

    # --- Top spenders ---
    print("\nBuilding top IE spenders ...", flush=True)
    top_spenders = (
        ie.groupby("acct_num")
        .agg(total_amount=("amount", "sum"), num_transactions=("amount", "size"),
             num_type_codes=("type_code", "nunique"))
        .reset_index()
        .sort_values("total_amount", ascending=False)
        .head(200)
    )
    top_list = [
        {
            "acct_num":        row.acct_num,
            "committee_name":  comm_names.get(str(row.acct_num), ""),
            "total_amount":    round(float(row.total_amount), 2),
            "num_transactions": int(row.num_transactions),
        }
        for row in top_spenders.itertuples(index=False)
        if row.acct_num
    ]
    (OUT_DIR / "top_spenders.json").write_text(json.dumps(top_list, separators=(",", ":")))
    print(f"  wrote top_spenders.json ({len(top_list)} committees)")

    # --- Candidate targets (best-effort) ---
    print("\nBuilding candidate targets index ...", flush=True)
    hints_df = ie[ie["candidate_hint"].notna()].copy()
    cand_targets = (
        hints_df.groupby("candidate_hint")
        .agg(total_amount=("amount", "sum"), num_expenditures=("amount", "size"),
             num_committees=("acct_num", "nunique"))
        .reset_index()
        .sort_values("total_amount", ascending=False)
        .head(100)
    )
    targets_list = [
        {
            "candidate_name_hint": row.candidate_hint,
            "total_amount":        round(float(row.total_amount), 2),
            "num_expenditures":    int(row.num_expenditures),
            "num_committees":      int(row.num_committees),
        }
        for row in cand_targets.itertuples(index=False)
    ]
    (OUT_DIR / "by_candidate_targeted.json").write_text(
        json.dumps(targets_list, separators=(",", ":"), ensure_ascii=False)
    )
    print(f"  wrote by_candidate_targeted.json ({len(targets_list)} hints)")

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
