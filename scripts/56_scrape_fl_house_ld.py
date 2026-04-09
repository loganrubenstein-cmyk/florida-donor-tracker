# scripts/56_scrape_fl_house_ld.py
"""
Script 56: Scrape FL House Lobbyist Disclosure database.

Downloads the full lobbyist disclosure CSV for each available year (2016–2026)
from the FL House LD portal at https://www.flhouse.gov/LD/default.aspx.

The portal exposes a search form with an "Export To CSV" button that returns
the full result set for a given year in one shot (no pagination needed).

Each CSV row = one lobbyist×principal pair for that year, with:
  - The bills they lobbied on (newline-separated list)
  - Issues/topics (newline-separated "Category:Description" pairs)
  - Amendments, PCBs lobbied on

Outputs:
  public/data/lobbyist_disclosures/raw/{year}.csv          raw cached CSVs
  public/data/lobbyist_disclosures/by_year/{year}.json     all records for year
  public/data/lobbyist_disclosures/by_bill/{bill}.json     lobbyists per bill
  public/data/lobbyist_disclosures/by_lobbyist/{slug}.json  bills per lobbyist
  public/data/lobbyist_disclosures/by_principal/{slug}.json bills per principal
  public/data/lobbyist_disclosures/summary.json            totals + coverage

Usage (from project root, with .venv activated):
    python scripts/56_scrape_fl_house_ld.py
    python scripts/56_scrape_fl_house_ld.py --years 2025 2026
    python scripts/56_scrape_fl_house_ld.py --force   # re-download all years
"""

import argparse
import csv
import io
import json
import re
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import requests
import urllib3
from bs4 import BeautifulSoup

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

sys.path.insert(0, str(Path(__file__).parent))
from config import PROJECT_ROOT

DATA_DIR = PROJECT_ROOT / "public" / "data" / "lobbyist_disclosures"
RAW_DIR  = DATA_DIR / "raw"
BASE_URL = "https://www.flhouse.gov/LD/default.aspx"

# year → form value mapping (from ddlLobbyYear select options)
YEAR_VALUES = {
    2016: "1",
    2017: "2",
    2018: "5",
    2019: "6",
    2020: "7",
    2021: "8",
    2022: "9",
    2023: "10",
    2024: "11",
    2025: "12",
    2026: "13",
}

_SLUG_RE = re.compile(r"[^\w]+")
_BILL_CLEAN = re.compile(r"^(?:CS/)+")  # strip CS/ prefixes for canonical bill number


def slugify(s: str) -> str:
    return _SLUG_RE.sub("-", str(s).lower().strip()).strip("-")


def canonical_bill(bill: str) -> str:
    """Return canonical bill number, stripping CS/ committee-substitute prefixes."""
    return _BILL_CLEAN.sub("", bill.strip())


