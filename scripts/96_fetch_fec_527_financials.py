"""
Script 96: Fetch FEC financial data for FL 527 stub orgs.

The 328 527-type stubs in our solicitation data have FL solicitation filings
but no FL DoE committee record. Many registered with the FEC instead — either
as traditional PACs (via /committees/) or as pure 527s (via Form 8871/8872).

This script:
  1. Loads 527-type stubs from solicitation_stubs_resolved.csv
  2. Searches FEC /committees/ by org name (committee_type=Q for 527s)
  3. Also searches EFTS form8871 as fallback for pure 527s not in committees API
  4. Fetches total_receipts / total_disbursements for matched orgs
  5. Updates solicitation_stubs_resolved.csv with fec_* columns
  6. ALTERs shadow_orgs table to add fec_* columns (if missing)
  7. Upserts FEC financials to shadow_orgs in Supabase

FEC endpoints used:
  OpenFEC: https://api.open.fec.gov/v1/committees/?q=<name>&committee_type=Q
  OpenFEC: https://api.open.fec.gov/v1/committees/{id}/totals/
  EFTS:    https://efts.fec.gov/EFTSNEW/form8871/?q.organization_name=<name>
  EFTS:    https://efts.fec.gov/EFTSNEW/form8872/?q.organization_name=<name>

Outputs:
  data/processed/solicitation_stubs_resolved.csv  (updated with fec_* columns)
  data/raw/fec/fec_527_cache.json                 (response cache)

Usage:
  python scripts/96_fetch_fec_527_financials.py
  python scripts/96_fetch_fec_527_financials.py --force   # bypass cache
"""

import json
import os
import re
import sys
import time
from pathlib import Path

import pandas as pd
import psycopg2
import requests
from dotenv import load_dotenv
from psycopg2.extras import execute_values
from rapidfuzz import fuzz

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env.local")

# ── Paths ──────────────────────────────────────────────────────────────────────
STUBS_CSV  = PROJECT_ROOT / "data" / "processed" / "solicitation_stubs_resolved.csv"
FEC_DIR    = PROJECT_ROOT / "data" / "raw" / "fec"
CACHE_JSON = FEC_DIR / "fec_527_cache.json"

# ── FEC API ────────────────────────────────────────────────────────────────────
FEC_API_KEY   = "pPfIwEcNu4xdjuFyCNR3gw4xLlJ2oSWlREjLPzAr"
FEC_BASE      = "https://api.open.fec.gov/v1"
EFTS_BASE     = "https://efts.fec.gov/EFTSNEW"
REQUEST_DELAY = 1.0          # ~1,000 req/hr limit; 3 calls/org → ~3s/org → safe

# Fuzzy match threshold (token_sort_ratio)
MATCH_THRESHOLD = 78

_PUNCT = re.compile(r"[^A-Z0-9\s]")


def norm(s: str) -> str:
    upper = str(s).upper()
    return " ".join(_PUNCT.sub(" ", upper).split())


# ── Cache ──────────────────────────────────────────────────────────────────────

def load_cache(path: Path) -> dict:
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {}


