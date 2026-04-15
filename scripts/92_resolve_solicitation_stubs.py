"""
Script 92: Resolve solicitation stub orgs via IRS EO data + ProPublica 990 API.

"Stubs" are organizations listed in FL DS-DE-102 solicitation filings that have
NO matching record in the FL DoE committee registry. These are typically 527
or 501(c)(4) entities that file with the IRS instead of (or in addition to)
the FL Division of Elections.

Inputs
------
  data/raw/solicitations/solicitations.csv         — scraped FL DoE solicitation rows
  public/data/solicitations/index.json             — XLS-parsed solicitations with org_type
  data/processed/committees.csv                    — FL DoE committee registry
  data/processed/candidates.csv                    — FL candidate registry

Outputs
-------
  data/processed/solicitation_stubs_resolved.csv   — stubs with IRS matches + financials
  data/raw/irs/eo_fl.csv                           — cached IRS EO FL bulk extract
  data/raw/irs/propublica_cache.json               — cached ProPublica API responses

Each row in the output:
  org_name, stub_type (527/501c4/unknown),
  irs_ein, irs_name, irs_status, irs_ntee_code,
  pp_total_revenue, pp_total_expenses, pp_total_assets,
  pp_filing_year, pp_url,
  matched_candidates (pipe-separated list),
  match_method (exact/fuzzy/unresolved)

Usage
-----
  python scripts/92_resolve_solicitation_stubs.py
  python scripts/92_resolve_solicitation_stubs.py --force   # re-download IRS data
"""

import csv
import json
import re
import sys
import time
from pathlib import Path
from collections import defaultdict

import pandas as pd
import requests
from rapidfuzz import fuzz

sys.path.insert(0, str(Path(__file__).parent))
from config import PROCESSED_DIR, RAW_DIR, PROJECT_ROOT

# ── Paths ─────────────────────────────────────────────────────────────────────
SOL_RAW_CSV     = RAW_DIR / "solicitations" / "solicitations.csv"
SOL_INDEX_JSON  = PROJECT_ROOT / "public" / "data" / "solicitations" / "index.json"
COMMITTEES_CSV  = PROCESSED_DIR / "committees.csv"
CANDIDATES_CSV  = PROCESSED_DIR / "candidates.csv"
OUTPUT_CSV      = PROCESSED_DIR / "solicitation_stubs_resolved.csv"

IRS_DIR         = RAW_DIR / "irs"
IRS_EO_CSV      = IRS_DIR / "eo_fl.csv"
PP_CACHE_JSON   = IRS_DIR / "propublica_cache.json"

PROPUBLICA_BASE = "https://projects.propublica.org/nonprofits/api/v2"
REQUEST_DELAY   = 0.5  # seconds between ProPublica API calls

# Fuzzy match thresholds
ORG_EXACT_THRESHOLD = 100
ORG_FUZZY_THRESHOLD = 82  # token_sort_ratio
IRS_FUZZY_THRESHOLD = 80

_PUNCT = re.compile(r"[^A-Z0-9\s]")
_ORG_SUFFIXES = re.compile(
    r"\b(PC|CCE|ECO|PAC|INC|LLC|CORP|FOUNDATION|FUND|COMMITTEE|POLITICAL COMMITTEE"
    r"|527|501C4|501\(C\)\(4\))\b"
)


def norm(s: str) -> str:
    """Normalize for fuzzy matching: uppercase, strip punct."""
    upper = str(s).upper()
    return " ".join(_PUNCT.sub(" ", upper).split())


def norm_strip_suffix(s: str) -> str:
    """Normalize and strip common legal suffixes for better fuzzy matching."""
    n = norm(s)
    return " ".join(_ORG_SUFFIXES.sub("", n).split())


# ── Step 1: Identify stub orgs ────────────────────────────────────────────────

