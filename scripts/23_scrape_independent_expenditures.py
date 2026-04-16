"""
Script 23: Scrape FL Independent Expenditures (IEs) from the FL Division of Elections.

Independent Expenditures are campaign spending by outside committees ON BEHALF OF
or AGAINST a candidate — without coordination with that candidate's campaign. They
are high-value data: large corporate PACs spending millions to elect or defeat
candidates without appearing directly in donation records.

Source: FL Division of Elections — IE search
  https://dos.elections.myflorida.com/independentexpenditures/

The IE page POSTs to:
  https://dos.elections.myflorida.com/cgi-bin/IEx.exe
  (same CGI family as TreFin.exe but for IE filings)

Parameters discovered via browser inspection:
  account     — committee account number (blank = all)
  candname    — candidate name (blank = all)
  CanCom      — "Can" or "Comm"
  daterange   — "1" for date range, "0" for all
  fromdate    — MMDDYYYY
  todate      — MMDDYYYY
  queryoutput — "2" for tab-delimited

Strategy: search ALL IEs by pulling each election year in a date window.
One request per year covers all committees + candidates for that year.
Typically 20,000–100,000 rows per cycle year.

Outputs:
  data/raw/ie/           — cached raw TSV responses per year
  data/processed/independent_expenditures.csv  — combined processed data
  Supabase: independent_expenditures table

Usage:
  python scripts/23_scrape_independent_expenditures.py
  python scripts/23_scrape_independent_expenditures.py --force     # re-scrape cached years
  python scripts/23_scrape_independent_expenditures.py --year 2024 # single year
  python scripts/23_scrape_independent_expenditures.py --dry-run   # no DB writes
"""

import io
import json
import os
import re
import sys
import time
from datetime import date
from pathlib import Path

import pandas as pd
import psycopg2
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from psycopg2.extras import execute_values

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR, RAW_DIR, PROJECT_ROOT, REQUEST_DELAY_SEC, FL_ENCODING

load_dotenv(PROJECT_ROOT / ".env.local")
DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set in .env.local")

IE_RAW_DIR  = RAW_DIR / "ie"
IE_CSV_OUT  = PROCESSED_DIR / "independent_expenditures.csv"
BATCH_SIZE  = 2000

# FL DoE Expenditure CGI — confirmed via browser inspection of:
#   https://dos.elections.myflorida.com/campaign-finance/expenditures/
# IEs are expenditures where purpose contains "INDEPENDENT" or filed by ECO committees.
# Two passes: (1) cpurpose=independent across all elections, (2) committee type=ECO
# expend.exe returns 502 (broken since 2026-04-13 per project notes).
# Strategy: fetch ECO committee accounts from extractComList.asp, then pull
# expenditures per-committee via TreFin.exe queryfor=2 (which works).
EXPEND_CGI   = "https://dos.elections.myflorida.com/cgi-bin/expend.exe"
TREEFIN_CGI  = "https://dos.elections.myflorida.com/cgi-bin/TreFin.exe"
SEL_URL      = "https://dos.elections.myflorida.com/cgi-bin/TreSel.exe"
COM_LIST_URL = "https://dos.elections.myflorida.com/committees/extractComList.asp"

# Election IDs covering major FL cycles (general elections only)
IE_ELECTIONS = [
    "20241105-GEN", "20221108-GEN", "20201103-GEN",
    "20181106-GEN", "20161108-GEN", "20141104-GEN",
    "20121106-GEN", "20101102-GEN",
]

# Column names expected in the TSV output (probe + map if needed)
# Typical FL DoE IE TSV headers (discovered via browser):
# CommitteeID, CommitteeName, CandidateName, SupportOppose, Amount, Date, Purpose, Cycle
EXPECTED_COLS = {
    "committee_id":   ["CommitteeID", "Comm ID", "Account", "account"],
    "committee_name": ["CommitteeName", "Committee Name", "committee"],
    "candidate_name": ["CandidateName", "Candidate Name", "candidate"],
    "support_oppose": ["SupportOppose", "Support/Oppose", "For/Against", "stance"],
    "amount":         ["Amount", "Expenditure Amount", "Total"],
    "expend_date":    ["Date", "Expenditure Date"],
    "purpose":        ["Purpose", "Description", "Expend Purpose"],
    "office":         ["Office", "Office Sought"],
    "cycle":          ["Cycle", "Election Year", "ElectionYear"],
}