def fetch_csv_for_year(session: requests.Session, year: int, force: bool = False) -> str | None:
    """Download (or load cached) CSV text for a given year. Returns CSV text or None."""
    raw_path = RAW_DIR / f"{year}.csv"
    if raw_path.exists() and not force:
        print(f"  Loading cached {year}.csv ({raw_path.stat().st_size:,} bytes)")
        return raw_path.read_text(encoding="utf-8-sig", errors="replace")

    year_val = YEAR_VALUES.get(year)
    if not year_val:
        print(f"  SKIP: no form value for year {year}")
        return None

    print(f"  Fetching {year} from FL House LD portal ...")

    # Step 1: GET the form page to extract VIEWSTATE tokens
    try:
        r1 = session.get(BASE_URL, timeout=30, verify=False)
        r1.raise_for_status()
    except Exception as e:
        print(f"  ERROR: GET failed: {e}")
        return None

    soup1 = BeautifulSoup(r1.text, "html.parser")
    vs1  = soup1.find("input", {"name": "__VIEWSTATE"})
    ev1  = soup1.find("input", {"name": "__EVENTVALIDATION"})
    vsg1 = soup1.find("input", {"name": "__VIEWSTATEGENERATOR"})
    if not vs1 or not ev1:
        print("  ERROR: VIEWSTATE/EVENTVALIDATION not found on initial page")
        return None

    # Step 2: POST a search with no filters (get all results for this year)
    search_data = {
        "__VIEWSTATE":          vs1["value"],
        "__EVENTVALIDATION":    ev1["value"],
        "__VIEWSTATEGENERATOR": vsg1["value"] if vsg1 else "",
        "ctl00$MainContent$ddlLobbyYear":      year_val,
        "ctl00$MainContent$ddlTopicCategory":  "-1",
        "ctl00$MainContent$txtLastName":       "",
        "ctl00$MainContent$txtFirstName":      "",
        "ctl00$MainContent$txtPrincipal":      "",
        "ctl00$MainContent$txtTopic":          "",
        "ctl00$MainContent$txtFirm":           "",
        "ctl00$MainContent$txtBill":           "",
        "ctl00$MainContent$txtAmendment":      "",
        "ctl00$MainContent$btnSearch":         "Search",
    }
    try:
        r2 = session.post(BASE_URL, data=search_data, timeout=60, verify=False)
        r2.raise_for_status()
    except Exception as e:
        print(f"  ERROR: Search POST failed: {e}")
        return None

    print(f"  Search results page: {len(r2.content):,} bytes")

    # Step 3: Extract fresh tokens from search results page
    soup2 = BeautifulSoup(r2.text, "html.parser")
    vs2  = soup2.find("input", {"name": "__VIEWSTATE"})
    ev2  = soup2.find("input", {"name": "__EVENTVALIDATION"})
    vsg2 = soup2.find("input", {"name": "__VIEWSTATEGENERATOR"})
    if not vs2 or not ev2:
        print("  ERROR: no tokens in search results page — export may fail")
        return None

    # Step 4: POST Export To CSV
    export_data = {
        "__VIEWSTATE":          vs2["value"],
        "__EVENTVALIDATION":    ev2["value"],
        "__VIEWSTATEGENERATOR": vsg2["value"] if vsg2 else "",
        "ctl00$MainContent$ddlLobbyYear":      year_val,
        "ctl00$MainContent$ddlTopicCategory":  "-1",
        "ctl00$MainContent$txtLastName":       "",
        "ctl00$MainContent$txtFirstName":      "",
        "ctl00$MainContent$txtPrincipal":      "",
        "ctl00$MainContent$txtTopic":          "",
        "ctl00$MainContent$txtFirm":           "",
        "ctl00$MainContent$txtBill":           "",
        "ctl00$MainContent$txtAmendment":      "",
        "btnExportToCsv":                      "Export To CSV",
    }
    try:
        r3 = session.post(BASE_URL, data=export_data, timeout=120, verify=False)
        r3.raise_for_status()
    except Exception as e:
        print(f"  ERROR: Export POST failed: {e}")
        return None

    ct = r3.headers.get("Content-Type", "")
    if "html" in ct.lower():
        print(f"  ERROR: Got HTML response instead of CSV — server may have rejected export")
        return None

    print(f"  CSV downloaded: {len(r3.content):,} bytes")

    # Cache raw CSV
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    raw_path.write_bytes(r3.content)
    return r3.text


