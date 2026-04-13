"""
Script 88: Import lobbyist compensation reports into Supabase.

Reads tab-delimited TXT files from data/raw/lobbyist_comp/ downloaded by
script 87. Each file has 3 record types per firm:
  FIRM       → firm-level total compensation range
  LOBBYIST   → lobbyist name (links to firm above)
  PRINCIPAL  → principal name + compensation range (links to firm + lobbyist above)

Builds a new table `lobbyist_comp_detail` with one row per
(firm, lobbyist, principal, quarter, year, branch) combination.

Compensation ranges are converted to midpoint dollar amounts:
  $0                    → $0
  $1-$9,999             → $5,000
  $10,000-$19,999       → $15,000
  $20,000-$29,999       → $25,000
  $30,000-$39,999       → $35,000
  $40,000-$49,999       → $45,000
  $50,000+              → Actual amount reported (exact figure in data)

Usage:
    .venv/bin/python scripts/88_import_lobbyist_comp.py
"""

import csv
import io
import os
import re
import sys
from pathlib import Path

csv.field_size_limit(10 * 1024 * 1024)  # 10 MB — some FL files have oversized fields

import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")

DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set in .env.local")

DATA_DIR = ROOT / "data" / "raw" / "lobbyist_comp"

# Quarter label → quarter number
QUARTER_MAP = {
    "January - March": 1, "April - June": 2,
    "July - September": 3, "October - December": 4,
}

# Parse compensation range string → midpoint dollar amount
_RANGE_RE = re.compile(r'\$([\d,]+(?:\.\d+)?)')

def parse_comp(s: str) -> float:
    """Convert compensation range string to a dollar amount.

    Ranges below $50K use category midpoints (FL DoE convention).
    $50K+ principal rows report exact amounts.
    """
    if not s or s.strip() == "$0.00" or s.strip() == "$0":
        return 0.0
    amounts = _RANGE_RE.findall(s)
    if not amounts:
        return 0.0
    nums = [float(a.replace(",", "")) for a in amounts]
    if len(nums) == 1:
        return nums[0]
    low, high = nums[0], nums[1]
    if low < 50000:
        return (low + high) / 2.0
    return (low + high) / 2.0


