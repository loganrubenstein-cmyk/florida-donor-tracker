# scripts/47_scrape_lobbyist_compensation.py
"""
Script 47: Download FL lobbyist compensation reports from floridalobbyist.gov.

FL requires lobbying firms to file quarterly compensation reports disclosing
what each principal (client) paid the firm. Data goes back to 2007 but the
public download portal only retains the last 8 quarters per branch.

Source: https://floridalobbyist.gov/CompensationReportSearch/DownloadCompReport
URL pattern: https://floridalobbyist.gov/reports/{year}_Quarter{N}_{Branch}.txt

Each file has three record types (hierarchical):
  FIRM      — firm-level total compensation range
  LOBBYIST  — individual lobbyists who worked the account
  PRINCIPAL — principal (client) and what they paid the firm (range)

Compensation ranges (FL uses ranges, not exact amounts):
  $1 - $9,999           midpoint ~ $5,000
  $10,000 - $19,999     midpoint ~ $15,000
  $20,000 - $29,999     midpoint ~ $25,000
  $30,000 - $39,999     midpoint ~ $35,000
  $40,000 - $49,999     midpoint ~ $45,000
  $50,000+              treated as $50,000 (conservative)
  (firm total ranges are wider, e.g. $1 - $49,999)

Output: data/raw/lobbyist_compensation/*.txt  (one per quarter/branch)
        data/processed/lobbyist_compensation.csv

Usage (from project root, with .venv activated):
    python scripts/47_scrape_lobbyist_compensation.py
"""

import sys
import time
from pathlib import Path

import pandas as pd
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR, PROJECT_ROOT

RAW_DIR    = PROJECT_ROOT / "data" / "raw" / "lobbyist_compensation"
OUTPUT_CSV = PROCESSED_DIR / "lobbyist_compensation.csv"

BASE_URL   = "https://floridalobbyist.gov/reports"
BRANCHES   = ["Legislative", "Executive"]
# Last 8 quarters: Q3 2024 → Q2 2026
QUARTERS   = [
    (2024, 3), (2024, 4),
    (2025, 1), (2025, 2), (2025, 3), (2025, 4),
    (2026, 1), (2026, 2),
]

# Quarter number → human label (for filename parsing)
QUARTER_LABELS = {1: "January - March", 2: "April - June",
                  3: "July - September", 4: "October - December"}

REQUEST_DELAY = 1.5

# Compensation range → midpoint estimate (dollars)
COMP_RANGE_MIDPOINTS = {
    "$1.00-$9,999.00":     5000,
    "$1.00-$49,999.00":   25000,   # firm-level total range
    "$10,000.00-$19,999.00": 15000,
    "$10,000-$19,999.00":    15000,
    "$20,000.00-$29,999.00": 25000,
    "$20,000-$29,999.00":    25000,
    "$30,000.00-$39,999.00": 35000,
    "$30,000-$39,999.00":    35000,
    "$40,000.00-$49,999.00": 45000,
    "$40,000-$49,999.00":    45000,
    "$50,000.00-$74,999.00": 62500,
    "$50,000-$74,999.00":    62500,
    "$75,000.00-$99,999.00": 87500,
    "$75,000-$99,999.00":    87500,
    "$100,000.00-$149,999.00": 125000,
    "$100,000-$149,999.00":    125000,
    "$150,000.00-$199,999.00": 175000,
    "$150,000-$199,999.00":    175000,
    "$200,000.00-$249,999.00": 225000,
    "$200,000-$249,999.00":    225000,
    "$250,000.00-$299,999.00": 275000,
    "$250,000-$299,999.00":    275000,
    "$300,000.00-$399,999.00": 350000,
    "$300,000-$399,999.00":    350000,
    "$400,000.00-$499,999.00": 450000,
    "$400,000-$499,999.00":    450000,
    "$500,000.00 OR MORE":     500000,
    "$500,000 OR MORE":        500000,
    "NOT REQUIRED TO REPORT":  0,
    "NO COMPENSATION RECEIVED": 0,
}


