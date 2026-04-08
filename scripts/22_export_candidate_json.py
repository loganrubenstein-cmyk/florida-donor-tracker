# scripts/22_export_candidate_json.py
"""
Script 22: Export per-candidate JSON for the frontend profile pages.

Reads candidate_contributions.csv (hard money, from script 21) and
candidate_pc_links.json (soft money links, from scripts 18/19), then
writes one JSON file per candidate account plus a lightweight listing file.

Outputs
-------
  public/data/candidates/{acct}.json
      Full candidate profile: hard money stats, quarterly chart data,
      top donors, linked PCs with their totals, combined figures.

  public/data/candidate_stats.json
      Lightweight listing for the candidates index page.
      [{acct_num, candidate_name, office_desc, party_code, election_year,
        district, hard_money_total, soft_money_total, total_combined,
        num_hard_contributions, num_linked_pcs}]

Hard money  = direct contributions to candidate's campaign account (this script)
Soft money  = contributions to linked PCs (totals pulled from committees/{acct}.json)
Combined    = hard + soft (total political footprint of the candidate)

Usage (from project root, with .venv activated):
    python scripts/22_export_candidate_json.py
    python scripts/22_export_candidate_json.py --force
"""

import json
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR

CAND_CONTRIB_CSV  = PROCESSED_DIR / "candidate_contributions.csv"
PC_LINKS_JSON     = Path(__file__).resolve().parent.parent / "public" / "data" / "candidate_pc_links.json"
COMMITTEES_DIR    = Path(__file__).resolve().parent.parent / "public" / "data" / "committees"
OUTPUT_DIR        = Path(__file__).resolve().parent.parent / "public" / "data" / "candidates"
STATS_JSON        = Path(__file__).resolve().parent.parent / "public" / "data" / "candidate_stats.json"

TOP_DONORS_LIMIT  = 20


# ── Quarter helpers ────────────────────────────────────────────────────────────

def date_to_quarter_label(dt) -> str | None:
    """Convert a date to 'YYYY-QN' label, e.g. 2025-04-15 → '2025-Q2'."""
    if pd.isna(dt):
        return None
    month = dt.month
    q = (month - 1) // 3 + 1
    return f"{dt.year}-Q{q}"


def build_quarterly_series(df: pd.DataFrame) -> list[dict]:
    """
    Aggregate contributions by calendar quarter.
    Returns list of {period, amount, num_contributions} sorted chronologically.
    """
    df = df.copy()
    df["quarter"] = df["contribution_date"].apply(date_to_quarter_label)
    df = df.dropna(subset=["quarter"])
    if df.empty:
        return []

    grouped = (
        df.groupby("quarter")["amount"]
        .agg(amount="sum", num_contributions="count")
        .reset_index()
        .rename(columns={"quarter": "period"})
        .sort_values("period")
    )
    return [
        {
            "period":            row["period"],
            "amount":            round(float(row["amount"]), 2),
            "num_contributions": int(row["num_contributions"]),
        }
        for _, row in grouped.iterrows()
    ]


# ── Top donors ─────────────────────────────────────────────────────────────────

def build_top_donors(df: pd.DataFrame, limit: int = TOP_DONORS_LIMIT) -> list[dict]:
    """
    Aggregate by contributor_name, return top N by total amount.
    """
    if df.empty or "contributor_name" not in df.columns:
        return []

    grouped = (
        df.groupby("contributor_name")
        .agg(
            total_amount=("amount", "sum"),
            num_contributions=("amount", "count"),
            is_corporate=("is_corporate", "first"),
            occupation=("contributor_occupation", "first"),
        )
        .reset_index()
        .sort_values("total_amount", ascending=False)
        .head(limit)
    )

    return [
        {
            "name":              row["contributor_name"],
            "total_amount":      round(float(row["total_amount"]), 2),
            "num_contributions": int(row["num_contributions"]),
            "type":              "corporate" if row["is_corporate"] else "individual",
            "occupation":        str(row["occupation"]) if pd.notna(row["occupation"]) else "",
        }
        for _, row in grouped.iterrows()
    ]