def parse_file(path: Path) -> list[dict]:
    """Parse one quarterly compensation report TXT file."""
    rows = []
    current_firm = ""
    current_lobbyists = []
    branch = "legislative" if "Legislative" in path.name else "executive"

    with open(path, encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            rtype = (row.get("RECORD_TYPE") or "").strip()
            firm = (row.get("FIRM_NAME") or "").strip()
            year_str = (row.get("REPORT_YEAR") or "").strip()
            q_label = (row.get("REPORT_QUARTER") or "").strip()

            year = int(year_str) if year_str.isdigit() else 0
            quarter = QUARTER_MAP.get(q_label, 0)

            if rtype == "FIRM":
                current_firm = firm
                current_lobbyists = []
            elif rtype == "LOBBYIST":
                lob_name = (row.get("LOBBYIST_NAME") or "").strip()
                if lob_name:
                    current_lobbyists.append(lob_name)
            elif rtype == "PRINCIPAL":
                principal = (row.get("PRINCIPAL_NAME") or "").strip()
                comp_range = (row.get("PRINCIPAL_COMPENSATION_RANGE") or "").strip()
                comp_amount = parse_comp(comp_range)
                prime_firm = (row.get("PRIME_FIRM_NAME") or "").strip()

                for lob in (current_lobbyists or [""]):
                    rows.append({
                        "firm_name": current_firm,
                        "lobbyist_name": lob,
                        "principal_name": principal or prime_firm,
                        "comp_range": comp_range,
                        "comp_midpoint": comp_amount,
                        "quarter": quarter,
                        "year": year,
                        "branch": branch,
                    })
    return rows


def main() -> int:
    print("=== Script 88: Import Lobbyist Compensation Reports ===\n")

    files = sorted(DATA_DIR.glob("*.txt"))
    if not files:
        print(f"No files found in {DATA_DIR}. Run script 87 first.")
        return 1
    print(f"Found {len(files)} files in {DATA_DIR}")

    # Parse all files
    all_rows = []
    for f in files:
        rows = parse_file(f)
        all_rows.extend(rows)
        if rows:
            print(f"  {f.name:45s} {len(rows):>6,} rows")
    print(f"\nTotal rows: {len(all_rows):,}")

    # Load into Supabase
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("SET statement_timeout = 0")

    print("\nCreating lobbyist_comp_detail table...")
    cur.execute("DROP TABLE IF EXISTS lobbyist_comp_detail")
    cur.execute("""
        CREATE TABLE lobbyist_comp_detail (
            id              SERIAL PRIMARY KEY,
            firm_name       TEXT,
            lobbyist_name   TEXT,
            principal_name  TEXT NOT NULL,
            comp_range      TEXT,
            comp_midpoint   NUMERIC(12,2) DEFAULT 0,
            quarter         SMALLINT,
            year            SMALLINT,
            branch          TEXT
        )
    """)

    # COPY via StringIO
    buf = io.StringIO()
    for r in all_rows:
        vals = [
            r["firm_name"].replace("\t", " ").replace("\n", " "),
            r["lobbyist_name"].replace("\t", " ").replace("\n", " "),
            r["principal_name"].replace("\t", " ").replace("\n", " "),
            r["comp_range"].replace("\t", " "),
            str(r["comp_midpoint"]),
            str(r["quarter"]),
            str(r["year"]),
            r["branch"],
        ]
        buf.write("\t".join(vals) + "\n")
    buf.seek(0)

    cur.copy_expert(
        "COPY lobbyist_comp_detail (firm_name, lobbyist_name, principal_name, comp_range, comp_midpoint, quarter, year, branch) FROM STDIN",
        buf,
    )
    print(f"  Loaded {len(all_rows):,} rows")

    # Truncate garbage data (some FL files have corrupt multi-KB principal names)
    cur.execute("UPDATE lobbyist_comp_detail SET principal_name = LEFT(principal_name, 200) WHERE LENGTH(principal_name) > 200")
    if cur.rowcount:
        print(f"  Truncated {cur.rowcount} rows with oversized principal_name")

    # Indexes
    cur.execute("CREATE INDEX lcd_principal_idx ON lobbyist_comp_detail (principal_name)")
    cur.execute("CREATE INDEX lcd_lobbyist_idx ON lobbyist_comp_detail (lobbyist_name)")
    cur.execute("CREATE INDEX lcd_firm_idx ON lobbyist_comp_detail (firm_name)")
    cur.execute("CREATE INDEX lcd_year_q_idx ON lobbyist_comp_detail (year, quarter)")

    # Sanity checks
    cur.execute("""
        SELECT COUNT(*) as total,
               COUNT(DISTINCT firm_name) as firms,
               COUNT(DISTINCT lobbyist_name) as lobbyists,
               COUNT(DISTINCT principal_name) as principals,
               MIN(year) as min_year, MAX(year) as max_year,
               SUM(comp_midpoint) as total_comp
        FROM lobbyist_comp_detail
    """)
    row = cur.fetchone()
    print(f"\nSanity check:")
    print(f"  Total rows:     {row[0]:>10,}")
    print(f"  Unique firms:   {row[1]:>10,}")
    print(f"  Unique lobbyists: {row[2]:>8,}")
    print(f"  Unique principals: {row[3]:>7,}")
    print(f"  Year range:     {row[4]}–{row[5]}")
    print(f"  Total comp (midpoint): ${float(row[6] or 0):>14,.0f}")

    # Top principals by comp
    cur.execute("""
        SELECT principal_name, SUM(comp_midpoint) as total
        FROM lobbyist_comp_detail
        GROUP BY principal_name
        ORDER BY total DESC
        LIMIT 10
    """)
    print(f"\n  Top 10 principals by compensation:")
    for r in cur.fetchall():
        print(f"    {r[0][:50]:<50s} ${float(r[1]):>12,.0f}")

    conn.close()
    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