def range_to_midpoint(comp_range: str) -> int:
    if not isinstance(comp_range, str):
        return 0
    cleaned = comp_range.strip()
    return COMP_RANGE_MIDPOINTS.get(cleaned, 0)


def download_file(session: requests.Session, year: int, quarter: int, branch: str) -> Path | None:
    filename = f"{year}_Quarter{quarter}_{branch}.txt"
    dest = RAW_DIR / filename
    if dest.exists():
        print(f"  Already have {filename}")
        return dest

    url = f"{BASE_URL}/{filename}"
    try:
        resp = session.get(url, timeout=30, verify=False)
        if resp.status_code == 404:
            print(f"  Not available: {filename}")
            return None
        resp.raise_for_status()
        dest.write_bytes(resp.content)
        print(f"  Downloaded {filename} ({len(resp.content):,} bytes)")
        return dest
    except Exception as e:
        print(f"  ERROR {filename}: {e}")
        return None


def parse_file(path: Path, year: int, quarter: int, branch: str) -> pd.DataFrame:
    """
    Parse compensation file into flat rows — one row per firm×principal record.

    Every row (FIRM, LOBBYIST, PRINCIPAL) already contains FIRM_NAME, so we
    don't need a hierarchical state machine. We filter to PRINCIPAL rows only
    and read the fields directly.
    """
    df = pd.read_csv(path, sep="\t", dtype=str, encoding="latin-1", on_bad_lines="skip")
    df.columns = [c.strip() for c in df.columns]

    principals = df[df["RECORD_TYPE"].str.strip().str.upper() == "PRINCIPAL"].copy()
    if principals.empty:
        return pd.DataFrame()

    result = pd.DataFrame({
        "year":           year,
        "quarter":        quarter,
        "quarter_label":  QUARTER_LABELS.get(quarter, ""),
        "branch":         branch,
        "firm_name":      principals["FIRM_NAME"].str.strip(),
        "principal_name": principals["PRINCIPAL_NAME"].str.strip(),
        "principal_city": principals.get("PRINCIPAL_CITY_NAME", pd.Series(dtype=str)).str.strip(),
        "principal_state": principals.get("PRINCIPAL_STATE_NAME", pd.Series(dtype=str)).str.strip(),
        "comp_range":     principals["PRINCIPAL_COMPENSATION_RANGE"].str.strip(),
    })
    result["comp_midpoint"] = result["comp_range"].apply(range_to_midpoint)
    return result.reset_index(drop=True)


def main() -> int:
    print("=== Script 47: Download Lobbyist Compensation Reports ===\n")

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://floridalobbyist.gov/CompensationReportSearch/",
    })

    # Download all available files
    downloaded = []
    for year, quarter in QUARTERS:
        for branch in BRANCHES:
            path = download_file(session, year, quarter, branch)
            if path:
                downloaded.append((path, year, quarter, branch))
            time.sleep(REQUEST_DELAY)

    print(f"\nDownloaded/found {len(downloaded)} files. Parsing ...\n")

    frames = []
    for path, year, quarter, branch in downloaded:
        print(f"  Parsing {path.name} ...", flush=True)
        try:
            df = parse_file(path, year, quarter, branch)
            frames.append(df)
            print(f"    → {len(df):,} principal records")
        except Exception as e:
            print(f"    WARNING: {e}")

    if not frames:
        print("No data parsed.")
        return 1

    combined = pd.concat(frames, ignore_index=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    combined.to_csv(OUTPUT_CSV, index=False)

    print(f"\nWrote {len(combined):,} rows to {OUTPUT_CSV}")
    print(f"\n=== SUMMARY ===")
    print(f"Total records:        {len(combined):,}")
    print(f"Unique firms:         {combined['firm_name'].nunique():,}")
    print(f"Unique principals:    {combined['principal_name'].nunique():,}")
    print(f"Est. total comp:      ${combined['comp_midpoint'].sum():,.0f}")
    print(f"\nTop 10 principals by estimated compensation:")
    top = combined.groupby("principal_name")["comp_midpoint"].sum().sort_values(ascending=False).head(10)
    for name, amt in top.items():
        print(f"  ${amt:>12,.0f}  {name}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
