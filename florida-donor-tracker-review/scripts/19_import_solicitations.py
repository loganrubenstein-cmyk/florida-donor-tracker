# scripts/19_import_solicitations.py
"""
Script 19: Import FL DS-DE-102 Statement of Solicitation filings.

FL candidates who raise money through Political Committees (PCs) file a
Statement of Solicitation (DS-DE-102) with the Division of Elections.
This script scrapes those filings from the DOE PublicSolicitations database,
matches solicitors to candidates and organizations to committees, and appends
link_type="solicitation" rows to candidate_pc_links.csv.

Sources
-------
  https://doesecure.dos.state.fl.us/PublicSolicitations/
  HTML search results (one POST, all 1,300+ records, no pagination).

Outputs
-------
  data/raw/solicitations/solicitations.csv
      Raw scraped data: solicitor_name, office, received_date, form_type,
      organization, last_name, first_name

  data/processed/candidate_pc_links.csv
      Appended with link_type="solicitation" rows

  public/data/candidate_pc_links.json
      Rebuilt with solicitation links included

Usage (from project root, with .venv activated):
    python scripts/19_import_solicitations.py
    python scripts/19_import_solicitations.py --force
"""

import json
import re
import sys
from pathlib import Path

import pandas as pd
import requests
from bs4 import BeautifulSoup
from rapidfuzz import fuzz

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR

SOLICITATIONS_DIR = Path(__file__).resolve().parent.parent / "data" / "raw" / "solicitations"
RAW_CSV          = SOLICITATIONS_DIR / "solicitations.csv"
LINKS_CSV        = PROCESSED_DIR / "candidate_pc_links.csv"
OUTPUT_JSON      = Path(__file__).resolve().parent.parent / "public" / "data" / "candidate_pc_links.json"

SEARCH_URL       = "https://doesecure.dos.state.fl.us/PublicSolicitations/"
ORG_FUZZY_THRESHOLD = 85   # token_sort_ratio for org name → committee name
CAND_FUZZY_THRESHOLD = 88  # token_sort_ratio for solicitor name → candidate name

_PUNCT = re.compile(r"[^A-Z0-9\s]")


def clean(name: str) -> str:
    upper = str(name).upper()
    return " ".join(_PUNCT.sub("", upper).split())


# ── Scraping ─────────────────────────────────────────────────────────────────

def scrape_solicitations() -> pd.DataFrame:
    """POST a blank search to get all solicitation records."""
    session = requests.Session()
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
    })

    print("  GET search page for ViewState ...", flush=True)
    r0 = session.get(SEARCH_URL, timeout=20)
    r0.raise_for_status()
    soup0 = BeautifulSoup(r0.text, "html.parser")
    hidden = {
        inp["name"]: inp.get("value", "")
        for inp in soup0.find_all("input", type="hidden")
    }

    print("  POST blank solicitor search ...", flush=True)
    payload = {
        **hidden,
        "ctl00$MainContent$txtSolicitorName": "",
        "ctl00$MainContent$ddlSolOffice": "",
        "ctl00$MainContent$btnSolSearch": "Search",
    }
    r1 = session.post(SEARCH_URL, data=payload, timeout=60)
    r1.raise_for_status()

    soup1 = BeautifulSoup(r1.text, "html.parser")
    tables = soup1.find_all("table")
    # Table index 2 is the results grid (indices 0=search form, 1=count, 2=data)
    if len(tables) < 3:
        print(f"ERROR: Expected ≥3 tables, got {len(tables)}", file=sys.stderr)
        return pd.DataFrame()

    data_table = tables[2]
    rows = data_table.find_all("tr")

    records = []
    for row in rows[1:]:
        cells = row.find_all("td")
        if len(cells) < 5:
            continue
        records.append({
            "solicitor_name": cells[0].get_text(strip=True),
            "office":         cells[1].get_text(strip=True),
            "received_date":  cells[2].get_text(strip=True),
            "form_type":      cells[3].get_text(strip=True),
            "organization":   cells[4].get_text(strip=True),
        })

    df = pd.DataFrame(records)
    if df.empty:
        return df

    # Parse solicitor_name "Last, First" → last_name / first_name
    def split_name(s: str):
        parts = str(s).split(",", 1)
        return parts[0].strip(), parts[1].strip() if len(parts) > 1 else ""

    df[["last_name", "first_name"]] = pd.DataFrame(
        df["solicitor_name"].apply(split_name).tolist()
    )
    df["received_date"] = pd.to_datetime(df["received_date"], errors="coerce").dt.strftime("%Y-%m-%d")
    return df