# ── PC soft money lookup ───────────────────────────────────────────────────────

def load_pc_totals() -> dict:
    """
    Load committees/{acct}.json files and return dict: acct_num → {total_received, num_contributions}.
    Only loads files that exist.
    """
    totals = {}
    if not COMMITTEES_DIR.exists():
        return totals
    for f in COMMITTEES_DIR.glob("*.json"):
        try:
            d = json.loads(f.read_text())
            totals[d["acct_num"]] = {
                "total_received":   d.get("total_received", 0.0),
                "num_contributions": d.get("num_contributions", 0),
                "committee_name":   d.get("committee_name", ""),
            }
        except Exception:
            continue
    return totals


def build_linked_pcs(acct: str, pc_links: dict, pc_totals: dict) -> tuple[list[dict], float]:
    """
    For a candidate account, build the linked PCs list and sum soft money total.
    Returns (linked_pcs_list, soft_money_total).
    """
    links = pc_links.get(str(acct), [])
    result = []
    soft_total = 0.0

    for link in links:
        pc_acct  = link.get("pc_acct", "")
        pc_type  = link.get("pc_type", "")
        pc_info  = pc_totals.get(pc_acct, {})
        total    = pc_info.get("total_received", 0.0)
        # PTY (party) committees are chaired by candidates but their receipts
        # represent party-wide fundraising, not candidate-controlled soft money.
        if pc_type != "PTY":
            soft_total += total
        result.append({
            "pc_acct":          pc_acct,
            "pc_name":          link.get("pc_name", pc_info.get("committee_name", "")),
            "pc_type":          link.get("pc_type", ""),
            "link_type":        link.get("link_type", ""),
            "confidence":       link.get("confidence", 1.0),
            "total_received":   round(float(total), 2),
            "num_contributions": pc_info.get("num_contributions", 0),
        })

    # Sort by total_received descending
    result.sort(key=lambda x: x["total_received"], reverse=True)
    return result, round(soft_total, 2)


# ── Main ───────────────────────────────────────────────────────────────────────