def parse_csv(text: str) -> list[dict]:
    """Parse the FL House LD CSV. Bills and Issues are newline-separated inside quoted fields."""
    reader = csv.DictReader(io.StringIO(text, newline=""))
    records = []
    for row in reader:
        # Bills: one per line, may have CS/ prefixes
        bills_raw = [b.strip() for b in re.split(r"\r?\n", row.get("Bills", "")) if b.strip()]
        bills = [{"raw": b, "canonical": canonical_bill(b)} for b in bills_raw]

        # Amendments
        amends = [a.strip() for a in re.split(r"\r?\n", row.get("Amendments", "")) if a.strip()]

        # PCBs
        pcbs = [p.strip() for p in re.split(r"\r?\n", row.get("PCB", "")) if p.strip()]

        # Issues: "Category:Description" format
        issues = []
        for issue_line in re.split(r"\r?\n", row.get("Issues", "")):
            issue_line = issue_line.strip()
            if not issue_line:
                continue
            if ":" in issue_line:
                cat, _, desc = issue_line.partition(":")
                issues.append({"category": cat.strip(), "description": desc.strip()})
            else:
                issues.append({"category": issue_line, "description": ""})

        records.append({
            "lobbyist":    row.get("Lobbyist", "").strip(),
            "principal":   row.get("Principal", "").strip(),
            "firm":        row.get("Firm", "").strip(),
            "bills":       bills,
            "amendments":  amends,
            "pcbs":        pcbs,
            "issues":      issues,
        })
    return records


def build_outputs(records: list[dict], year: int) -> dict:
    """Build by-bill, by-lobbyist, by-principal indexes from parsed records."""
    by_bill:      dict[str, list] = defaultdict(list)
    by_lobbyist:  dict[str, dict] = defaultdict(lambda: {"bills": set(), "principals": set(), "firms": set(), "years": set()})
    by_principal: dict[str, dict] = defaultdict(lambda: {"bills": set(), "lobbyists": set(), "firms": set(), "years": set()})

    for rec in records:
        lobbyist  = rec["lobbyist"]
        principal = rec["principal"]
        firm      = rec["firm"]
        lslug     = slugify(lobbyist)
        pslug     = slugify(principal)

        # by-bill
        canonical_set = {b["canonical"] for b in rec["bills"]}
        for b in rec["bills"]:
            bslug = slugify(b["canonical"])
            by_bill[bslug].append({
                "bill_raw":   b["raw"],
                "bill_canon": b["canonical"],
                "lobbyist":   lobbyist,
                "principal":  principal,
                "firm":       firm,
                "issues":     [i["category"] for i in rec["issues"]],
                "year":       year,
            })

        # by-lobbyist
        entry = by_lobbyist[lslug]
        entry["lobbyist_name"] = lobbyist
        entry["bills"].update(b["canonical"] for b in rec["bills"])
        entry["principals"].add(principal)
        if firm:
            entry["firms"].add(firm)
        entry["years"].add(year)

        # by-principal
        pentity = by_principal[pslug]
        pentity["principal_name"] = principal
        pentity["bills"].update(b["canonical"] for b in rec["bills"])
        pentity["lobbyists"].add(lobbyist)
        if firm:
            pentity["firms"].add(firm)
        pentity["years"].add(year)

    return {
        "by_bill":      by_bill,
        "by_lobbyist":  by_lobbyist,
        "by_principal": by_principal,
    }