def load_stubs(sol_csv: Path, committees_csv: Path) -> dict:
    """
    Returns dict: normalized_org_name → {org_name, solicitors: set}
    for orgs with NO match in FL DoE committee registry.
    """
    # Load committee names (normalized)
    com_df = pd.read_csv(committees_csv, dtype=str).fillna("")
    com_names = {norm(r["committee_name"]) for _, r in com_df.iterrows()}
    com_names_stripped = {norm_strip_suffix(r["committee_name"]) for _, r in com_df.iterrows()}

    # Load solicitations
    sol_df = pd.read_csv(sol_csv, dtype=str).fillna("")

    # Keep active solicitations only (latest per solicitor+org pair is not Withdrawal)
    sol_df["received_dt"] = pd.to_datetime(sol_df["received_date"], errors="coerce")
    sol_df = sol_df.sort_values("received_dt")
    latest = sol_df.groupby(["solicitor_name", "organization"], as_index=False).last()
    active = latest[latest["form_type"] != "Solicitation Withdrawal"]

    stubs = {}
    for _, row in active.iterrows():
        org = row["organization"].strip()
        org_n = norm(org)
        org_ns = norm_strip_suffix(org)

        # Skip if it matches the committee registry
        if org_n in com_names or org_ns in com_names_stripped:
            continue

        if org_n not in stubs:
            stubs[org_n] = {"org_name": org, "solicitors": set()}
        stubs[org_n]["solicitors"].add(row["solicitor_name"].strip())

    return stubs


# ── Step 2: Enrich stubs with org_type from solicitations index ───────────────

def enrich_from_index(stubs: dict, index_json: Path) -> None:
    """
    Mutates stubs in-place: adds org_type, withdrawn fields from solicitations/index.json.
    Uses fuzzy name matching since names may differ slightly.
    """
    with open(index_json) as f:
        index = json.load(f)

    # Build lookup: normalized name → record
    idx_lookup = {}
    for rec in index:
        key = norm(rec["organization"])
        idx_lookup[key] = rec
        key_s = norm_strip_suffix(rec["organization"])
        if key_s != key:
            idx_lookup[key_s] = rec

    idx_names = list(idx_lookup.keys())

    for org_key, entry in stubs.items():
        # Exact match first
        if org_key in idx_lookup:
            rec = idx_lookup[org_key]
            entry["org_type"] = rec.get("org_type", "")
            entry["index_id"] = rec.get("id", "")
            continue

        org_stripped = norm_strip_suffix(entry["org_name"])
        if org_stripped in idx_lookup:
            rec = idx_lookup[org_stripped]
            entry["org_type"] = rec.get("org_type", "")
            entry["index_id"] = rec.get("id", "")
            continue

        # Fuzzy match
        best_score = 0
        best_rec = None
        for idx_key in idx_names:
            score = fuzz.token_sort_ratio(org_key, idx_key)
            if score > best_score and score >= ORG_FUZZY_THRESHOLD:
                best_score = score
                best_rec = idx_lookup[idx_key]

        if best_rec:
            entry["org_type"] = best_rec.get("org_type", "")
            entry["index_id"] = best_rec.get("id", "")
        else:
            entry["org_type"] = ""
            entry["index_id"] = ""


# ── Step 3+4: Search ProPublica by org name (replaces IRS bulk download) ──────

def search_propublica(org_name: str, cache: dict) -> dict | None:
    """
    Search ProPublica Nonprofit Explorer by org name (FL only).
    Returns best-matching org dict, or None.
    Uses the search endpoint: /search.json?q={name}&state[id]=FL
    Caches by normalized name.
    """
    cache_key = f"search:{norm(org_name)}"
    if cache_key in cache:
        return cache[cache_key]

    url = f"{PROPUBLICA_BASE}/search.json"
    params = {"q": org_name, "state[id]": "FL"}
    try:
        r = requests.get(url, params=params, timeout=15)
        if r.status_code != 200:
            cache[cache_key] = None
            return None
        data = r.json()
        orgs = data.get("organizations", [])
        if not orgs:
            cache[cache_key] = None
            return None
        # Take highest-scored result that has a meaningful score
        best = orgs[0]
        if best.get("score", 0) < 70:
            cache[cache_key] = None
            return None
        result = {
            "ein": str(best.get("ein", "")).zfill(9),
            "name": best.get("name", ""),
            "ntee_code": best.get("ntee_code", ""),
            "subseccd": best.get("subseccd", ""),
            "score": best.get("score", 0),
        }
        cache[cache_key] = result
        return result
    except Exception:
        cache[cache_key] = None
        return None