# ── Schema ────────────────────────────────────────────────────────────────────

CREATE_IE_TABLE = """
CREATE TABLE IF NOT EXISTS independent_expenditures (
    id              SERIAL PRIMARY KEY,
    committee_id    TEXT,
    committee_name  TEXT,
    candidate_name  TEXT,
    candidate_slug  TEXT,
    support_oppose  TEXT,   -- 'S' = support, 'O' = oppose
    amount          NUMERIC(14,2),
    expend_date     DATE,
    purpose         TEXT,
    office          TEXT,
    cycle           INTEGER,
    raw_year        INTEGER,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ie_committee  ON independent_expenditures(committee_id);
CREATE INDEX IF NOT EXISTS idx_ie_candidate  ON independent_expenditures(candidate_slug);
CREATE INDEX IF NOT EXISTS idx_ie_cycle      ON independent_expenditures(cycle);
CREATE INDEX IF NOT EXISTS idx_ie_amount     ON independent_expenditures(amount DESC);
"""

UPSERT_IE = """
INSERT INTO independent_expenditures
    (committee_id, committee_name, candidate_name, candidate_slug,
     support_oppose, amount, expend_date, purpose, office, cycle, raw_year)
VALUES %s
ON CONFLICT DO NOTHING
"""


# ── Helpers ───────────────────────────────────────────────────────────────────

def slugify(name: str) -> str:
    s = str(name).lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"\s+", "-", s.strip())
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:120]


