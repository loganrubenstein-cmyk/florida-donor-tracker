# scripts/57_build_ld_indexes.py
"""
Script 57: Build summary indexes from FL House LD bill disclosure data.

Reads all by_bill JSON files (14K+) from script 56 and produces:
  - public/data/lobbyist_disclosures/top_bills.json  top 500 most-lobbied bills
  - public/data/lobbyist_disclosures/by_issue.json   issue category rollups
  - public/data/lobbyist_disclosures/top_lobbyists.json  top lobbyists by bill count

Usage:
    python scripts/57_build_ld_indexes.py
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from config import PROJECT_ROOT

DATA_DIR = PROJECT_ROOT / "public" / "data" / "lobbyist_disclosures"

# Budget bill slugs to flag with a label
BUDGET_PATTERNS = re.compile(r"^(HB|SB)\s*500[0-9]", re.I)
APPROP_PATTERNS = re.compile(r"^(HB|SB)\s*250[0-9]", re.I)


def categorize_bill(canon: str) -> str:
    if BUDGET_PATTERNS.match(canon):
        return "General Appropriations"
    if APPROP_PATTERNS.match(canon):
        return "Appropriations"
    return ""


def main() -> int:
    print("=== Script 57: Build FL House LD Summary Indexes ===\n")

    by_bill_dir = DATA_DIR / "by_bill"
    if not by_bill_dir.exists():
        print("ERROR: by_bill directory not found — run script 56 first")
        return 1

    bill_files = list(by_bill_dir.glob("*.json"))
    print(f"Processing {len(bill_files):,} bill files ...")

    bills = []
    issue_counts: dict[str, dict] = defaultdict(lambda: {"count": 0, "bills": set(), "principals": set()})
    lobbyist_counts: dict[str, dict] = defaultdict(lambda: {"count": 0, "bills": set(), "principals": set(), "firms": set()})

    for fpath in bill_files:
        try:
            entries = json.loads(fpath.read_text())
        except Exception:
            continue

        if not entries:
            continue

        canon = entries[0].get("bill_canon", fpath.stem)
        slug  = fpath.stem
        years = sorted(set(e.get("year", 0) for e in entries))
        principals = list(set(e.get("principal", "") for e in entries if e.get("principal")))
        lobbyists  = list(set(e.get("lobbyist", "") for e in entries if e.get("lobbyist")))
        issues_all = [cat for e in entries for cat in e.get("issues", []) if cat]

        # Deduplicate issue categories and pick most common
        issue_counter: dict[str, int] = defaultdict(int)
        for cat in issues_all:
            issue_counter[cat] += 1
        top_issues = sorted(issue_counter.keys(), key=lambda k: -issue_counter[k])[:5]

        # Filter out blank/garbage issue labels
        top_issues = [i for i in top_issues if len(i) > 2 and not i.startswith("Ensure the Funding")][:5]

        bills.append({
            "slug":           slug,
            "bill":           canon,
            "category":       categorize_bill(canon),
            "filings":        len(entries),
            "unique_principals": len(principals),
            "unique_lobbyists": len(lobbyists),
            "years":          years,
            "issues":         top_issues,
            "top_principals": sorted(principals, key=lambda p: sum(1 for e in entries if e.get("principal") == p), reverse=True)[:10],
        })

        # Issue rollup
        for cat in set(issues_all):
            if cat and len(cat) > 2 and not cat.startswith("Ensure the Funding"):
                issue_counts[cat]["count"] += len(entries)
                issue_counts[cat]["bills"].add(slug)
                for e in entries:
                    issue_counts[cat]["principals"].add(e.get("principal", ""))

        # Lobbyist rollup
        for e in entries:
            lb = e.get("lobbyist", "")
            if lb:
                lobbyist_counts[lb]["count"] += 1
                lobbyist_counts[lb]["bills"].add(slug)
                lobbyist_counts[lb]["principals"].add(e.get("principal", ""))
                if e.get("firm"):
                    lobbyist_counts[lb]["firms"].add(e.get("firm"))

    # Top bills
    bills.sort(key=lambda b: b["filings"], reverse=True)
    top500 = bills[:500]
    out = DATA_DIR / "top_bills.json"
    out.write_text(json.dumps(top500, separators=(",", ":"), ensure_ascii=False))
    print(f"Wrote top_bills.json ({len(top500)} bills)")
    print(f"  Most lobbied: {top500[0]['bill']} — {top500[0]['filings']} filings, {top500[0]['unique_principals']} principals")

    # Issue rollup — convert sets to sorted lists
    issue_list = []
    for cat, data in issue_counts.items():
        issue_list.append({
            "category":      cat,
            "total_filings": data["count"],
            "unique_bills":  len(data["bills"]),
            "unique_principals": len(data["principals"]),
        })
    issue_list.sort(key=lambda x: x["total_filings"], reverse=True)
    out2 = DATA_DIR / "by_issue.json"
    out2.write_text(json.dumps(issue_list[:200], separators=(",", ":"), ensure_ascii=False))
    print(f"Wrote by_issue.json ({len(issue_list)} categories)")

    # Top lobbyists
    lobbyist_list = []
    for name, data in lobbyist_counts.items():
        lobbyist_list.append({
            "lobbyist": name,
            "total_filings": data["count"],
            "unique_bills": len(data["bills"]),
            "unique_principals": len(data["principals"]),
            "firms": sorted(data["firms"])[:5],
        })
    lobbyist_list.sort(key=lambda x: x["total_filings"], reverse=True)
    out3 = DATA_DIR / "top_lobbyists.json"
    out3.write_text(json.dumps(lobbyist_list[:500], separators=(",", ":"), ensure_ascii=False))
    print(f"Wrote top_lobbyists.json ({len(lobbyist_list)} lobbyists)")
    print(f"  Most active: {lobbyist_list[0]['lobbyist']} — {lobbyist_list[0]['total_filings']} filings")

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