def search_stubs_propublica(stubs: dict, cache_path: Path) -> None:
    """
    For each stub, search ProPublica by org name to find EIN.
    Only searches stubs typed as 501(c)(4) — 527s don't file 990s.
    Mutates stubs in-place.
    """
    IRS_DIR.mkdir(parents=True, exist_ok=True)
    cache = load_pp_cache(cache_path)

    # Determine which stubs to search: 501c4 or untyped
    to_search = [
        (key, entry) for key, entry in stubs.items()
        if "501" in entry.get("org_type", "") or not entry.get("org_type", "")
    ]
    print(f"  Searching ProPublica for {len(to_search):,} stubs (501c4 + untyped) ...", flush=True)

    matched = 0
    for i, (key, entry) in enumerate(to_search):
        result = search_propublica(entry["org_name"], cache)
        if result:
            entry["irs_ein"] = result["ein"]
            entry["irs_name"] = result["name"]
            entry["irs_subsection"] = str(result.get("subseccd", ""))
            entry["irs_match_score"] = int(result.get("score", 0))
            matched += 1
        else:
            entry["irs_ein"] = ""
            entry["irs_name"] = ""
            entry["irs_subsection"] = ""
            entry["irs_match_score"] = 0

        time.sleep(REQUEST_DELAY)
        if (i + 1) % 50 == 0:
            save_pp_cache(cache, cache_path)
            print(f"    {i+1}/{len(to_search)} searched ...", flush=True)

    save_pp_cache(cache, cache_path)
    print(f"  ProPublica name search: {matched:,} EINs found of {len(to_search):,} searched")
    print(f"  Note: 527s don't file 990s — ProPublica won't have them (expected)")

    # Mark 527s explicitly so we don't search them
    for entry in stubs.values():
        if "527" in entry.get("org_type", "") and not entry.get("irs_ein"):
            entry["irs_ein"] = ""
            entry["irs_name"] = ""
            entry["irs_subsection"] = ""
            entry["irs_match_score"] = 0


# ── Step 5: ProPublica 990 lookups ────────────────────────────────────────────

def load_pp_cache(cache_path: Path) -> dict:
    if cache_path.exists():
        with open(cache_path) as f:
            return json.load(f)
    return {}


def save_pp_cache(cache: dict, cache_path: Path) -> None:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    with open(cache_path, "w") as f:
        json.dump(cache, f, indent=2)


def fetch_propublica(ein: str, cache: dict) -> dict:
    """
    Fetch org financials from ProPublica Nonprofit Explorer.
    Returns dict with total_revenue, total_expenses, total_assets, filing_year, ntee_code, url.
    Caches by EIN.
    """
    if ein in cache:
        return cache[ein]

    url = f"{PROPUBLICA_BASE}/organizations/{ein}.json"
    try:
        r = requests.get(url, timeout=15)
        if r.status_code == 404:
            result = {"status": "not_found", "ein": ein}
        elif r.status_code != 200:
            result = {"status": f"http_{r.status_code}", "ein": ein}
        else:
            data = r.json()
            org = data.get("organization", {})
            filings = data.get("filings_with_data", [])
            latest = filings[0] if filings else {}
            result = {
                "status": "ok",
                "ein": ein,
                "name": org.get("name", ""),
                "ntee_code": org.get("ntee_code", ""),
                "subsection_code": org.get("subsection_code", ""),
                "state": org.get("state", ""),
                "total_revenue": latest.get("totrevenue", 0),
                "total_expenses": latest.get("totfuncexpns", 0),
                "total_assets": latest.get("totassetsend", 0),
                "filing_year": latest.get("tax_prd_yr", ""),
                "url": f"https://projects.propublica.org/nonprofits/organizations/{ein}",
            }
    except Exception as e:
        result = {"status": f"error_{type(e).__name__}", "ein": ein}

    cache[ein] = result
    time.sleep(REQUEST_DELAY)
    return result