def map_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Remap whatever column names the CGI returns to our canonical names."""
    rename = {}
    cols_lower = {c.lower(): c for c in df.columns}
    for canonical, variants in EXPECTED_COLS.items():
        for v in variants:
            if v in df.columns:
                rename[v] = canonical
                break
            if v.lower() in cols_lower:
                rename[cols_lower[v.lower()]] = canonical
                break
    return df.rename(columns=rename)


def parse_amount(val) -> float:
    try:
        return float(str(val).replace("$", "").replace(",", "").strip() or 0)
    except ValueError:
        return 0.0


def parse_date(val) -> date | None:
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m%d%Y", "%m-%d-%Y"):
        try:
            from datetime import datetime
            return datetime.strptime(str(val).strip(), fmt).date()
        except (ValueError, TypeError):
            pass
    return None


# ── Scraper ───────────────────────────────────────────────────────────────────

def warmup_session(session: requests.Session) -> bool:
    """Hit TreSel.exe to establish a session cookie — same as TreFin scripts."""
    try:
        r = session.get(SEL_URL, timeout=20)
        return r.status_code == 200
    except requests.RequestException:
        return False


def fetch_eco_accounts(session: requests.Session, election_id: str) -> list[tuple[str, str]]:
    """
    Fetch all ECO (Electioneering Communications Org) committee accounts for a given election.
    Returns list of (acct_num, committee_name).
    """
    params = {
        "election":    election_id,
        "comtype":     "ECO",
        "comstatus":   "A",
        "office":      "All",
        "queryformat": "2",
    }
    try:
        r = session.post(COM_LIST_URL, data=params, timeout=30)
        if r.status_code != 200:
            print(f"  ECO list: HTTP {r.status_code}")
            return []
        text = r.content.decode(FL_ENCODING, errors="replace")
        df = pd.read_csv(io.StringIO(text), sep="\t", dtype=str).fillna("")
        # Also fetch inactive ECOs (may have historical data)
        params["comstatus"] = "I"
        r2 = session.post(COM_LIST_URL, data=params, timeout=30)
        if r2.status_code == 200:
            text2 = r2.content.decode(FL_ENCODING, errors="replace")
            df2 = pd.read_csv(io.StringIO(text2), sep="\t", dtype=str).fillna("")
            df = pd.concat([df, df2], ignore_index=True)

        acct_col = next((c for c in df.columns if "acct" in c.lower()), df.columns[0])
        name_col = next((c for c in df.columns if "name" in c.lower()), df.columns[1])
        rows = [(str(r[acct_col]).strip(), str(r[name_col]).strip())
                for _, r in df.iterrows()
                if str(r[acct_col]).strip().isdigit()]
        # Deduplicate
        seen = {}
        for acct, name in rows:
            seen[acct] = name
        return list(seen.items())
    except Exception as e:
        print(f"  ECO list error: {e}")
        return []


def scrape_committee_expenditures(session: requests.Session, acct: str, name: str,
                                  force: bool = False) -> pd.DataFrame | None:
    """
    Pull all expenditures for a single committee via TreFin queryfor=2.
    Returns a DataFrame or None.
    """
    cache_path = IE_RAW_DIR / f"eco_{acct}.tsv"
    if cache_path.exists() and not force:
        try:
            return pd.read_csv(cache_path, sep="\t", dtype=str, encoding=FL_ENCODING).fillna("")
        except Exception:
            pass

    all_rows = []
    seqnum = 0
    page = 1
    params = {
        "account":     acct,
        "canname":     name,
        "CanCom":      "Comm",
        "seqnum":      "0",
        "queryfor":    "2",      # expenditures
        "queryorder":  "DAT",
        "queryoutput": "2",      # tab-delimited
        "query":       "Submit+Query+Now",
    }

    while True:
        params["seqnum"] = str(seqnum)
        try:
            r = session.post(TREEFIN_CGI, data=params, timeout=60)
            if r.status_code != 200:
                break
        except requests.RequestException:
            break

        text = r.content.decode(FL_ENCODING, errors="replace")
        if not text.strip() or len(text) < 100:
            break

        try:
            df = pd.read_csv(io.StringIO(text), sep="\t", dtype=str,
                             on_bad_lines="skip").fillna("")
        except Exception:
            break

        if df.empty or len(df.columns) < 3:
            break

        all_rows.append(df)
        if len(df) < 500:
            break
        seqnum += len(df)
        page += 1
        time.sleep(REQUEST_DELAY_SEC)

    if not all_rows:
        return None

    combined = pd.concat(all_rows, ignore_index=True)
    combined.to_csv(cache_path, sep="\t", index=False, encoding=FL_ENCODING)
    return combined


def scrape_election(session: requests.Session, election_id: str,
                    committee_type: str = "ECO", purpose_filter: str = "",
                    force: bool = False) -> pd.DataFrame | None:
    """
    Download all IE expenditure rows for a given election.
    Two strategies:
      1. committee=ECO (electioneering comms orgs — IEs only by law)
      2. cpurpose containing "INDEPENDENT" across PAC/ECO

    expend.exe paginates via rowlimit + repeated requests with offset tracking.
    The form uses rowlimit=500 max; we loop until we get < rowlimit rows back.
    """
    cache_key = f"ie_{election_id}_{committee_type}.tsv"
    cache_path = IE_RAW_DIR / cache_key
    if cache_path.exists() and not force:
        print(f"  {election_id}/{committee_type}: cache hit", flush=True)
        try:
            return pd.read_csv(cache_path, sep="\t", dtype=str, encoding=FL_ENCODING).fillna("")
        except Exception:
            pass

    all_rows = []
    page = 1
    # expend.exe doesn't have a seqnum/offset param like TreFin — it returns all matching
    # rows up to rowlimit in one shot. For large elections we need to filter sub-ranges.
    params = {
        "election":    election_id,
        "search_on":   "3",      # search by committee type
        "committee":   committee_type,
        "cpurpose":    purpose_filter,
        "rowlimit":    "500",
        "queryformat": "2",      # tab-delimited
        "csort1":      "AMT",
        "csort2":      "CAN",
        "Submit":      "Submit",
    }

    try:
        r = session.post(EXPEND_CGI, data=params, timeout=90)
        if r.status_code != 200:
            print(f"  {election_id}: HTTP {r.status_code}", flush=True)
            return None
    except requests.RequestException as e:
        print(f"  {election_id}: request error — {e}", flush=True)
        return None

    text = r.content.decode(FL_ENCODING, errors="replace")
    if not text.strip() or "no records" in text.lower() or len(text) < 200:
        print(f"  {election_id}/{committee_type}: no data", flush=True)
        return None

    # Try tab-delimited parse, fall back to HTML
    try:
        df = pd.read_csv(io.StringIO(text), sep="\t", dtype=str,
                         on_bad_lines="skip").fillna("")
        if df.empty or len(df.columns) < 3:
            raise ValueError("too few columns")
    except Exception:
        try:
            tables = pd.read_html(io.StringIO(text))
            df = tables[0].astype(str).fillna("") if tables else pd.DataFrame()
        except Exception:
            print(f"  {election_id}/{committee_type}: could not parse response", flush=True)
            return None

    if df.empty:
        return None

    # Cache
    df.to_csv(cache_path, sep="\t", index=False)
    print(f"  {election_id}/{committee_type}: {len(df):,} rows", flush=True)
    return df


# ── Processing ────────────────────────────────────────────────────────────────

def process_df(df: pd.DataFrame, year: int) -> pd.DataFrame:
    """Normalize columns, types, and add derived fields."""
    df = map_columns(df)

    for col in ["committee_id", "committee_name", "candidate_name",
                "support_oppose", "amount", "expend_date", "purpose", "office", "cycle"]:
        if col not in df.columns:
            df[col] = ""

    df["amount"]       = df["amount"].apply(parse_amount)
    df["expend_date"]  = df["expend_date"].apply(parse_date)
    df["cycle"]        = pd.to_numeric(df["cycle"], errors="coerce").fillna(year).astype(int)
    df["raw_year"]     = year
    df["candidate_slug"] = df["candidate_name"].apply(slugify)

    # Normalize support/oppose: S/O (FL uses various spellings)
    def norm_stance(s):
        s = str(s).upper().strip()
        if s.startswith("S") or "SUPPORT" in s or "FOR" in s:
            return "S"
        if s.startswith("O") or "OPPOSE" in s or "AGAINST" in s:
            return "O"
        return s[:1] or ""
    df["support_oppose"] = df["support_oppose"].apply(norm_stance)

    return df[[
        "committee_id", "committee_name", "candidate_name", "candidate_slug",
        "support_oppose", "amount", "expend_date", "purpose", "office", "cycle", "raw_year",
    ]]


# ── Supabase load ─────────────────────────────────────────────────────────────

def load_to_supabase(df: pd.DataFrame, cur, dry_run: bool) -> int:
    if df.empty:
        return 0

    rows = []
    for _, r in df.iterrows():
        if not r.get("committee_name") and not r.get("candidate_name"):
            continue
        amount = float(r.get("amount", 0) or 0)
        if amount <= 0:
            continue
        rows.append((
            r.get("committee_id", "") or None,
            r.get("committee_name", "") or None,
            r.get("candidate_name", "") or None,
            r.get("candidate_slug", "") or None,
            r.get("support_oppose", "") or None,
            amount,
            r.get("expend_date") or None,
            r.get("purpose", "") or None,
            r.get("office", "") or None,
            int(r.get("cycle", 0) or 0) or None,
            int(r.get("raw_year", 0) or 0) or None,
        ))

    if not rows:
        return 0

    if dry_run:
        print(f"  [dry-run] Would upsert {len(rows):,} IE rows")
        return len(rows)

    for i in range(0, len(rows), BATCH_SIZE):
        execute_values(cur, UPSERT_IE, rows[i:i+BATCH_SIZE], page_size=BATCH_SIZE)
        cur.connection.commit()
        print(f"  upserted {min(i+BATCH_SIZE, len(rows)):,}/{len(rows):,} ...", flush=True)

    return len(rows)


# ── Main ──────────────────────────────────────────────────────────────────────

def main(force=False, dry_run=False, election_filter=None) -> int:
    print("=== Script 23: Scrape FL Independent Expenditures ===\n")
    if dry_run:
        print("  [DRY RUN]\n")

    IE_RAW_DIR.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers["User-Agent"] = (
        "Mozilla/5.0 (compatible; FL-Donor-Tracker/1.0; research use)"
    )

    print("Step 1: Warming up session ...", flush=True)
    warmup_session(session)

    # ── Collect ECO committee accounts across all elections ───────────────────
    # expend.exe is down (502). Strategy: fetch ECO accounts per election from
    # extractComList.asp, then pull TreFin queryfor=2 per-committee.
    elections = [election_filter] if election_filter else IE_ELECTIONS
    print(f"\nStep 2: Fetching ECO committees across {len(elections)} elections ...\n", flush=True)

    all_ecos: dict[str, str] = {}  # acct_num → name (deduplicated across elections)
    for election_id in elections:
        ecos = fetch_eco_accounts(session, election_id)
        new = {acct: name for acct, name in ecos if acct not in all_ecos}
        all_ecos.update(new)
        print(f"  {election_id}: {len(ecos):,} ECOs (+{len(new):,} new) → total {len(all_ecos):,}", flush=True)
        time.sleep(REQUEST_DELAY_SEC)

    if not all_ecos:
        print("ERROR: No ECO committees found.")
        return 1

    print(f"\n  Total unique ECO committees: {len(all_ecos):,}", flush=True)

    # ── Pull expenditures per-ECO via TreFin ──────────────────────────────────
    print(f"\nStep 3: Pulling expenditures for {len(all_ecos):,} ECO committees ...\n", flush=True)

    all_dfs = []
    for i, (acct, name) in enumerate(all_ecos.items()):
        if i % 25 == 0 and i > 0:
            print(f"  {i}/{len(all_ecos):,} committees processed ...", flush=True)
        df_raw = scrape_committee_expenditures(session, acct, name, force=force)
        if df_raw is not None and not df_raw.empty:
            try:
                raw_date = df_raw["Date"].iloc[0] if "Date" in df_raw.columns else "2020"
                year = int(str(raw_date).strip()[-4:])
            except (ValueError, IndexError):
                year = 2020
            df_proc = process_df(df_raw, year)
            if not df_proc.empty:
                # Tag with committee info
                df_proc["committee_id"]   = acct
                df_proc["committee_name"] = name
                all_dfs.append(df_proc)
        time.sleep(REQUEST_DELAY_SEC * 0.5)  # lighter delay for per-committee loop

    if not all_dfs:
        print("No IE data collected across any year.")
        return 1

    combined = pd.concat(all_dfs, ignore_index=True)
    print(f"\nTotal: {len(combined):,} IE rows across all years", flush=True)

    # Summary stats
    total_amt = combined["amount"].sum()
    support   = combined[combined["support_oppose"] == "S"]["amount"].sum()
    oppose    = combined[combined["support_oppose"] == "O"]["amount"].sum()
    print(f"  Total IE spend:  ${total_amt:,.0f}")
    print(f"  Support:         ${support:,.0f}")
    print(f"  Oppose:          ${oppose:,.0f}")
    print(f"  Unique committees: {combined['committee_name'].nunique():,}")
    print(f"  Unique candidates: {combined['candidate_name'].nunique():,}")

    # ── Save combined CSV ─────────────────────────────────────────────────────
    combined.to_csv(IE_CSV_OUT, index=False)
    print(f"\nSaved → {IE_CSV_OUT}", flush=True)

    # ── Load to Supabase ──────────────────────────────────────────────────────
    print("\nStep 4: Loading to Supabase ...", flush=True)
    con = psycopg2.connect(DB_URL)
    con.autocommit = False
    cur = con.cursor()
    cur.execute("SET statement_timeout = 0")

    try:
        cur.execute(CREATE_IE_TABLE)
        con.commit()

        n = load_to_supabase(combined, cur, dry_run)
        if not dry_run:
            print(f"  {n:,} rows loaded → independent_expenditures", flush=True)

    except Exception as e:
        con.rollback()
        print(f"\nERROR: {e}", file=sys.stderr)
        return 1
    finally:
        cur.close()
        con.close()

    print("\n=== DONE ===")
    print(f"Table: independent_expenditures ({len(combined):,} rows)")
    print("Next: Build /ies page, wire to candidate + committee profiles")
    return 0


if __name__ == "__main__":
    force          = "--force"   in sys.argv
    dry_run        = "--dry-run" in sys.argv
    # Accept either a year (2022) or full election ID (20221108-GEN)
    election_arg   = next((a for a in sys.argv[1:] if re.match(r'^\d{8}-\w+$', a) or (a.isdigit() and 2000 < int(a) < 2030)), None)
    if election_arg and election_arg.isdigit():
        # Map year to its general election ID
        election_arg = next((e for e in IE_ELECTIONS if e.startswith(election_arg)), None)
    sys.exit(main(force=force, dry_run=dry_run, election_filter=election_arg))