# ── Active-solicitation logic ────────────────────────────────────────────────

def active_solicitations(df: pd.DataFrame) -> pd.DataFrame:
    """
    Return one row per (solicitor, organization) pair that has an active
    solicitation — i.e., the most recent filing is NOT a Withdrawal.
    """
    df = df.copy()
    df["received_dt"] = pd.to_datetime(df["received_date"], errors="coerce")
    df = df.sort_values("received_dt")

    # For each (solicitor_name, organization), keep only the latest form_type
    latest = (
        df.groupby(["solicitor_name", "organization"], as_index=False)
        .last()
    )
    active = latest[latest["form_type"] != "Solicitation Withdrawal"].copy()
    return active.reset_index(drop=True)


# ── Candidate matching ────────────────────────────────────────────────────────

def build_candidate_index(cand_df: pd.DataFrame) -> dict:
    """
    Returns dict: last_initial → list of candidate row dicts.
    """
    index: dict[str, list] = {}
    for _, row in cand_df.iterrows():
        init = str(row["last_name"]).strip().upper()[:1]
        if init:
            index.setdefault(init, []).append(row.to_dict())
    return index


def match_candidate(
    last: str, first: str, cand_index: dict
) -> dict | None:
    """
    Exact then fuzzy match (blocked by last initial).
    Returns candidate row dict or None.
    """
    last_c  = clean(last)
    first_c = clean(first)
    full_c  = f"{first_c} {last_c}".strip()
    init    = last_c[:1]
    if not init:
        return None

    best_score = 0
    best_cand  = None
    for cand in cand_index.get(init, []):
        cand_full = clean(cand["candidate_name"])
        score = fuzz.token_sort_ratio(full_c, cand_full)
        if score >= CAND_FUZZY_THRESHOLD and score > best_score:
            best_score = score
            best_cand  = cand

    return best_cand


# ── Committee matching ────────────────────────────────────────────────────────

def build_committee_index(com_df: pd.DataFrame) -> dict:
    """
    Returns dict: first_word → list of committee row dicts.
    Blocking key is first non-stopword of committee_name.
    """
    _STOP = {"for", "of", "the", "a", "an", "and", "in", "to", "florida", "committee"}
    index: dict[str, list] = {}
    for _, row in com_df.iterrows():
        words = clean(str(row["committee_name"])).split()
        key = next((w for w in words if w.lower() not in _STOP), words[0] if words else "")
        if key:
            index.setdefault(key, []).append(row.to_dict())
    return index


def match_committee(org_name: str, com_df: pd.DataFrame) -> dict | None:
    """
    Best-score fuzzy match of org_name against all committee_names.
    Scans all committees (small dataset, 1,888 rows, fast enough).
    """
    org_c = clean(org_name)
    if not org_c:
        return None

    best_score = 0
    best_com   = None
    for _, row in com_df.iterrows():
        score = fuzz.token_sort_ratio(org_c, clean(str(row["committee_name"])))
        if score >= ORG_FUZZY_THRESHOLD and score > best_score:
            best_score = score
            best_com   = row.to_dict()

    return best_com


# ── Main ──────────────────────────────────────────────────────────────────────

