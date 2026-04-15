# scripts/02b_discover_closed_committees.py
"""
Script 02b: Discover closed/revoked/terminated FL committees and scrape their
contributions.

The FL DoE bulk download (script 02) only exports currently-active committees.
Dissolved PACs — including major ones like Friends of Ron DeSantis (70275,
$228M) — fall off that export permanently. This script fills that gap.

Strategy:
  1. Sweep ComLkupByName.asp A–Z + 0–9 to find every committee ever registered
     (Active, Closed, Revoked, Terminated) → collects acct_num + metadata.
  2. Compare against data/processed/committees.csv (the active registry).
  3. For newly discovered acct_nums: fetch ComDetail.asp for full metadata,
     then scrape contributions via TreFin.exe (same CGI as script 03).
  4. Append new committees to committees.csv.
  5. Write contribution files to data/raw/contributions/ so script 01
     (import_finance) picks them up on its next run.

Resumable: tracks progress in data/raw/closed_committees_manifest.json.

Usage (from project root, with .venv activated):
    python scripts/02b_discover_closed_committees.py
    python scripts/02b_discover_closed_committees.py --force   # re-sweep everything
    python scripts/02b_discover_closed_committees.py --sweep-only  # discover, don't scrape
"""

import json
import re
import sys
import time
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).parent))
from config import (
    PROCESSED_DIR, FL_ENCODING,
    REQUEST_DELAY_SEC, REQUEST_TIMEOUT, MAX_RETRIES,
    CONTRIB_RAW,
)

SEARCH_URL   = "https://dos.elections.myflorida.com/committees/ComLkupByName.asp"
DETAIL_URL   = "https://dos.elections.myflorida.com/committees/ComDetail.asp"
CONTRIB_CGI  = "https://dos.elections.myflorida.com/cgi-bin/TreFin.exe"
MANIFEST     = CONTRIB_RAW / "closed_committees_manifest.json"

# Include these status values (case-insensitive match)
INACTIVE_STATUSES = {"closed", "revoked", "terminated"}

# Sweep characters: A–Z then 0–9
SWEEP_CHARS = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://dos.elections.myflorida.com/committees/",
}


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update(_HEADERS)
    return s


