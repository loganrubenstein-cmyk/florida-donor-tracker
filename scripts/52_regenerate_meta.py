# scripts/52_regenerate_meta.py
"""
Script 52: Regenerate public/data/meta.json with fresh stats across all datasets.

Reads from all summary JSONs and index files to produce a single comprehensive
meta.json with:
  - Campaign finance totals (contributions, expenditures, transfers)
  - Donor counts
  - Committee/candidate counts
  - Lobbyist compensation totals
  - IE/EC totals
  - News coverage stats
  - Voting records stats
  - Data freshness timestamps

This is used by the frontend homepage and site-wide stats display.

Usage (from project root, with .venv activated):
    python scripts/52_regenerate_meta.py
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from config import PROJECT_ROOT, PROCESSED_DIR

DATA_DIR = PROJECT_ROOT / "public" / "data"


def load_json(path: Path) -> dict | list | None:
    if path.exists():
        try:
            return json.loads(path.read_text())
        except Exception:
            pass
    return None


def main() -> int:
    print("=== Script 52: Regenerate meta.json ===\n")

    meta: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "note": "All figures are FL state-level data unless otherwise noted.",
    }

    # ── Campaign Finance: Contributions ──────────────────────────────────────
    # From donors/index.json (authoritative total)
    donors_idx = load_json(DATA_DIR / "donors" / "index.json")
    if donors_idx and isinstance(donors_idx, list):
        total_donors = len(donors_idx)
        total_contributions_amount = sum(d.get("total_combined", 0) for d in donors_idx)
        corp_donors = sum(1 for d in donors_idx if d.get("is_corporate"))
        meta["campaign_finance"] = {
            "total_donors":                    total_donors,
            "corporate_donors":                corp_donors,
            "individual_donors":               total_donors - corp_donors,
            "estimated_total_contributions":   round(total_contributions_amount, 2),
        }
        print(f"Donors: {total_donors:,} ({corp_donors:,} corporate)")
        print(f"Campaign finance total: ${total_contributions_amount:,.0f}")

    # ── Committees ────────────────────────────────────────────────────────────
    committees_idx = load_json(DATA_DIR / "committees" / "index.json")
    if committees_idx and isinstance(committees_idx, list):
        total_committees = len(committees_idx)
        total_received   = sum(c.get("total_received", 0) for c in committees_idx)
        meta["committees"] = {
            "total_committees":      total_committees,
            "total_received":        round(total_received, 2),
        }
        print(f"Committees: {total_committees:,}, total received: ${total_received:,.0f}")

    # ── Candidates ────────────────────────────────────────────────────────────
    cand_stats = load_json(DATA_DIR / "candidate_stats.json")
    if cand_stats and isinstance(cand_stats, list):
        total_candidates = len(cand_stats)
        total_cand_raised = sum(
            c.get("hard_money_total", 0) + c.get("soft_money_total", 0)
            for c in cand_stats
        )
        meta["candidates"] = {
            "total_candidates":    total_candidates,
            "total_raised":        round(total_cand_raised, 2),
        }
        print(f"Candidates: {total_candidates:,}, total raised: ${total_cand_raised:,.0f}")

    # ── Expenditures (Committee) ──────────────────────────────────────────────
    exp_summary = load_json(DATA_DIR / "expenditures" / "summary.json")
    if exp_summary and isinstance(exp_summary, dict):
        meta["committee_expenditures"] = {
            "total_amount":        exp_summary.get("total_amount", 0),
            "total_payments":      exp_summary.get("total_payments", 0),
            "num_committees":      exp_summary.get("num_committees", 0),
            "date_range":          exp_summary.get("date_range", {}),
        }
        print(f"Committee expenditures: ${exp_summary.get('total_amount', 0):,.0f}")

    # ── Expenditures (Candidate) ──────────────────────────────────────────────
    cand_expend_csv = PROCESSED_DIR / "candidate_expenditures.csv"
    if cand_expend_csv.exists():
        try:
            ce = pd.read_csv(cand_expend_csv, usecols=["amount", "acct_num"],
                             dtype={"acct_num": str}, low_memory=False)
            ce["amount"] = pd.to_numeric(ce["amount"], errors="coerce").fillna(0.0)
            ce_total      = float(ce["amount"].sum())
            ce_payments   = int(len(ce))
            ce_candidates = int(ce["acct_num"].nunique())
            meta["candidate_expenditures"] = {
                "total_amount":    round(ce_total, 2),
                "total_payments":  ce_payments,
                "num_candidates":  ce_candidates,
            }
            print(f"Candidate expenditures: ${ce_total:,.0f} across {ce_candidates:,} candidates")
        except Exception as e:
            print(f"  WARNING: candidate_expenditures.csv error: {e}")

    # ── Transfers ─────────────────────────────────────────────────────────────
    transfers_summary = load_json(DATA_DIR / "transfers" / "summary.json")
    if transfers_summary and isinstance(transfers_summary, dict):
        meta["transfers"] = {
            "total_amount":   transfers_summary.get("total_amount", 0),
            "total_records":  transfers_summary.get("total_transfers", transfers_summary.get("total_records", 0)),
            "num_committees": transfers_summary.get("num_sending_committees", transfers_summary.get("num_committees", 0)),
        }
        print(f"Fund transfers: ${transfers_summary.get('total_amount', 0):,.0f}")

    # ── Independent Expenditures ──────────────────────────────────────────────
    ie_summary = load_json(DATA_DIR / "ie" / "summary.json")
    if ie_summary and isinstance(ie_summary, dict):
        meta["independent_expenditures"] = {
            "total_amount":    ie_summary.get("total_amount", 0),
            "total_rows":      ie_summary.get("total_rows", 0),
            "num_committees":  ie_summary.get("num_committees", 0),
            "date_range":      ie_summary.get("date_range", {}),
        }
        print(f"IE/EC: ${ie_summary.get('total_amount', 0):,.0f}")

    # ── Lobbyist Compensation ─────────────────────────────────────────────────
    comp_summary = load_json(DATA_DIR / "lobbyist_comp" / "summary.json")
    if comp_summary and isinstance(comp_summary, dict):
        meta["lobbyist_compensation"] = {
            "total_estimated_comp":  comp_summary.get("total_estimated_comp", 0),
            "total_records":         comp_summary.get("total_records", 0),
            "num_principals":        comp_summary.get("num_principals", 0),
            "num_firms":             comp_summary.get("num_firms", 0),
            "note":                  comp_summary.get("note", ""),
        }
        print(f"Lobbyist compensation: ${comp_summary.get('total_estimated_comp', 0):,.0f} est.")

    # ── Lobbyist Registrations ────────────────────────────────────────────────
    lobbyist_files = list((DATA_DIR / "lobbyists").glob("*.json")) if (DATA_DIR / "lobbyists").exists() else []
    principals_idx = load_json(DATA_DIR / "principals" / "index.json")
    if lobbyist_files or principals_idx:
        meta["lobbyist_registrations"] = {
            "total_lobbyists":   len(lobbyist_files),
            "total_principals":  len(principals_idx) if isinstance(principals_idx, list) else 0,
        }
        print(f"Lobbyist registrations: {len(lobbyist_files):,} lobbyists, {meta['lobbyist_registrations']['total_principals']:,} principals")

    # ── News Coverage ─────────────────────────────────────────────────────────
    news_feed = DATA_DIR / "news" / "feed.jsonl"
    if news_feed.exists():
        try:
            articles = [json.loads(line) for line in news_feed.read_text().strip().splitlines() if line]
            outlets  = {a.get("outlet") for a in articles}
            meta["news"] = {
                "total_articles":  len(articles),
                "total_outlets":   len(outlets),
                "outlets":         sorted(outlets),
            }
            print(f"News: {len(articles):,} articles from {len(outlets)} outlets")
        except Exception as e:
            print(f"  WARNING: news feed error: {e}")

    news_by_entity = DATA_DIR / "news" / "by_entity"
    if news_by_entity.exists():
        entity_files = list(news_by_entity.glob("*.json"))
        meta["news"]["targeted_entities"] = len(entity_files)

    # ── Election Results ──────────────────────────────────────────────────────
    elections_summary = load_json(DATA_DIR / "elections" / "summary.json")
    if elections_summary and isinstance(elections_summary, list):
        unique_years = sorted({e["year"] for e in elections_summary})
        elections_covered = [{"year": e["year"], "type": e.get("election_type","general"), "name": e["election_name"]} for e in elections_summary]
        meta["election_results"] = {
            "years_covered":          unique_years,
            "elections_covered":      elections_covered,
            "total_elections":        len(elections_summary),
            "contests_with_finance":  sum(e.get("contests_with_finance", 0) for e in elections_summary),
        }
        print(f"Election results: {len(elections_summary)} elections, years {unique_years}")

    # ── Voting Records ────────────────────────────────────────────────────────
    votes_summary = load_json(DATA_DIR / "legislators" / "votes" / "summary.json")
    if votes_summary and isinstance(votes_summary, dict):
        meta["voting_records"] = {
            "total_legislators":   votes_summary.get("total_legislators", 0),
            "total_bills":         votes_summary.get("total_bills_fetched", 0),
            "total_roll_calls":    votes_summary.get("total_roll_calls", 0),
            "sessions_covered":    votes_summary.get("sessions_covered", []),
        }
        print(f"Voting records: {votes_summary.get('total_legislators', 0)} legislators, {votes_summary.get('total_bills_fetched', 0)} bills")
    else:
        # Check if legislators index exists even if votes summary doesn't
        leg_idx = load_json(DATA_DIR / "legislators" / "index.json")
        if leg_idx:
            meta["voting_records"] = {"total_legislators": len(leg_idx), "note": "Roll call data pending"}

    # ── FL House Lobbyist Disclosures ────────────────────────────────────────
    ld_summary = load_json(DATA_DIR / "lobbyist_disclosures" / "summary.json")
    if ld_summary and isinstance(ld_summary, dict):
        totals = ld_summary.get("totals", {})
        years_data = ld_summary.get("years", [])
        years = [y["year"] for y in years_data]
        meta["lobbyist_disclosures"] = {
            "total_records":     totals.get("total_records", 0),
            "unique_lobbyists":  totals.get("unique_lobbyists", 0),
            "unique_principals": totals.get("unique_principals", 0),
            "unique_bills":      totals.get("unique_bills", 0),
            "years_covered":     years,
            "source":            "FL House Lobbyist Disclosure portal",
        }
        print(f"FL House LD: {totals.get('total_records',0):,} records, {totals.get('unique_bills',0):,} unique bills, years {years}")

    # ── FEC Federal Data ──────────────────────────────────────────────────────
    fec_summary = load_json(DATA_DIR / "fec" / "summary.json")
    if fec_summary and isinstance(fec_summary, dict):
        meta["fec_federal"] = {
            "fl_federal_candidates":  fec_summary.get("fl_federal_candidates", 0),
            "fl_federal_committees":  fec_summary.get("fl_federal_committees", 0),
            "donor_crossref_count":   fec_summary.get("donor_crossref_count", 0),
            "candidate_crossref_count": fec_summary.get("candidate_crossref_count", 0),
        }
        print(f"FEC: {fec_summary.get('fl_federal_candidates', 0)} federal candidates, {fec_summary.get('donor_crossref_count', 0)} donor cross-refs")

    # ── Influence Index (principals with combined data) ───────────────────────
    influence_idx = load_json(DATA_DIR / "principals" / "influence_index.json")
    if influence_idx and isinstance(influence_idx, list):
        total_influence = sum(p.get("total_influence", 0) for p in influence_idx)
        meta["principals_influence"] = {
            "total_principals_indexed": len(influence_idx),
            "combined_influence_total": round(total_influence, 2),
        }
        print(f"Influence index: {len(influence_idx):,} principals, ${total_influence:,.0f} combined")

    # ── Grand totals ──────────────────────────────────────────────────────────
    campaign_total  = meta.get("campaign_finance", {}).get("estimated_total_contributions", 0)
    comp_total      = meta.get("lobbyist_compensation", {}).get("total_estimated_comp", 0)
    ie_total        = meta.get("independent_expenditures", {}).get("total_amount", 0)
    comm_exp_total  = meta.get("committee_expenditures", {}).get("total_amount", 0)
    cand_exp_total  = meta.get("candidate_expenditures", {}).get("total_amount", 0)
    meta["grand_totals"] = {
        "total_political_spending_tracked": round(campaign_total + comp_total + ie_total, 2),
        "total_expenditures_tracked":       round(comm_exp_total + cand_exp_total, 2),
        "note": "Campaign contributions + est. lobbyist compensation + IE/EC spending",
    }

    # Write
    out_path = DATA_DIR / "meta.json"
    out_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    print(f"\nWrote {out_path}")
    print(f"\nGrand total tracked: ${meta['grand_totals']['total_political_spending_tracked']:,.0f}")

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