def main(force: bool = False) -> int:
    print("=== Script 22: Export Candidate JSON ===\n")

    if not CAND_CONTRIB_CSV.exists():
        print(f"ERROR: {CAND_CONTRIB_CSV.name} not found. Run 21_import_candidate_contributions.py first.",
              file=sys.stderr)
        return 1

    print(f"Loading {CAND_CONTRIB_CSV.name} ...", flush=True)
    df = pd.read_csv(CAND_CONTRIB_CSV, dtype=str, low_memory=False).fillna("")
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
    df["is_corporate"] = df["is_corporate"].map({"True": True, "False": False}).fillna(False)
    df["contribution_date"] = pd.to_datetime(df["contribution_date"], errors="coerce")
    print(f"  {len(df):,} rows loaded\n")

    print("Loading candidate_pc_links.json ...", flush=True)
    pc_links = {}
    if PC_LINKS_JSON.exists():
        pc_links = json.loads(PC_LINKS_JSON.read_text())
    print(f"  {len(pc_links):,} candidates with PC links\n")

    print("Loading committee totals ...", flush=True)
    pc_totals = load_pc_totals()
    print(f"  {len(pc_totals):,} committees with JSON\n")

    # Load candidates.csv for name lookup on soft-money-only entries
    print("Loading candidates index ...", flush=True)
    cand_meta_path = PROCESSED_DIR / "candidates.csv"
    cand_name_index = {}
    if cand_meta_path.exists():
        cdf_meta = pd.read_csv(cand_meta_path, dtype=str).fillna("")
        for _, row in cdf_meta.iterrows():
            acct = row.get("acct_num", "").strip()
            if acct:
                elec_id = row.get("election_id", "").strip()
                m = re.match(r"^(\d{4})", elec_id)
                cand_name_index[acct] = {
                    "candidate_name": (row.get("first_name", "").strip() + " " + row.get("last_name", "").strip()).strip(),
                    "election_id":    elec_id,
                    "election_year":  m.group(1) if m else "",
                    "office_code":    row.get("office_code", "").strip(),
                    "office_desc":    row.get("office_desc", "").strip(),
                    "party_code":     row.get("party_code", "").strip(),
                    "district":       row.get("juris1", "").strip(),
                    "status_desc":    row.get("status_desc", "").strip(),
                }
    print(f"  {len(cand_name_index):,} candidates in registry\n")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Group once up-front — avoids O(n*k) repeated full-frame scans
    grouped = dict(tuple(df.groupby("acct_num")))
    accounts = list(grouped.keys())
    stats_list = []
    written = skipped = 0

    print(f"Writing {len(accounts):,} candidate JSON files ...", flush=True)

    for acct in accounts:
        out_path = OUTPUT_DIR / f"{acct}.json"
        if out_path.exists() and not force:
            skipped += 1
            continue

        cdf = grouped[acct]
        if cdf.empty:
            continue

        # Candidate metadata (from first row — same for all rows of this account)
        row0 = cdf.iloc[0]
        candidate_name = str(row0.get("candidate_name", "")).strip()
        election_id    = str(row0.get("election_id", "")).strip()
        election_year  = str(row0.get("election_year", "")).strip()
        office_code    = str(row0.get("office_code", "")).strip()
        office_desc    = str(row0.get("office_desc", "")).strip()
        party_code     = str(row0.get("party_code", "")).strip()
        district       = str(row0.get("district", "")).strip()
        status_desc    = str(row0.get("status_desc", "")).strip()

        # Hard money stats
        hard_total     = round(float(cdf["amount"].sum()), 2)
        num_hard       = int(len(cdf))
        corp_total     = round(float(cdf[cdf["is_corporate"]]["amount"].sum()), 2)
        indiv_total    = round(hard_total - corp_total, 2)

        date_range = {}
        valid_dates = cdf["contribution_date"].dropna()
        if len(valid_dates):
            date_range = {
                "earliest": valid_dates.min().date().isoformat(),
                "latest":   valid_dates.max().date().isoformat(),
            }

        by_quarter = build_quarterly_series(cdf)
        top_donors = build_top_donors(cdf)

        # Soft money (linked PCs)
        linked_pcs, soft_total = build_linked_pcs(acct, pc_links, pc_totals)

        combined_total = round(hard_total + soft_total, 2)

        doc = {
            "acct_num":        acct,
            "candidate_name":  candidate_name,
            "election_id":     election_id,
            "election_year":   election_year,
            "office_code":     office_code,
            "office_desc":     office_desc,
            "party_code":      party_code,
            "district":        district,
            "status_desc":     status_desc,
            "hard_money": {
                "total":            hard_total,
                "num_contributions": num_hard,
                "corporate_total":  corp_total,
                "individual_total": indiv_total,
                "date_range":       date_range,
                "by_quarter":       by_quarter,
                "top_donors":       top_donors,
            },
            "linked_pcs":       linked_pcs,
            "soft_money_total": soft_total,
            "total_combined":   combined_total,
        }

        out_path.write_text(json.dumps(doc, indent=2, default=str))
        written += 1

        stats_list.append({
            "acct_num":           acct,
            "candidate_name":     candidate_name,
            "election_id":        election_id,
            "election_year":      election_year,
            "office_code":        office_code,
            "office_desc":        office_desc,
            "party_code":         party_code,
            "district":           district,
            "hard_money_total":   hard_total,
            "soft_money_total":   soft_total,
            "total_combined":     combined_total,
            "num_hard_contributions": num_hard,
            "num_linked_pcs":     len(linked_pcs),
        })

    # Also write stats for candidates who have PC links but NO hard money yet
    accts_with_data = {s["acct_num"] for s in stats_list}
    for acct, links in pc_links.items():
        if acct in accts_with_data:
            continue
        out_path = OUTPUT_DIR / f"{acct}.json"
        if out_path.exists() and not force:
            continue
        linked_pcs, soft_total = build_linked_pcs(acct, pc_links, pc_totals)
        if not linked_pcs:
            continue

        # Get metadata from candidates.csv registry (falls back to empty strings)
        meta = cand_name_index.get(str(acct), {})
        doc = {
            "acct_num":        acct,
            "candidate_name":  meta.get("candidate_name", ""),
            "election_id":     meta.get("election_id", ""),
            "election_year":   meta.get("election_year", ""),
            "office_code":     meta.get("office_code", ""),
            "office_desc":     meta.get("office_desc", ""),
            "party_code":      meta.get("party_code", ""),
            "district":        meta.get("district", ""),
            "status_desc":     meta.get("status_desc", ""),
            "hard_money": {
                "total": 0.0, "num_contributions": 0,
                "corporate_total": 0.0, "individual_total": 0.0,
                "date_range": {}, "by_quarter": [], "top_donors": [],
            },
            "linked_pcs":       linked_pcs,
            "soft_money_total": soft_total,
            "total_combined":   round(soft_total, 2),
        }
        out_path.write_text(json.dumps(doc, indent=2, default=str))
        written += 1

        stats_list.append({
            "acct_num":           acct,
            "candidate_name":     doc["candidate_name"],
            "election_id":        doc["election_id"],
            "election_year":      doc["election_year"],
            "office_code":        doc["office_code"],
            "office_desc":        doc["office_desc"],
            "party_code":         doc["party_code"],
            "district":           doc["district"],
            "hard_money_total":   0.0,
            "soft_money_total":   soft_total,
            "total_combined":     round(soft_total, 2),
            "num_hard_contributions": 0,
            "num_linked_pcs":     len(linked_pcs),
        })

    # Deduplicate stats by candidate name: same person runs in multiple election
    # cycles with different acct_nums, which would inflate leaderboard counts.
    # Keep the entry with the most recent election_year (ties: highest hard money).
    seen_names: dict[str, dict] = {}
    for entry in stats_list:
        name = entry["candidate_name"].strip().lower()
        if not name:
            continue
        existing = seen_names.get(name)
        if existing is None:
            seen_names[name] = entry
        else:
            def _year(e):
                try:
                    return int(e.get("election_year") or 0)
                except (ValueError, TypeError):
                    return 0
            if _year(entry) > _year(existing) or (
                _year(entry) == _year(existing)
                and entry["hard_money_total"] > existing["hard_money_total"]
            ):
                seen_names[name] = entry
    stats_list = list(seen_names.values())

    # Write listing stats JSON
    stats_list.sort(key=lambda x: x["total_combined"], reverse=True)
    STATS_JSON.write_text(json.dumps(stats_list, indent=2))

    print(f"  Written: {written:,}  Skipped: {skipped:,}")
    print(f"\nWrote candidate_stats.json with {len(stats_list):,} entries")

    print("\n=== SUMMARY ===")
    if stats_list:
        total_hard   = sum(s["hard_money_total"] for s in stats_list)
        total_soft   = sum(s["soft_money_total"] for s in stats_list)
        total_combo  = sum(s["total_combined"] for s in stats_list)
        with_pcs     = sum(1 for s in stats_list if s["num_linked_pcs"] > 0)
        print(f"Candidates with hard money data: {len(stats_list):,}")
        print(f"Candidates with linked PCs:      {with_pcs:,}")
        print(f"Total hard money:   ${total_hard:>16,.2f}")
        print(f"Total soft money:   ${total_soft:>16,.2f}")
        print(f"Total combined:     ${total_combo:>16,.2f}")
        print(f"\nTop 10 by combined total:")
        for s in stats_list[:10]:
            print(f"  {s['candidate_name']:<28s} {s['party_code']}  "
                  f"{s['office_desc'][:28]:<28s}  ${s['total_combined']:>14,.2f}")

    return 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(main(force=force))