def save_cache(cache: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(cache, f, indent=2)


# ── FEC OpenFEC helpers ────────────────────────────────────────────────────────

def fec_get(session: requests.Session, endpoint: str, params: dict) -> dict | None:
    """GET from FEC API with retry on 429."""
    params = {**params, "api_key": FEC_API_KEY}
    url = f"{FEC_BASE}/{endpoint}"
    for attempt in range(3):
        try:
            r = session.get(url, params=params, timeout=30, verify=False)
            if r.status_code == 429:
                wait = int(r.headers.get("Retry-After", 60))
                print(f"    Rate-limited — waiting {wait}s ...", flush=True)
                time.sleep(wait)
                continue
            if r.status_code != 200:
                return None
            return r.json()
        except Exception:
            time.sleep(5)
    return None


def search_fec_committees(session: requests.Session, name: str, state: str | None = "FL") -> list[dict]:
    """Search FEC /committees/ for 527-type committees matching name."""
    params = {
        "q": name,
        "committee_type": "Q",   # 527 political org
        "per_page": 10,
        "sort": "-last_receipt_date",
    }
    if state:
        params["state"] = state

    data = fec_get(session, "committees/", params)
    if not data:
        return []
    return data.get("results", [])


def get_committee_totals(session: requests.Session, committee_id: str) -> dict:
    """Get all-time financial totals for a FEC committee."""
    data = fec_get(session, f"committees/{committee_id}/totals/", {"per_page": 1, "sort": "-cycle"})
    if not data:
        return {}
    results = data.get("results", [])
    return results[0] if results else {}


# ── FEC EFTS helpers (Form 8871/8872 for pure 527s) ───────────────────────────

def efts_search(session: requests.Session, form: str, name: str) -> list[dict]:
    """
    Search EFTS (Electronic Filing Tracking System) by org name.
    form: '8871' (registration) or '8872' (periodic report)
    """
    url = f"{EFTS_BASE}/form{form}/"
    params = {"q.organization_name": name, "per_page": 5}
    try:
        r = session.get(url, params=params, timeout=20)
        if r.status_code != 200:
            return []
        return r.json().get("results", [])
    except Exception:
        return []


def get_efts_totals(session: requests.Session, filer_id: str) -> dict:
    """
    Aggregate Form 8872 receipts/disbursements for a given filer_id.
    Returns {total_receipts, total_disbursements, num_reports}.
    """
    url = f"{EFTS_BASE}/form8872/"
    params = {"q.filer_id": filer_id, "per_page": 100}
    try:
        r = session.get(url, params=params, timeout=20)
        if r.status_code != 200:
            return {}
        reports = r.json().get("results", [])
        total_receipts = sum(float(rep.get("total_receipts", 0) or 0) for rep in reports)
        total_disb     = sum(float(rep.get("total_disbursements", 0) or 0) for rep in reports)
        years = [rep.get("filing_date", "")[:4] for rep in reports if rep.get("filing_date")]
        latest_year = max(years) if years else None
        return {
            "total_receipts": total_receipts,
            "total_disbursements": total_disb,
            "num_reports": len(reports),
            "latest_year": latest_year,
        }
    except Exception:
        return {}


# ── Matching logic ─────────────────────────────────────────────────────────────

def best_fec_match(org_name: str, candidates: list[dict], name_field: str = "name") -> dict | None:
    """
    Fuzzy-match org_name against a list of FEC result dicts.
    Returns best match if score >= MATCH_THRESHOLD, else None.
    """
    org_n = norm(org_name)
    best_score = 0
    best = None
    for cand in candidates:
        cand_name = cand.get(name_field, "") or ""
        score = fuzz.token_sort_ratio(org_n, norm(cand_name))
        if score > best_score:
            best_score = score
            best = cand
    if best_score >= MATCH_THRESHOLD:
        return {**best, "_match_score": best_score}
    return None


# ── Per-org lookup ─────────────────────────────────────────────────────────────

def lookup_org(session: requests.Session, org_name: str, cache: dict, force: bool) -> dict:
    """
    Full FEC lookup for one org name. Returns dict with fec_* fields.
    Tries: (1) FEC committees FL, (2) FEC committees national, (3) EFTS 8871.
    """
    cache_key = f"fec:{norm(org_name)}"
    if not force and cache_key in cache:
        return cache[cache_key]

    result = {
        "fec_source": None,
        "fec_committee_id": None,
        "fec_name": None,
        "fec_match_score": 0,
        "fec_total_receipts": None,
        "fec_total_disbursements": None,
        "fec_latest_year": None,
    }

    # Pass 1: OpenFEC committees search — FL only
    candidates = search_fec_committees(session, org_name, state="FL")
    time.sleep(REQUEST_DELAY)

    match = best_fec_match(org_name, candidates)

    # Pass 2: OpenFEC committees search — national (no state filter)
    if not match:
        candidates = search_fec_committees(session, org_name, state=None)
        time.sleep(REQUEST_DELAY)
        match = best_fec_match(org_name, candidates)

    if match:
        committee_id = match.get("id", "")
        totals = get_committee_totals(session, committee_id)
        time.sleep(REQUEST_DELAY)

        result.update({
            "fec_source": "openfec_committees",
            "fec_committee_id": committee_id,
            "fec_name": match.get("name"),
            "fec_match_score": match["_match_score"],
            "fec_total_receipts": totals.get("receipts"),
            "fec_total_disbursements": totals.get("disbursements"),
            "fec_latest_year": totals.get("cycle"),
        })
        cache[cache_key] = result
        return result

    # Pass 3: EFTS Form 8871 (pure 527 registrations)
    efts_results = efts_search(session, "8871", org_name)
    time.sleep(REQUEST_DELAY)

    efts_match = best_fec_match(org_name, efts_results, name_field="organization_name")
    if efts_match:
        filer_id = efts_match.get("filer_id", "")
        efts_totals = get_efts_totals(session, filer_id) if filer_id else {}
        time.sleep(REQUEST_DELAY)

        result.update({
            "fec_source": "efts_8871",
            "fec_committee_id": filer_id,
            "fec_name": efts_match.get("organization_name"),
            "fec_match_score": efts_match["_match_score"],
            "fec_total_receipts": efts_totals.get("total_receipts"),
            "fec_total_disbursements": efts_totals.get("total_disbursements"),
            "fec_latest_year": efts_totals.get("latest_year"),
        })

    cache[cache_key] = result
    return result


# ── Supabase: ALTER + upsert ───────────────────────────────────────────────────

ALTER_COLS = """
ALTER TABLE shadow_orgs
  ADD COLUMN IF NOT EXISTS fec_source           TEXT,
  ADD COLUMN IF NOT EXISTS fec_committee_id     TEXT,
  ADD COLUMN IF NOT EXISTS fec_name             TEXT,
  ADD COLUMN IF NOT EXISTS fec_match_score      INTEGER,
  ADD COLUMN IF NOT EXISTS fec_total_receipts   NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS fec_total_disb       NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS fec_latest_year      INTEGER;
"""


def upsert_to_supabase(rows: list[dict]) -> None:
    db_url = os.getenv("SUPABASE_DB_URL")
    if not db_url:
        print("  WARNING: SUPABASE_DB_URL not set — skipping Supabase upsert")
        return

    con = psycopg2.connect(db_url)
    con.autocommit = True
    cur = con.cursor()
    try:
        cur.execute(ALTER_COLS)
        print(f"  ✓ shadow_orgs columns added/verified")

        def safe_float(v):
            try:
                return float(v) if v not in (None, "", "nan") else None
            except (ValueError, TypeError):
                return None

        def safe_int(v):
            try:
                return int(float(v)) if v not in (None, "", "nan") else None
            except (ValueError, TypeError):
                return None

        tuples = [
            (
                r.get("org_name", r["org_slug"]),
                r["org_slug"],
                r.get("fec_source"),
                r.get("fec_committee_id"),
                r.get("fec_name"),
                safe_int(r.get("fec_match_score")),
                safe_float(r.get("fec_total_receipts")),
                safe_float(r.get("fec_total_disbursements")),
                safe_int(r.get("fec_latest_year")),
            )
            for r in rows
        ]

        execute_values(
            cur,
            """
            INSERT INTO shadow_orgs (org_name, org_slug,
                fec_source, fec_committee_id, fec_name, fec_match_score,
                fec_total_receipts, fec_total_disb, fec_latest_year)
            VALUES %s
            ON CONFLICT (org_slug) DO UPDATE SET
                fec_source         = EXCLUDED.fec_source,
                fec_committee_id   = EXCLUDED.fec_committee_id,
                fec_name           = EXCLUDED.fec_name,
                fec_match_score    = EXCLUDED.fec_match_score,
                fec_total_receipts = EXCLUDED.fec_total_receipts,
                fec_total_disb     = EXCLUDED.fec_total_disb,
                fec_latest_year    = EXCLUDED.fec_latest_year,
                updated_at         = NOW()
            """,
            tuples,
        )
        matched = sum(1 for r in rows if r.get("fec_source"))
        print(f"  ✓ Upserted {len(tuples):,} rows ({matched} with FEC data) → shadow_orgs")
    finally:
        cur.close()
        con.close()


# ── Main ───────────────────────────────────────────────────────────────────────

def slugify(name: str) -> str:
    s = str(name).lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"\s+", "-", s.strip())
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:120]