def main(force: bool = False) -> int:
    print("=== Script 19: Import Statements of Solicitation ===\n")

    # ── Step 1: scrape (or reload raw CSV) ────────────────────────────────────
    SOLICITATIONS_DIR.mkdir(parents=True, exist_ok=True)

    if RAW_CSV.exists() and not force:
        print(f"Loading cached raw data from {RAW_CSV.name} ...", flush=True)
        sol_df = pd.read_csv(RAW_CSV, dtype=str).fillna("")
    else:
        print("Scraping PublicSolicitations ...", flush=True)
        sol_df = scrape_solicitations()
        if sol_df.empty:
            print("ERROR: No solicitation records scraped.", file=sys.stderr)
            return 1
        sol_df.to_csv(RAW_CSV, index=False)
        print(f"  Saved {len(sol_df):,} rows to {RAW_CSV.name}")

    print(f"  {len(sol_df):,} total solicitation rows")

    # ── Step 2: filter to active (non-withdrawn) ───────────────────────────────
    active = active_solicitations(sol_df)
    print(f"  {len(active):,} active (non-withdrawn) solicitor→org pairs\n")

    # ── Step 3: load existing links (from script 18) ───────────────────────────
    if not LINKS_CSV.exists():
        print(f"ERROR: {LINKS_CSV.name} not found. Run 18_link_candidates_to_pcs.py first.",
              file=sys.stderr)
        return 1

    existing_df = pd.read_csv(LINKS_CSV, dtype=str).fillna("")
    existing_pairs = set(
        zip(existing_df["candidate_acct"], existing_df["pc_acct"])
    )
    print(f"Existing links from script 18: {len(existing_df):,}")

    # ── Step 4: load candidates and committees ────────────────────────────────
    cand_path = PROCESSED_DIR / "candidates.csv"
    com_path  = PROCESSED_DIR / "committees.csv"
    for p in (cand_path, com_path):
        if not p.exists():
            print(f"ERROR: {p} not found.", file=sys.stderr)
            return 1

    cand_raw = pd.read_csv(cand_path, dtype=str).fillna("")
    cand_raw["candidate_name"] = (
        cand_raw["first_name"].str.strip() + " " + cand_raw["last_name"].str.strip()
    ).str.strip()
    cand_raw = cand_raw.rename(columns={"acct_num": "candidate_acct"})

    com_df = pd.read_csv(com_path, dtype=str).fillna("")

    cand_index = build_candidate_index(cand_raw)
    print(f"Candidates loaded: {len(cand_raw):,}")
    print(f"Committees loaded: {len(com_df):,}\n")

    # ── Step 5: match each active solicitation ────────────────────────────────
    print("Matching solicitations to candidates and committees ...", flush=True)
    new_rows = []
    no_cand = 0
    no_com  = 0
    already = 0

    for _, row in active.iterrows():
        cand = match_candidate(row["last_name"], row["first_name"], cand_index)
        if cand is None:
            no_cand += 1
            continue

        com = match_committee(row["organization"], com_df)
        if com is None:
            no_com += 1
            continue

        pair = (str(cand["candidate_acct"]), str(com["acct_num"]))
        if pair in existing_pairs:
            already += 1
            continue

        new_rows.append({
            "candidate_name": cand["candidate_name"],
            "candidate_acct": cand["candidate_acct"],
            "pc_acct":        com["acct_num"],
            "pc_name":        com["committee_name"],
            "pc_type":        com.get("type_code", ""),
            "link_type":      "solicitation",
            "confidence":     1.0,
        })
        existing_pairs.add(pair)

    print(f"  Matched:             {len(new_rows):,} new links")
    print(f"  No candidate match:  {no_cand:,}")
    print(f"  No committee match:  {no_com:,}")
    print(f"  Already in links:    {already:,}\n")

    if not new_rows:
        print("No new solicitation links to add.")
        return 0

    # ── Step 6: merge and write ────────────────────────────────────────────────
    new_df   = pd.DataFrame(new_rows)
    merged   = pd.concat([existing_df, new_df], ignore_index=True).drop_duplicates(
        subset=["candidate_acct", "pc_acct", "link_type"]
    ).sort_values(["candidate_name", "confidence"], ascending=[True, False])

    merged.to_csv(LINKS_CSV, index=False)
    print(f"Wrote {len(merged):,} total links to {LINKS_CSV.name}")

    # ── Step 7: rebuild JSON ───────────────────────────────────────────────────
    grouped: dict = {}
    for _, r in merged.iterrows():
        acct = str(r["candidate_acct"])
        grouped.setdefault(acct, []).append({
            "pc_acct":    r["pc_acct"],
            "pc_name":    r["pc_name"],
            "pc_type":    r["pc_type"],
            "link_type":  r["link_type"],
            "confidence": float(r["confidence"]),
        })

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(json.dumps(grouped, indent=2))
    print(f"Rebuilt {len(grouped):,} candidates in {OUTPUT_JSON.name}")

    print("\n=== SUMMARY ===")
    print(f"Total links:          {len(merged):,}")
    print(f"  From script 18:     {len(existing_df):,}")
    print(f"  New (solicitation): {len(new_rows):,}")
    print(f"Unique candidates:    {merged['candidate_acct'].nunique():,}")
    print(f"Unique PCs:           {merged['pc_acct'].nunique():,}")

    print("\nSample new solicitation links:")
    for _, r in new_df.head(8).iterrows():
        print(f"  {r['candidate_name']:<28s} → {r['pc_name'][:38]:<38s}  [solicitation]")

    return 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(main(force=force))
