"""
Script 14c: Parse FL lobbyist registration PDFs into structured rows.

Reads the 4 PDFs fetched by script 14b (current-year Lobbyist_{LEG,EXE}.pdf +
Principl_{LEG,EXE}.pdf) and emits one row per (lobbyist, principal) pair with
the fields that comp TXT does NOT carry:
  - lobbyist_phone, lobbyist_addr
  - principal NAICS industry_code
  - per-pair effective_date
  - chamber scope (subset of House/Senate/PSCNC; empty = all three)

Output: data/processed/lobbyist_registrations.csv

Approach: crop each page into LEFT + RIGHT columns (text PDFs, no tables),
concatenate into a single stream per PDF, then state-machine over lines.
Each principal block anchors on "Industry Code: NNNNNN" — we walk backward
for name+address and forward for chamber scope + effective date. The Lobbyist
PDF groups principals under a lobbyist header; we only parse the Lobbyist PDFs
since they carry the lobbyist↔principal edges we need. The Principl_*.pdf is
the inverse index (same data, different grouping) — skipped.
"""

import csv
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw" / "lobbyist_registrations"
OUT_PATH = ROOT / "data" / "processed" / "lobbyist_registrations.csv"

# Lobbyist header:  "Lastname, First M.  ..........  (850) 321-7642"
RE_LOB_HEADER = re.compile(
    r"^(?P<name>[A-Z][A-Za-z'\-\.\s,\"]+?)\s*\.{3,}\s*(?P<phone>\(?\d{3}\)?\s*[-\s]?\d{3}[-\s]?\d{4})\s*$"
)
RE_INDUSTRY = re.compile(r"^Industry Code:\s*(\d{4,6})\s*$")
RE_EFFECTIVE = re.compile(r"^Effective:\s*(\d{2}/\d{2}/\d{4})\s*$")
RE_CHAMBER = re.compile(r"^\((House|Senate|PSCNC)(?:,\s*(House|Senate|PSCNC))*(?:,\s*(House|Senate|PSCNC))?\)\s*$")
RE_PAGE_HEADER = re.compile(r"FLORIDA (LEGISLATURE|EXECUTIVE)")

SECTION_PRINCIPALS = "Principal(s):"
SECTION_FIRMS = "Lobbying Firm(s):"


def extract_stream(pdf_path: Path) -> list[str]:
    """Return a flat list of non-empty text lines from left+right column crops of every page."""
    lines: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            mid = page.width / 2
            left = page.within_bbox((0, 0, mid, page.height)).extract_text() or ""
            right = page.within_bbox((mid, 0, page.width, page.height)).extract_text() or ""
            for raw in (left + "\n" + right).splitlines():
                s = raw.strip()
                if not s:
                    continue
                if RE_PAGE_HEADER.search(s):
                    continue
                if s.startswith("• Lobbyists") or s.startswith("the entity"):
                    continue
                if re.match(r"^\d{2}/\d{2}/\d{2}$", s) or re.match(r"^\d{2}:\d{2}:\d{2}$", s):
                    continue
                lines.append(s)
    return lines


def parse_stream(lines: list[str], branch: str, year: int, source_url: str) -> list[dict]:
    """State-machine parse — each lobbyist block contains a Principal(s) section with
    N principal sub-blocks anchored on Industry Code."""
    rows: list[dict] = []
    i = 0
    n = len(lines)

    current_lob = None  # dict(name, phone, addr_parts)
    in_principals = False

    while i < n:
        line = lines[i]
        m_lob = RE_LOB_HEADER.match(line)
        if m_lob:
            name = m_lob.group("name").rstrip(" .")
            phone = m_lob.group("phone")
            addr_parts = []
            j = i + 1
            while j < n and not RE_LOB_HEADER.match(lines[j]) and lines[j] not in (SECTION_FIRMS, SECTION_PRINCIPALS):
                addr_parts.append(lines[j])
                j += 1
            current_lob = {"name": name, "phone": phone, "addr": ", ".join(addr_parts)}
            in_principals = False
            i = j
            continue

        if line == SECTION_PRINCIPALS:
            in_principals = True
            i += 1
            continue

        if line == SECTION_FIRMS:
            in_principals = False
            i += 1
            continue

        m_ind = RE_INDUSTRY.match(line)
        if m_ind and in_principals and current_lob:
            industry_code = m_ind.group(1)

            # Walk backward: address lines (until we hit a line that starts a principal
            # name). Principal name is the first non-address line above the Industry Code.
            # We'll collect everything from the last sentinel (Principal(s): header or
            # previous Effective:) until industry code.
            back_lines = []
            k = i - 1
            while k >= 0:
                prev = lines[k]
                if prev == SECTION_PRINCIPALS:
                    break
                if RE_EFFECTIVE.match(prev):
                    break
                if RE_LOB_HEADER.match(prev):
                    break
                back_lines.append(prev)
                k -= 1
            back_lines.reverse()
            if not back_lines:
                i += 1
                continue
            principal_name = back_lines[0]
            principal_addr = ", ".join(back_lines[1:]) if len(back_lines) > 1 else ""

            # Walk forward for chamber + effective
            chamber = []
            effective = None
            k = i + 1
            while k < n and k < i + 4:
                nxt = lines[k]
                m_eff = RE_EFFECTIVE.match(nxt)
                m_ch = RE_CHAMBER.match(nxt)
                if m_eff:
                    try:
                        effective = datetime.strptime(m_eff.group(1), "%m/%d/%Y").date().isoformat()
                    except ValueError:
                        pass
                    k += 1
                    break
                if m_ch:
                    chamber = re.findall(r"House|Senate|PSCNC", nxt)
                k += 1

            rows.append({
                "year": year,
                "branch": branch,
                "lobbyist_name": current_lob["name"],
                "lobbyist_phone": current_lob["phone"],
                "lobbyist_addr": current_lob["addr"],
                "principal_name": principal_name,
                "principal_addr": principal_addr,
                "industry_code": industry_code,
                "chamber_scope": "|".join(chamber),
                "effective_date": effective or "",
                "source_url": source_url,
            })
            i = k
            continue

        i += 1

    return rows


BASE_URL = "https://floridalobbyist.gov/reports"


def main() -> int:
    year = datetime.now(timezone.utc).year
    year_dir = RAW_DIR / str(year)

    sources = [
        ("legislative", year_dir / f"Lobbyist_LEG_{year}.pdf"),
        ("executive",   year_dir / f"Lobbyist_EXE_{year}.pdf"),
    ]

    all_rows: list[dict] = []
    for branch, path in sources:
        if not path.exists():
            print(f"  SKIP {path.name} (not downloaded)")
            continue
        print(f"=== Parsing {path.name} ({branch}) ===")
        lines = extract_stream(path)
        print(f"  {len(lines):,} lines extracted")
        rows = parse_stream(lines, branch, year, f"{BASE_URL}/{path.name}")
        print(f"  {len(rows):,} (lobbyist, principal) pairs")
        all_rows.extend(rows)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=[
            "year", "branch", "lobbyist_name", "lobbyist_phone", "lobbyist_addr",
            "principal_name", "principal_addr", "industry_code", "chamber_scope",
            "effective_date", "source_url",
        ])
        w.writeheader()
        w.writerows(all_rows)

    print(f"\nWrote {len(all_rows):,} rows → {OUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