def enrich_with_propublica(stubs: dict, cache_path: Path) -> None:
    """
    For all stubs with an IRS EIN, fetch ProPublica 990 data.
    Mutates stubs in-place.
    """
    cache = load_pp_cache(cache_path)
    eins_to_fetch = [
        entry["irs_ein"]
        for entry in stubs.values()
        if entry.get("irs_ein") and entry["irs_ein"] not in cache
    ]
    print(f"  ProPublica: {len(eins_to_fetch):,} new EINs to fetch "
          f"({len(cache):,} already cached) ...", flush=True)

    fetched = 0
    for ein in eins_to_fetch:
        fetch_propublica(ein, cache)
        fetched += 1
        if fetched % 25 == 0:
            save_pp_cache(cache, cache_path)
            print(f"    {fetched}/{len(eins_to_fetch)} fetched ...", flush=True)

    save_pp_cache(cache, cache_path)

    # Apply cache to stubs
    ok = 0
    for entry in stubs.values():
        ein = entry.get("irs_ein", "")
        if not ein:
            continue
        pp = cache.get(ein, {})
        entry["pp_status"] = pp.get("status", "")
        entry["pp_name"] = pp.get("name", "")
        entry["pp_ntee_code"] = pp.get("ntee_code", "")
        entry["pp_total_revenue"] = pp.get("total_revenue", "")
        entry["pp_total_expenses"] = pp.get("total_expenses", "")
        entry["pp_total_assets"] = pp.get("total_assets", "")
        entry["pp_filing_year"] = pp.get("filing_year", "")
        entry["pp_url"] = pp.get("url", "")
        if pp.get("status") == "ok":
            ok += 1

    print(f"  ProPublica 990 data found: {ok:,} orgs")


# ── Step 6: Match stubs to candidates ────────────────────────────────────────

def match_to_candidates(stubs: dict, sol_csv: Path, cand_csv: Path) -> None:
    """
    For each stub, attach the list of FL candidates who filed solicitations for it.
    Uses solicitor_name from solicitations.csv matched against candidates.csv.
    Mutates stubs in-place.
    """
    cand_df = pd.read_csv(cand_csv, dtype=str).fillna("")
    cand_df["full_name"] = (
        cand_df["first_name"].str.strip() + " " + cand_df["last_name"].str.strip()
    ).str.strip()
    # candidates.csv has no candidate_name column — use first_name + last_name
    cand_lookup = {norm(r["full_name"]): r["full_name"] for _, r in cand_df.iterrows()}
    # Also index by "LAST FIRST" format (solicitations are "Last, First")
    cand_lookup_lf = {
        norm(r["last_name"].strip() + " " + r["first_name"].strip()): r["full_name"]
        for _, r in cand_df.iterrows()
    }

    for entry in stubs.values():
        matched_cands = []
        for solicitor in entry.get("solicitors", set()):
            # solicitor format: "Last, First"
            parts = solicitor.split(",", 1)
            last = parts[0].strip()
            first = parts[1].strip() if len(parts) > 1 else ""
            full_fl = norm(first + " " + last)
            lf = norm(last + " " + first)

            resolved = cand_lookup.get(full_fl) or cand_lookup_lf.get(lf)
            if resolved:
                matched_cands.append(resolved)
            else:
                matched_cands.append(solicitor)  # fall back to raw name

        entry["matched_candidates"] = "|".join(sorted(set(matched_cands)))


# ── Step 7: Write output ──────────────────────────────────────────────────────