def main(force: bool = False) -> int:
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    print("=== Script 96: FEC 527 Financial Lookup ===\n")

    if not STUBS_CSV.exists():
        print(f"ERROR: {STUBS_CSV} not found. Run script 92 first.")
        return 1

    df = pd.read_csv(STUBS_CSV, dtype=str).fillna("")

    # Only search 527-type stubs
    stubs_527 = df[df["stub_type"] == "527"].copy()
    print(f"  {len(df):,} total stubs, {len(stubs_527):,} are 527-type → searching FEC\n")

    cache = load_cache(CACHE_JSON)
    session = requests.Session()

    results = []
    matched = 0
    for i, (_, row) in enumerate(stubs_527.iterrows()):
        org_name = row["org_name"].strip()
        if not org_name:
            continue

        fec_data = lookup_org(session, org_name, cache, force)
        source = fec_data.get("fec_source")
        receipts = fec_data.get("fec_total_receipts")

        if source:
            matched += 1
            receipts_str = f"${int(receipts):,}" if receipts else "n/a"
            score = fec_data.get("fec_match_score", 0)
            print(f"  [{i+1:3d}] ✓ {org_name[:45]:45s}  [{source}] score={score}  receipts={receipts_str}")
        else:
            print(f"  [{i+1:3d}]   {org_name[:45]:45s}  no match")

        results.append({
            "org_name": org_name,
            "org_slug": slugify(org_name),
            **fec_data,
        })

        if (i + 1) % 25 == 0:
            save_cache(cache, CACHE_JSON)
            print(f"\n  --- {i+1}/{len(stubs_527)} searched, {matched} matched so far ---\n", flush=True)

    save_cache(cache, CACHE_JSON)

    print(f"\n=== FEC Search Complete ===")
    print(f"  527 stubs searched: {len(results):,}")
    print(f"  FEC matches found:  {matched:,} ({matched/len(results)*100:.1f}%)")

    # Update CSV with fec_* columns
    fec_lookup = {r["org_name"]: r for r in results}
    new_cols = ["fec_source", "fec_committee_id", "fec_name",
                "fec_match_score", "fec_total_receipts",
                "fec_total_disbursements", "fec_latest_year"]

    for col in new_cols:
        df[col] = df["org_name"].map(lambda n: fec_lookup.get(n, {}).get(col))

    df.to_csv(STUBS_CSV, index=False)
    print(f"\n  ✓ Updated {STUBS_CSV.name} with fec_* columns")

    # Upsert to Supabase
    print("\n  Upserting to Supabase ...")
    upsert_rows = [{"org_slug": slugify(r["org_name"]), **r} for r in results]
    upsert_to_supabase(upsert_rows)

    # Summary of what we found
    with_receipts = [r for r in results if r.get("fec_total_receipts")]
    if with_receipts:
        total_dark = sum(float(r["fec_total_receipts"]) for r in with_receipts)
        print(f"\n  Total FEC receipts across matched orgs: ${total_dark:,.0f}")
        print(f"  Top matches by receipts:")
        top = sorted(with_receipts, key=lambda r: float(r.get("fec_total_receipts", 0)), reverse=True)[:10]
        for r in top:
            print(f"    {r['org_name'][:50]:50s}  ${float(r['fec_total_receipts']):>12,.0f}")

    print("\n=== DONE ===")
    print(f"Cache: {CACHE_JSON}")
    return 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(main(force))