def _post(session, url, data, label="", max_retries=MAX_RETRIES):
    for attempt in range(1, max_retries + 1):
        try:
            resp = session.post(url, data=data, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            time.sleep(REQUEST_DELAY_SEC)
            return resp.text
        except requests.RequestException as e:
            print(f"    WARNING [{label}] attempt {attempt}/{max_retries}: {e}")
            if attempt == max_retries:
                raise
            time.sleep(REQUEST_DELAY_SEC * attempt)
    return ""


def _get(session, url, params=None, label="", max_retries=MAX_RETRIES):
    for attempt in range(1, max_retries + 1):
        try:
            resp = session.get(url, params=params, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            time.sleep(REQUEST_DELAY_SEC)
            return resp.text
        except requests.RequestException as e:
            print(f"    WARNING [{label}] attempt {attempt}/{max_retries}: {e}")
            if attempt == max_retries:
                raise
            time.sleep(REQUEST_DELAY_SEC * attempt)
    return ""


# ---------------------------------------------------------------------------
# Step 1: Sweep name search to collect all acct_nums
# ---------------------------------------------------------------------------

def _strip_tags(s: str) -> str:
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', s)).strip()


def search_committees_by_prefix(session, prefix: str) -> list[dict]:
    """
    POST to ComLkupByName.asp with a 1-char prefix (Starting With).
    Returns list of {acct_num, committee_name, type_desc, status}.
    """
    html = _post(
        session, SEARCH_URL,
        data={"ComName": prefix, "LkupTypeName": "L", "FormsButton1": "RUN QUERY"},
        label=f"sweep-{prefix}",
    )
    results = []

    # Split on <tr> boundaries to process each row independently
    rows = re.split(r'<tr[^>]*>', html, flags=re.IGNORECASE)
    for row in rows:
        # Must contain a ComDetail link
        acct_m = re.search(r'ComDetail\.asp\?account=(\d+)', row, re.IGNORECASE)
        if not acct_m:
            continue
        acct = acct_m.group(1).strip()

        # Extract committee name from the anchor text
        name_m = re.search(
            r'ComDetail\.asp\?account=' + re.escape(acct) + r'[^>]*>(.*?)</a',
            row, re.IGNORECASE | re.DOTALL,
        )
        name = _strip_tags(name_m.group(1)) if name_m else ""

        # Extract all <td> cells in the row (type and status are in cells 2 and 3)
        cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.IGNORECASE | re.DOTALL)
        type_desc = _strip_tags(cells[1]) if len(cells) > 1 else ""
        status    = _strip_tags(cells[2]) if len(cells) > 2 else ""

        if acct:
            results.append({
                "acct_num":       acct,
                "committee_name": name,
                "type_desc":      type_desc,
                "status":         status,
            })
    return results


def discover_all_committees(session, force: bool = False) -> dict[str, dict]:
    """
    Sweep A–Z + 0–9, collect every committee ever registered.
    Returns {acct_num: {committee_name, type_desc, status}}.
    """
    manifest = {}
    if MANIFEST.exists() and not force:
        manifest = json.loads(MANIFEST.read_text())

    swept = set(manifest.get("swept_chars", []))
    all_committees: dict[str, dict] = manifest.get("committees", {})

    for char in SWEEP_CHARS:
        if char in swept:
            continue
        print(f"  Sweeping '{char}'...", end=" ", flush=True)
        try:
            rows = search_committees_by_prefix(session, char)
            for r in rows:
                all_committees[r["acct_num"]] = r
            print(f"{len(rows)} found (total {len(all_committees):,})")
        except Exception as e:
            print(f"ERROR: {e}")
            continue
        swept.add(char)
        # Save progress after each character
        manifest = {
            "swept_chars": list(swept),
            "committees": all_committees,
        }
        MANIFEST.parent.mkdir(parents=True, exist_ok=True)
        MANIFEST.write_text(json.dumps(manifest))

    return all_committees


# ---------------------------------------------------------------------------
# Step 2: Fetch ComDetail.asp for full metadata
# ---------------------------------------------------------------------------

def fetch_committee_detail(session, acct_num: str) -> dict:
    """
    Fetch ComDetail.asp?account=NNNNN and extract committee metadata.
    Returns dict matching committees.csv column schema.
    """
    html = _get(session, DETAIL_URL, params={"account": acct_num}, label=f"detail-{acct_num}")

    def _extract(label_text: str) -> str:
        pattern = re.compile(
            re.escape(label_text) + r'</font>\s*</td>\s*<td[^>]*>\s*<font[^>]*>(.*?)</font',
            re.DOTALL | re.IGNORECASE,
        )
        m = pattern.search(html)
        if m:
            return re.sub(r'\s+', ' ', re.sub('<[^>]+>', '', m.group(1))).strip()
        return ""

    # Committee name is in an <h2> or prominent heading
    name_m = re.search(r'<h[23][^>]*>\s*(.*?)\s*</h[23]>', html, re.IGNORECASE | re.DOTALL)
    name = re.sub(r'\s+', ' ', re.sub('<[^>]+>', '', name_m.group(1))).strip() if name_m else ""

    type_text  = _extract("Type:")
    status     = _extract("Status:")
    address    = _extract("Address:")
    phone      = _extract("Phone:")
    chair      = _extract("Chairperson:")
    treasurer  = _extract("Treasurer:")

    # Map type text → type_code
    type_map = {
        "Political Committee": "PAC",
        "Independent Expenditures Organization": "IXO",
        "Electioneering Communications Organization": "ECO",
        "Party Executive Committee": "PTY",
    }
    type_code = type_map.get(type_text, "PAC")

    # Split chairperson name into parts
    chair_parts = chair.split() if chair and chair != "\xa0" else []
    chair_first = chair_parts[0] if len(chair_parts) > 1 else ""
    chair_last  = " ".join(chair_parts[1:]) if len(chair_parts) > 1 else chair_parts[0] if chair_parts else ""

    return {
        "acct_num":        acct_num,
        "committee_name":  name,
        "type_code":       type_code,
        "type_desc":       type_text,
        "addr1":           address,
        "addr2":           "",
        "city":            "",
        "state":           "FL",
        "zip":             "",
        "county":          "",
        "phone":           phone,
        "chair_last":      chair_last,
        "chair_first":     chair_first,
        "chair_middle":    "",
        "treasurer_last":  "",
        "treasurer_first": "",
        "treasurer_middle": "",
        "status":          status,
    }


# ---------------------------------------------------------------------------
# Step 3: Scrape contributions via TreFin.exe
# ---------------------------------------------------------------------------

def scrape_contributions(session, acct_num: str, committee_name: str) -> int:
    """
    Download all contribution rows for acct_num from TreFin.exe.
    Writes data/raw/contributions/Contrib_{acct_num}.txt.
    Returns row count (excluding header).
    """
    out_path = CONTRIB_RAW / f"Contrib_{acct_num}.txt"
    if out_path.exists() and out_path.stat().st_size > 100:
        print(f"    {acct_num}: already scraped, skipping")
        return 0

    params_template = {
        "account":      acct_num,
        "comname":      committee_name[:50],
        "CanCom":       "Comm",
        "seqnum":       "0",
        "queryfor":     "1",
        "queryorder":   "DAT",
        "queryoutput":  "2",
        "query":        "Submit Query Now",
    }

    all_rows: list[str] = []
    header: str | None = None
    page_size = 50  # TreFin.exe default
    seqnum = 0
    page = 0

    while True:
        params = dict(params_template)
        params["seqnum"] = str(seqnum)
        try:
            text = _post(session, CONTRIB_CGI, data=params, label=f"contribs-{acct_num}-p{page}")
        except Exception as e:
            print(f"    {acct_num}: fetch error at seqnum={seqnum}: {e}")
            break

        lines = text.strip().splitlines()
        if not lines:
            break

        if header is None:
            header = lines[0]
            data_lines = lines[1:]
        else:
            # Skip header on subsequent pages
            data_lines = lines[1:] if lines[0] == header else lines

        if not data_lines:
            break

        all_rows.extend(data_lines)
        if len(data_lines) < page_size:
            break  # Last page

        seqnum += page_size
        page += 1

    if header and all_rows:
        out_path.write_text(
            header + "\n" + "\n".join(all_rows) + "\n",
            encoding=FL_ENCODING,
            errors="replace",
        )
        return len(all_rows)
    elif header:
        # Committee exists but has no contributions — write header-only file
        out_path.write_text(header + "\n", encoding=FL_ENCODING, errors="replace")
        return 0

    return 0


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(force: bool = False, sweep_only: bool = False) -> int:
    print("=== Script 02b: Discover Closed Committees ===\n")

    session = _session()

    # Load current active registry
    committees_csv = PROCESSED_DIR / "committees.csv"
    if not committees_csv.exists():
        print("ERROR: committees.csv not found. Run 05_import_registry.py first.", file=sys.stderr)
        return 1

    existing = pd.read_csv(committees_csv, dtype=str)
    existing_accts = set(existing["acct_num"].dropna().str.strip())
    print(f"Active registry committees: {len(existing_accts):,}")

    # Already-scraped contribution files
    scraped_accts = {
        p.stem.replace("Contrib_", "")
        for p in CONTRIB_RAW.glob("Contrib_*.txt")
    }
    print(f"Contribution files on disk: {len(scraped_accts):,}")

    # Step 1: Discover all committees
    print("\n[Step 1] Sweeping ComLkupByName.asp A–Z + 0–9 ...")
    if force and MANIFEST.exists():
        MANIFEST.unlink()
    all_committees = discover_all_committees(session, force=force)
    all_accts = set(all_committees.keys())
    print(f"\nTotal committees discovered (all statuses): {len(all_accts):,}")

    # Find newly discovered (not in active registry)
    new_accts = all_accts - existing_accts
    inactive_new = {
        a for a in new_accts
        if all_committees[a].get("status", "").lower() in INACTIVE_STATUSES
    }
    active_new = new_accts - inactive_new

    print(f"  New (not in active registry): {len(new_accts):,}")
    print(f"    Inactive/Closed/Revoked:  {len(inactive_new):,}")
    print(f"    Active (new since last run): {len(active_new):,}")

    if sweep_only:
        print("\n--sweep-only: stopping before contribution scrape.")
        return 0

    # Step 2: Fetch ComDetail for inactive committees not already in registry
    to_detail = inactive_new - existing_accts
    print(f"\n[Step 2] Fetching ComDetail for {len(to_detail):,} new inactive committees ...")
    new_rows: list[dict] = []
    for i, acct in enumerate(sorted(to_detail, key=int), 1):
        if i % 50 == 0:
            print(f"  {i}/{len(to_detail)} ...", flush=True)
        try:
            detail = fetch_committee_detail(session, acct)
            new_rows.append(detail)
        except Exception as e:
            print(f"  WARNING: ComDetail failed for {acct}: {e}")
            # Use search data as fallback
            row = dict(all_committees[acct])
            row.setdefault("type_code", "PAC")
            new_rows.append(row)

    if new_rows:
        new_df = pd.DataFrame(new_rows)
        # Align columns to existing
        for col in existing.columns:
            if col not in new_df.columns:
                new_df[col] = ""
        new_df = new_df[existing.columns]
        merged = pd.concat([existing, new_df], ignore_index=True)
        merged = merged.drop_duplicates(subset=["acct_num"])
        merged.to_csv(committees_csv, index=False)
        print(f"  Appended {len(new_rows):,} rows → committees.csv ({len(merged):,} total)")

    # Step 3: Scrape contributions for newly discovered inactive committees
    to_scrape = inactive_new - scraped_accts
    print(f"\n[Step 3] Scraping contributions for {len(to_scrape):,} inactive committees ...")
    total_rows = 0
    for i, acct in enumerate(sorted(to_scrape, key=int), 1):
        name = all_committees.get(acct, {}).get("committee_name", "")
        print(f"  [{i}/{len(to_scrape)}] {acct} — {name[:50]}", flush=True)
        try:
            n = scrape_contributions(session, acct, name)
            print(f"    → {n:,} rows")
            total_rows += n
        except Exception as e:
            print(f"    ERROR: {e}")

    print(f"\nDone.")
    print(f"  New committees added to registry: {len(new_rows):,}")
    print(f"  Contribution files written: {len(to_scrape):,}")
    print(f"  Total contribution rows downloaded: {total_rows:,}")
    print()
    print("Next steps:")
    print("  Run script 01 (import_finance) to parse new Contrib_*.txt files into contributions.csv")
    print("  Then re-run script 09 (dedup) and downstream pipeline.")
    return 0


if __name__ == "__main__":
    force      = "--force" in sys.argv
    sweep_only = "--sweep-only" in sys.argv
    sys.exit(main(force=force, sweep_only=sweep_only))