def write_output(stubs: dict, output_path: Path) -> None:
    rows = []
    for entry in stubs.values():
        # Determine clean stub_type from org_type string
        ot = entry.get("org_type", "")
        if "501" in ot:
            stub_type = "501c4"
        elif "527" in ot:
            stub_type = "527"
        else:
            stub_type = "unknown"

        # Determine match method
        if entry.get("irs_match_score", 0) == 100:
            match_method = "exact"
        elif entry.get("irs_ein"):
            match_method = "fuzzy"
        else:
            match_method = "unresolved"

        rows.append({
            "org_name": entry["org_name"],
            "stub_type": stub_type,
            "org_type_raw": entry.get("org_type", ""),
            "index_id": entry.get("index_id", ""),
            "irs_ein": entry.get("irs_ein", ""),
            "irs_name": entry.get("irs_name", ""),
            "irs_subsection": entry.get("irs_subsection", ""),
            "irs_match_score": entry.get("irs_match_score", 0),
            "pp_name": entry.get("pp_name", ""),
            "pp_ntee_code": entry.get("pp_ntee_code", ""),
            "pp_total_revenue": entry.get("pp_total_revenue", ""),
            "pp_total_expenses": entry.get("pp_total_expenses", ""),
            "pp_total_assets": entry.get("pp_total_assets", ""),
            "pp_filing_year": entry.get("pp_filing_year", ""),
            "pp_url": entry.get("pp_url", ""),
            "match_method": match_method,
            "num_solicitors": len(entry.get("solicitors", set())),
            "matched_candidates": entry.get("matched_candidates", ""),
        })

    df = pd.DataFrame(rows).sort_values(["stub_type", "org_name"])
    df.to_csv(output_path, index=False)

    # Summary
    by_type = df["stub_type"].value_counts()
    by_method = df["match_method"].value_counts()
    print(f"\n  Output: {len(df):,} stub orgs → {output_path.name}")
    print("  By type:")
    for k, v in by_type.items():
        print(f"    {k}: {v}")
    print("  By IRS match method:")
    for k, v in by_method.items():
        print(f"    {k}: {v}")

    # Sample resolved rows
    resolved = df[df["match_method"] != "unresolved"].head(10)
    if not resolved.empty:
        print("\n  Sample resolved stubs:")
        for _, r in resolved.iterrows():
            rev = f"${int(r['pp_total_revenue']):,}" if r["pp_total_revenue"] else "n/a"
            print(f"    [{r['stub_type']:7s}] {r['org_name'][:40]:40s}  EIN={r['irs_ein']}  Rev={rev}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main(force: bool = False) -> int:
    print("=== Script 92: Resolve Solicitation Stubs via IRS Data ===\n")

    for path in (SOL_RAW_CSV, COMMITTEES_CSV, CANDIDATES_CSV):
        if not path.exists():
            print(f"ERROR: Required file not found: {path}", file=sys.stderr)
            return 1

    # Step 1: Find stubs
    print("Step 1: Identifying stub orgs (not in FL committee registry) ...", flush=True)
    stubs = load_stubs(SOL_RAW_CSV, COMMITTEES_CSV)
    print(f"  {len(stubs):,} unique stub organizations\n")

    # Step 2: Enrich with org_type from solicitations index
    print("Step 2: Enriching stubs from solicitations/index.json ...", flush=True)
    if SOL_INDEX_JSON.exists():
        enrich_from_index(stubs, SOL_INDEX_JSON)
        typed = sum(1 for e in stubs.values() if e.get("org_type"))
        print(f"  {typed:,} stubs have org_type from XLS index")
    else:
        print(f"  WARNING: {SOL_INDEX_JSON} not found — skipping org_type enrichment")
    print()

    # Step 3: Search ProPublica by name for 501(c)(4) + untyped stubs
    # (527s don't file 990s — ProPublica won't have them, which is expected)
    print("Step 3+4: Searching ProPublica Nonprofit Explorer by org name ...", flush=True)
    search_stubs_propublica(stubs, PP_CACHE_JSON)
    print()

    # Step 5: ProPublica 990 financials for EINs we found
    eins_with_match = sum(1 for e in stubs.values() if e.get("irs_ein"))
    if eins_with_match > 0:
        print(f"Step 5: Fetching ProPublica 990 financials for {eins_with_match:,} matched EINs ...", flush=True)
        enrich_with_propublica(stubs, PP_CACHE_JSON)
    else:
        print("Step 5: Skipped (no EIN matches)")
    print()

    # Step 6: Match to candidates
    print("Step 6: Matching solicitors to candidate registry ...", flush=True)
    match_to_candidates(stubs, SOL_RAW_CSV, CANDIDATES_CSV)
    print(f"  Done")
    print()

    # Step 7: Write output
    print("Step 7: Writing output ...", flush=True)
    write_output(stubs, OUTPUT_CSV)

    print("\n=== DONE ===")
    print(f"Output: {OUTPUT_CSV}")
    print(f"IRS cache: {IRS_EO_CSV}")
    print(f"ProPublica cache: {PP_CACHE_JSON}")
    print(
        "\nNext: Run 93_load_shadow_pacs_supabase.py to load results to Supabase."
    )
    return 0


if __name__ == "__main__":
    force = "--force" in sys.argv
    sys.exit(main(force=force))
