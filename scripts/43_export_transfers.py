# scripts/43_export_transfers.py
"""
Script 43: Export committee transfer data to JSON.

Reads data/processed/transfers.csv (produced by script 12) and writes:
  - public/data/transfers/by_committee/{acct_num}.json   (sent BY this committee)
  - public/data/transfers/top_flows.json                  (top 200 committee→committee flows)
  - public/data/transfers/summary.json                    (coverage stats)

Transfer data shows the "laundering layer" in FL politics — how money moves
from one political committee to another before reaching candidates.

Also attempts to match transferee names to known committee acct_nums using
the committee index, so the frontend can link to /committee/[acct_num].

Usage (from project root, with .venv activated):
    python scripts/43_export_transfers.py
"""

import json
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR, PROJECT_ROOT

INPUT_CSV       = PROCESSED_DIR / "transfers.csv"
OUT_DIR         = PROJECT_ROOT / "public" / "data" / "transfers"
BY_COMM_DIR     = OUT_DIR / "by_committee"
TOP_FLOWS_FILE  = OUT_DIR / "top_flows.json"
SUMMARY_FILE    = OUT_DIR / "summary.json"

COMMITTEE_INDEX = PROJECT_ROOT / "public" / "data" / "committees" / "index.json"

MIN_YEAR = 1990
MAX_YEAR = 2099
TOP_RECIPIENTS_PER_COMMITTEE = 20
TOP_FLOWS_GLOBAL = 200

_ACCT_RE  = re.compile(r"Transfer_(\d+)\.txt", re.IGNORECASE)
_STRIP_RE = re.compile(r"[^\w\s]")
_WS_RE    = re.compile(r"\s+")


def normalize_name(name: str) -> str:
    s = str(name).upper().strip()
    s = _STRIP_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    return s


def acct_from_source(source_file: str) -> str | None:
    m = _ACCT_RE.search(str(source_file))
    return m.group(1) if m else None


def build_committee_lookup(index_path: Path) -> dict[str, dict]:
    """Build a normalized-name → {acct_num, committee_name} lookup from committee index."""
    if not index_path.exists():
        print(f"  WARNING: {index_path} not found; transferee linking disabled")
        return {}
    data = json.loads(index_path.read_text())
    lookup = {}
    for c in data:
        norm = normalize_name(c.get("committee_name", ""))
        if norm:
            lookup[norm] = {
                "acct_num":       str(c["acct_num"]),
                "committee_name": c["committee_name"],
            }
    return lookup


def match_transferee(name: str, lookup: dict) -> dict | None:
    """Try to match a transferee name to a known committee."""
    norm = normalize_name(name)
    if norm in lookup:
        return lookup[norm]
    # Partial match: check if any known committee name is a substring
    for known_norm, info in lookup.items():
        if len(known_norm) > 10 and (known_norm in norm or norm in known_norm):
            return info
    return None