def serialize_entry(entry: dict) -> dict:
    """Convert sets to sorted lists for JSON serialization."""
    return {
        k: sorted(v) if isinstance(v, set) else v
        for k, v in entry.items()
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--years", type=int, nargs="+", default=list(YEAR_VALUES.keys()),
                        help="Years to fetch (default: all 2016-2026)")
    parser.add_argument("--force", action="store_true",
                        help="Re-download cached CSVs")
    args = parser.parse_args()

    print("=== Script 56: FL House Lobbyist Disclosure Scraper ===\n")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "by_year").mkdir(exist_ok=True)
    (DATA_DIR / "by_bill").mkdir(exist_ok=True)
    (DATA_DIR / "by_lobbyist").mkdir(exist_ok=True)
    (DATA_DIR / "by_principal").mkdir(exist_ok=True)

    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": BASE_URL,
    })

    # Accumulate cross-year indexes
    all_by_bill:      dict[str, list] = defaultdict(list)
    all_by_lobbyist:  dict[str, dict] = defaultdict(lambda: {"bills": set(), "principals": set(), "firms": set(), "years": set()})
    all_by_principal: dict[str, dict] = defaultdict(lambda: {"bills": set(), "lobbyists": set(), "firms": set(), "years": set()})

    summary_years = []

    for year in sorted(args.years):
        print(f"\n--- Year {year} ---")
        text = fetch_csv_for_year(session, year, force=args.force)
        if text is None:
            continue

        records = parse_csv(text)
        print(f"  Parsed {len(records):,} lobbyist×principal records")

        if not records:
            continue

        # Per-year JSON
        year_path = DATA_DIR / "by_year" / f"{year}.json"
        year_path.write_text(json.dumps(records, separators=(",", ":"), ensure_ascii=False))
        print(f"  Wrote by_year/{year}.json")

        # Build indexes
        idxs = build_outputs(records, year)

        # Merge into cross-year indexes
        for bslug, entries in idxs["by_bill"].items():
            all_by_bill[bslug].extend(entries)

        for lslug, entry in idxs["by_lobbyist"].items():
            ae = all_by_lobbyist[lslug]
            ae["lobbyist_name"] = entry["lobbyist_name"]
            ae["bills"].update(entry["bills"])
            ae["principals"].update(entry["principals"])
            ae["firms"].update(entry["firms"])
            ae["years"].update(entry["years"])

        for pslug, entry in idxs["by_principal"].items():
            ae = all_by_principal[pslug]
            ae["principal_name"] = entry["principal_name"]
            ae["bills"].update(entry["bills"])
            ae["lobbyists"].update(entry["lobbyists"])
            ae["firms"].update(entry["firms"])
            ae["years"].update(entry["years"])

        bill_count = sum(len(r["bills"]) for r in records)
        unique_lobbyists  = len({r["lobbyist"] for r in records})
        unique_principals = len({r["principal"] for r in records})
        unique_bills      = len({b["canonical"] for r in records for b in r["bills"]})

        summary_years.append({
            "year":               year,
            "records":            len(records),
            "unique_lobbyists":   unique_lobbyists,
            "unique_principals":  unique_principals,
            "unique_bills":       unique_bills,
            "total_bill_filings": bill_count,
        })
        print(f"  {unique_lobbyists} lobbyists, {unique_principals} principals, {unique_bills} unique bills")

        # Throttle between years
        time.sleep(2)

    # Write cross-year by-bill files
    print(f"\nWriting {len(all_by_bill):,} by-bill JSON files ...")
    for bslug, entries in all_by_bill.items():
        (DATA_DIR / "by_bill" / f"{bslug}.json").write_text(
            json.dumps(entries, separators=(",", ":"), ensure_ascii=False)
        )

    # Write cross-year by-lobbyist files
    print(f"Writing {len(all_by_lobbyist):,} by-lobbyist JSON files ...")
    for lslug, entry in all_by_lobbyist.items():
        (DATA_DIR / "by_lobbyist" / f"{lslug}.json").write_text(
            json.dumps(serialize_entry(entry), separators=(",", ":"), ensure_ascii=False)
        )

    # Write cross-year by-principal files
    print(f"Writing {len(all_by_principal):,} by-principal JSON files ...")
    for pslug, entry in all_by_principal.items():
        (DATA_DIR / "by_principal" / f"{pslug}.json").write_text(
            json.dumps(serialize_entry(entry), separators=(",", ":"), ensure_ascii=False)
        )

    # Summary
    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "years": summary_years,
        "totals": {
            "unique_lobbyists":  len(all_by_lobbyist),
            "unique_principals": len(all_by_principal),
            "unique_bills":      len(all_by_bill),
            "total_records":     sum(y["records"] for y in summary_years),
        },
        "source": "FL House Lobbyist Disclosure portal — https://www.flhouse.gov/LD/default.aspx",
    }
    (DATA_DIR / "summary.json").write_text(json.dumps(summary, indent=2))
    print(f"\nWrote summary.json")
    print(f"Totals: {summary['totals']['total_records']:,} records, "
          f"{summary['totals']['unique_lobbyists']:,} lobbyists, "
          f"{summary['totals']['unique_principals']:,} principals, "
          f"{summary['totals']['unique_bills']:,} unique bills")

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
