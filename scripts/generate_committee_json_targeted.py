#!/usr/bin/env python3
"""
generate_committee_json_targeted.py

Generates public/data/committees/{acct_num}.json for specific closed committees
whose raw Contrib_*.txt files were scraped AFTER the last script 09 run (so they're
not in contributions_deduped.csv and won't be picked up by script 08).

After running this, run scripts/load_committee_targeted.py to push the data to
Supabase (committees + committee_top_donors + donor_committees tables).

Usage:
    .venv/bin/python scripts/generate_committee_json_targeted.py
"""

import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT         = Path(__file__).resolve().parent.parent
RAW_DIR      = ROOT / "data" / "raw" / "contributions"
MANIFEST     = ROOT / "data" / "raw" / "contributions" / "closed_committees_manifest.json"
OUT_DIR      = ROOT / "public" / "data" / "committees"

# Committees to generate — add acct_nums here as needed
ACCTS = ["70275"]

_RAW_COLS = ["Rpt Yr", "Rpt Type", "Date", "Amount", "Contributor Name",
             "Address", "City State Zip", "Occupation", "Typ", "InKind Desc"]
_KNOWN_HEADER_STARTS = {"rpt yr", "rpt type", "date", "report_year", "report_type"}


def _has_header(path: Path) -> bool:
    try:
        with open(path, encoding="latin-1", errors="replace") as f:
            first = f.readline().split("\t")[0].strip().lower()
        return first in _KNOWN_HEADER_STARTS
    except Exception:
        return True


def parse_amount(v) -> float:
    if v is None: return 0.0
    s = str(v).strip()
    if not s: return 0.0
    neg = s.startswith("(") and s.endswith(")")
    s = s.replace("$","").replace(",","").replace("(","").replace(")","")
    try: n = float(s)
    except ValueError: return 0.0
    return -n if neg else n


def classify_type(occupation: str, name: str) -> str:
    """Rough individual vs corporate classification."""
    occ = (occupation or "").upper()
    nm  = (name or "").upper()
    corp_signals = ("INC", "LLC", "CORP", "PAC", "ASSOCIATION", "COMMITTEE",
                    "UNION", "FUND", "TRUST", "FOUNDATION", "PARTNERSHIP", "LLP",
                    "L.L.C", "CO.", "COMPANY", "GROUP", "COUNCIL", "FEDERATION")
    if any(sig in nm for sig in corp_signals):
        return "corporate"
    if occ in ("", "NOT EMPLOYED", "RETIRED", "HOMEMAKER", "SELF"):
        return "individual"
    return "individual"


def build_committee_json(acct: str, manifest: dict) -> dict:
    raw_path = RAW_DIR / f"Contrib_{acct}.txt"
    if not raw_path.exists():
        print(f"  ERROR: {raw_path} not found", file=sys.stderr)
        return {}

    has_hdr = _has_header(raw_path)
    rows = []
    with open(raw_path, encoding="latin-1", errors="replace") as f:
        if has_hdr:
            reader = csv.DictReader(f, delimiter="\t")
        else:
            reader = csv.DictReader(f, fieldnames=_RAW_COLS, delimiter="\t")
        for row in reader:
            rows.append(row)

    # Normalize field names
    def get(row, *keys):
        for k in keys:
            if k in row: return row[k]
        return ""

    total_received = 0.0
    num_contributions = 0
    donor_totals: dict[str, dict] = defaultdict(lambda: {"total": 0.0, "count": 0, "type": "individual"})
    dates = []

    for row in rows:
        amt = parse_amount(get(row, "Amount", "amount"))
        name = (get(row, "Contributor Name", "contributor_name") or "").strip().upper()
        occ  = get(row, "Occupation", "contributor_occupation") or ""
        date = get(row, "Date", "contribution_date") or ""

        if amt <= 0 or not name:
            continue

        total_received += amt
        num_contributions += 1
        donor_totals[name]["total"] += amt
        donor_totals[name]["count"] += 1
        donor_totals[name]["type"] = classify_type(occ, name)
        if date:
            dates.append(date)

    # Top 100 donors
    top_donors = sorted(
        [{"name": n, "total_amount": v["total"], "num_contributions": v["count"], "type": v["type"]}
         for n, v in donor_totals.items()],
        key=lambda x: -x["total_amount"]
    )[:100]

    # Date range
    date_range = {}
    if dates:
        date_range = {"min": min(dates), "max": max(dates)}

    committee_name = manifest.get(acct, {}).get("committee_name", f"Committee {acct}")

    return {
        "acct_num": acct,
        "committee_name": committee_name,
        "total_received": round(total_received, 2),
        "num_contributions": num_contributions,
        "date_range": date_range,
        "top_donors": top_donors,
    }


def main() -> int:
    manifest_data = json.loads(MANIFEST.read_text())
    manifest = manifest_data.get("committees", {})
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for acct in ACCTS:
        print(f"Building committee JSON for {acct}...", flush=True)
        data = build_committee_json(acct, manifest)
        if not data:
            continue

        out_path = OUT_DIR / f"{acct}.json"
        out_path.write_text(json.dumps(data, indent=2))
        print(f"  ✓ {out_path.name}: {data['num_contributions']:,} contributions, "
              f"${data['total_received']:,.0f} total, {len(data['top_donors'])} top donors")

    print("\nDone. Now run load_committee_targeted.py to push to Supabase.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