def main() -> int:
    print("=== Script 43: Export Transfers ===\n")

    if not INPUT_CSV.exists():
        print(f"ERROR: {INPUT_CSV} not found. Run script 12 first.")
        return 1

    print(f"Reading {INPUT_CSV} ...", flush=True)
    df = pd.read_csv(INPUT_CSV, low_memory=False)
    original_len = len(df)
    print(f"  loaded {original_len:,} rows")

    # Normalize the transferee column — script 12 may call it "transferee_name"
    # or leave the raw FL DOE header "Funds Transferred To"
    if "transferee_name" not in df.columns and "Funds Transferred To" in df.columns:
        df = df.rename(columns={"Funds Transferred To": "transferee_name"})

    if "transferee_name" not in df.columns:
        print("ERROR: could not find transferee name column. Columns:", list(df.columns))
        return 1

    # Parse dates + amounts
    df["transfer_date"] = pd.to_datetime(df["transfer_date"], errors="coerce")
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)

    # Date sanity filter
    years = df["transfer_date"].dt.year
    bad   = years.isna() | (years < MIN_YEAR) | (years > MAX_YEAR)
    dropped_date = int(bad.sum())
    df = df.loc[~bad].copy()
    if dropped_date:
        print(f"  dropped {dropped_date:,} rows with out-of-range dates")

    # Extract sender acct_num from source_file
    df["sender_acct"] = df["source_file"].apply(acct_from_source)
    df = df.dropna(subset=["sender_acct"]).copy()

    df["year"] = df["transfer_date"].dt.year.astype(int)
    df["transferee_name"] = df["transferee_name"].fillna("").astype(str).str.strip()

    print(f"Post-filter: {len(df):,} rows, {df['sender_acct'].nunique():,} sending committees")

    # Build committee name lookup for linking
    print("\nBuilding committee name lookup ...", flush=True)
    lookup = build_committee_lookup(COMMITTEE_INDEX)
    print(f"  {len(lookup):,} committees in index")

    # Match transferee names to committee acct_nums
    df["transferee_match"] = df["transferee_name"].apply(
        lambda n: match_transferee(n, lookup) if n else None
    )
    matched = df["transferee_match"].notna().sum()
    print(f"  matched {matched:,} of {len(df):,} transfers to known committees")

    # --- Per-committee (sender) JSONs ---
    BY_COMM_DIR.mkdir(parents=True, exist_ok=True)
    print(f"\nWriting per-committee JSONs to {BY_COMM_DIR}/ ...", flush=True)

    num_files = 0
    for acct_num, cdf in df.groupby("sender_acct", sort=False):
        total_sent    = float(cdf["amount"].sum())
        num_transfers = int(len(cdf))
        date_min      = cdf["transfer_date"].min()
        date_max      = cdf["transfer_date"].max()

        # Top recipients
        recipient_groups = (
            cdf.groupby("transferee_name")
            .agg(total_amount=("amount", "sum"), num_transfers=("amount", "size"))
            .reset_index()
            .sort_values("total_amount", ascending=False)
            .head(TOP_RECIPIENTS_PER_COMMITTEE)
        )
        top_recipients = []
        for row in recipient_groups.itertuples(index=False):
            match = match_transferee(row.transferee_name, lookup)
            top_recipients.append({
                "transferee_name":     row.transferee_name,
                "transferee_acct_num": match["acct_num"] if match else None,
                "total_amount":        round(float(row.total_amount), 2),
                "num_transfers":       int(row.num_transfers),
                "pct":                 round(float(row.total_amount) / total_sent * 100, 2)
                                       if total_sent else 0.0,
            })

        by_year = [
            {"year": int(y), "amount": round(float(a), 2)}
            for y, a in cdf.groupby("year")["amount"].sum().sort_index().items()
        ]

        payload = {
            "acct_num":     acct_num,
            "total_sent":   round(total_sent, 2),
            "num_transfers": num_transfers,
            "date_range": {
                "start": date_min.date().isoformat() if pd.notna(date_min) else None,
                "end":   date_max.date().isoformat() if pd.notna(date_max) else None,
            },
            "top_recipients": top_recipients,
            "by_year":        by_year,
        }
        (BY_COMM_DIR / f"{acct_num}.json").write_text(
            json.dumps(payload, separators=(",", ":"))
        )
        num_files += 1

    print(f"  wrote {num_files:,} committee files")

    # --- Top flows: aggregate committee→committee money flows ---
    print("\nBuilding top flows ...", flush=True)
    flow_rows = []
    for (sender, recipient), fdf in df.groupby(["sender_acct", "transferee_name"]):
        if not recipient:
            continue
        match = match_transferee(recipient, lookup)
        flow_rows.append({
            "sender_acct_num":     sender,
            "transferee_name":     recipient,
            "transferee_acct_num": match["acct_num"] if match else None,
            "total_amount":        round(float(fdf["amount"].sum()), 2),
            "num_transfers":       int(len(fdf)),
            "years":               sorted(fdf["year"].unique().tolist()),
        })

    flow_rows.sort(key=lambda r: r["total_amount"], reverse=True)
    flow_rows = flow_rows[:TOP_FLOWS_GLOBAL]

    TOP_FLOWS_FILE.write_text(json.dumps(flow_rows, separators=(",", ":")))
    print(f"  wrote {len(flow_rows):,} top flows to {TOP_FLOWS_FILE}")

    # --- Summary ---
    summary = {
        "total_amount":         round(float(df["amount"].sum()), 2),
        "total_transfers":      int(len(df)),
        "num_sending_committees": int(df["sender_acct"].nunique()),
        "num_unique_recipients": int(df["transferee_name"].nunique()),
        "num_linked_to_committee": int(matched),
        "date_range": {
            "start": df["transfer_date"].min().date().isoformat(),
            "end":   df["transfer_date"].max().date().isoformat(),
        },
        "dropped_rows_out_of_range_date": dropped_date,
        "generated_by": "scripts/43_export_transfers.py",
    }
    SUMMARY_FILE.write_text(json.dumps(summary, indent=2))
    print(f"\nWrote summary to {SUMMARY_FILE}")
    print(json.dumps(summary, indent=2))

    return 0


if __name__ == "__main__":
    sys.exit(main())
