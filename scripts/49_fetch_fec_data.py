# scripts/49_fetch_fec_data.py
"""
Script 49: Fetch FL candidate/committee data from FEC API and cross-reference
against our FL state-level data.

The FEC tracks federal-cycle fundraising for US Congress and Presidential races.
Many FL state political donors and committees also give to federal candidates.
This cross-reference reveals:
  - FL state donors who also gave federally (showing full political footprint)
  - FL state candidates who also ran for federal office
  - FL federal candidates whose local fundraising networks we can map

FEC API: https://api.open.fec.gov/v1/
  - candidates/?state=FL        → FL federal candidates
  - committees/?state=FL        → FL federal committees/PACs
  - schedules/schedule_a/       → individual contributions (by state)

Outputs:
  public/data/fec/fl_candidates.json       all FL federal candidates (name, office, party, cycles)
  public/data/fec/fl_committees.json       all FL federal PACs/committees
  public/data/fec/donor_crossref.json      FL state donors who also appear in FEC
  public/data/fec/candidate_crossref.json  FL state candidates who also ran federally
  data/manifests/fec_fetch.json            cache manifest (last fetched timestamps)

Usage (from project root, with .venv activated):
    python scripts/49_fetch_fec_data.py
"""

import json
import re
import sys
import time
from pathlib import Path

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

sys.path.insert(0, str(Path(__file__).parent))
from config import PROJECT_ROOT

FEC_API_KEY = "DEMO_KEY"   # swap for real key if rate-limits hit
FEC_BASE    = "https://api.open.fec.gov/v1"

OUT_DIR      = PROJECT_ROOT / "public" / "data" / "fec"
MANIFEST     = PROJECT_ROOT / "data" / "manifests" / "fec_fetch.json"
DATA_DIR     = PROJECT_ROOT / "public" / "data"

REQUEST_DELAY = 1.0   # polite throttle (DEMO_KEY limit: 1000/hour/IP)
PAGE_SIZE     = 100   # max per page for FEC API

_STRIP_RE = re.compile(r"[^\w\s]")
_WS_RE    = re.compile(r"\s+")
_SUFFIX_RE = re.compile(
    r"[,\.]?\s*(INC|LLC|CO|CORP|CORPORATION|LTD|LP|LLP|PA|PLLC|PC)\.?$",
    re.IGNORECASE,
)


def normalize(name: str) -> str:
    s = str(name).upper().strip()
    for _ in range(2):
        n = _SUFFIX_RE.sub("", s).strip()
        if n == s:
            break
        s = n
    s = _STRIP_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    return s


def fec_get(session: requests.Session, endpoint: str, params: dict) -> dict:
    """GET from FEC API with retry on 429."""
    params = {**params, "api_key": FEC_API_KEY}
    url = f"{FEC_BASE}/{endpoint}"
    for attempt in range(3):
        try:
            r = session.get(url, params=params, timeout=30, verify=False)
            if r.status_code == 429:
                wait = 60 * (attempt + 1)
                print(f"  Rate-limited (429). Waiting {wait}s ...")
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()
        except Exception as e:
            print(f"  WARNING: {endpoint} attempt {attempt+1}: {e}")
            time.sleep(5)
    return {}


def fetch_all_pages(session: requests.Session, endpoint: str, base_params: dict,
                    max_pages: int = 50) -> list[dict]:
    """Paginate through FEC results, return all items."""
    items = []
    page = 1
    while page <= max_pages:
        params = {**base_params, "page": page, "per_page": PAGE_SIZE}
        data = fec_get(session, endpoint, params)
        results = data.get("results", [])
        if not results:
            break
        items.extend(results)
        pagination = data.get("pagination", {})
        pages = pagination.get("pages", 1)
        print(f"    page {page}/{pages} → {len(results)} items", flush=True)
        if page >= pages:
            break
        page += 1
        time.sleep(REQUEST_DELAY)
    return items


def load_state_donors(data_dir: Path) -> dict[str, dict]:
    """Normalized name → donor record for cross-ref."""
    path = data_dir / "donors" / "index.json"
    if not path.exists():
        return {}
    donors = json.loads(path.read_text())
    return {normalize(d["name"]): d for d in donors}


def load_state_candidates(data_dir: Path) -> dict[str, dict]:
    """Normalized name → candidate record for cross-ref."""
    path = data_dir / "candidate_stats.json"
    if not path.exists():
        return {}
    cands = json.loads(path.read_text())
    out = {}
    for c in cands:
        raw = c.get("candidate_name", "")
        # FL stores as "LAST, FIRST" — normalize both orderings
        norm = normalize(raw)
        out[norm] = c
        # Also index by "FIRST LAST" if comma-delimited
        if "," in raw:
            parts = raw.split(",", 1)
            flipped = normalize(f"{parts[1].strip()} {parts[0].strip()}")
            out[flipped] = c
    return out


def main() -> int:
    print("=== Script 49: Fetch FEC Florida Data ===\n")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (PROJECT_ROOT / "data" / "manifests").mkdir(parents=True, exist_ok=True)

    manifest = {}
    if MANIFEST.exists():
        manifest = json.loads(MANIFEST.read_text())

    session = requests.Session()
    session.headers.update({"User-Agent": "FloridaDonorTracker/1.0"})

    # ── 1. FL Federal Candidates ─────────────────────────────────────────────
    print("1. Fetching FL federal candidates ...")
    cand_items = fetch_all_pages(
        session, "candidates/",
        {"state": "FL"},
        max_pages=30,
    )
    print(f"   → {len(cand_items):,} FL federal candidates")

    fl_candidates = []
    for c in cand_items:
        fl_candidates.append({
            "candidate_id":   c.get("candidate_id", ""),
            "name":           c.get("name", ""),
            "office":         c.get("office_full", ""),
            "party":          c.get("party_full", ""),
            "state":          c.get("state", ""),
            "district":       c.get("district", ""),
            "election_years": c.get("election_years", []),
            "incumbent_challenge": c.get("incumbent_challenge_full", ""),
            "principal_committees": [
                {"id": pc.get("committee_id"), "name": pc.get("name")}
                for pc in (c.get("principal_committees") or [])
            ],
        })

    (OUT_DIR / "fl_candidates.json").write_text(
        json.dumps(fl_candidates, separators=(",", ":"), ensure_ascii=False)
    )
    print(f"   Wrote fl_candidates.json ({len(fl_candidates)} records)")
    manifest["fl_candidates_fetched_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    time.sleep(REQUEST_DELAY)

    # ── 2. FL Federal Committees / PACs ──────────────────────────────────────
    print("\n2. Fetching FL federal committees/PACs ...")
    comm_items = fetch_all_pages(
        session, "committees/",
        {"state": "FL"},
        max_pages=30,
    )
    print(f"   → {len(comm_items):,} FL federal committees")

    fl_committees = []
    for c in comm_items:
        fl_committees.append({
            "committee_id":   c.get("committee_id", ""),
            "name":           c.get("name", ""),
            "committee_type": c.get("committee_type_full", ""),
            "party":          c.get("party_full", ""),
            "state":          c.get("state", ""),
            "city":           c.get("city", ""),
            "cycles":         c.get("cycles", []),
            "organization_type": c.get("organization_type_full", ""),
        })

    (OUT_DIR / "fl_committees.json").write_text(
        json.dumps(fl_committees, separators=(",", ":"), ensure_ascii=False)
    )
    print(f"   Wrote fl_committees.json ({len(fl_committees)} records)")
    manifest["fl_committees_fetched_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    time.sleep(REQUEST_DELAY)

    # ── 3. Cross-reference FL state donors against FEC candidates/committees ─
    print("\n3. Cross-referencing FL state donors against FEC data ...")
    state_donors = load_state_donors(DATA_DIR)
    print(f"   Loaded {len(state_donors):,} FL state donors")

    # Build FEC name lookup: normalized name → FEC candidate/committee record
    fec_cand_lookup: dict[str, dict] = {}
    for c in fl_candidates:
        norm = normalize(c["name"])
        fec_cand_lookup[norm] = c
        # Also try reversed (LAST, FIRST → FIRST LAST)
        if "," in c["name"]:
            parts = c["name"].split(",", 1)
            flipped = normalize(f"{parts[1].strip()} {parts[0].strip()}")
            fec_cand_lookup[flipped] = c

    fec_comm_lookup: dict[str, dict] = {}
    for c in fl_committees:
        norm = normalize(c["name"])
        fec_comm_lookup[norm] = c

    donor_crossref = []
    for norm_name, donor in state_donors.items():
        matches = []
        # Exact match against FEC candidates
        if norm_name in fec_cand_lookup:
            fc = fec_cand_lookup[norm_name]
            matches.append({
                "fec_type":     "candidate",
                "fec_id":       fc["candidate_id"],
                "fec_name":     fc["name"],
                "fec_office":   fc["office"],
                "fec_party":    fc["party"],
                "match_type":   "exact",
            })
        # Exact match against FEC committees
        if norm_name in fec_comm_lookup:
            fc = fec_comm_lookup[norm_name]
            matches.append({
                "fec_type":          "committee",
                "fec_id":            fc["committee_id"],
                "fec_name":          fc["name"],
                "fec_committee_type": fc["committee_type"],
                "match_type":        "exact",
            })
        # Substring match (long names only)
        if not matches and len(norm_name) >= 15:
            for fec_norm, fc in fec_comm_lookup.items():
                if len(fec_norm) >= 12 and (norm_name in fec_norm or fec_norm in norm_name):
                    matches.append({
                        "fec_type":          "committee",
                        "fec_id":            fc["committee_id"],
                        "fec_name":          fc["name"],
                        "fec_committee_type": fc["committee_type"],
                        "match_type":        "partial",
                    })
                    break

        if matches:
            donor_crossref.append({
                "state_name":       donor["name"],
                "state_slug":       donor.get("slug", ""),
                "state_total":      donor.get("total_combined", 0),
                "state_is_corporate": donor.get("is_corporate", False),
                "fec_matches":      matches,
            })

    donor_crossref.sort(key=lambda x: x["state_total"], reverse=True)
    (OUT_DIR / "donor_crossref.json").write_text(
        json.dumps(donor_crossref, separators=(",", ":"), ensure_ascii=False)
    )
    print(f"   {len(donor_crossref)} FL state donors cross-referenced with FEC")
    print(f"   Wrote donor_crossref.json")

    # ── 4. Cross-reference FL state candidates against FEC candidates ────────
    print("\n4. Cross-referencing FL state candidates against FEC candidates ...")
    state_cands = load_state_candidates(DATA_DIR)
    print(f"   Loaded {len(state_cands):,} FL state candidate name variants")

    cand_crossref = []
    seen_accts: set[str] = set()
    for norm_name, sc in state_cands.items():
        acct = str(sc.get("acct_num", ""))
        if acct in seen_accts:
            continue
        if norm_name in fec_cand_lookup:
            fc = fec_cand_lookup[norm_name]
            seen_accts.add(acct)
            cand_crossref.append({
                "state_acct_num":    acct,
                "state_name":        sc.get("candidate_name", ""),
                "state_office":      sc.get("office_desc", ""),
                "state_party":       sc.get("party_code", ""),
                "state_total":       sc.get("total_combined", sc.get("hard_money_total", 0)),
                "fec_candidate_id":  fc["candidate_id"],
                "fec_name":          fc["name"],
                "fec_office":        fc["office"],
                "fec_party":         fc["party"],
                "fec_election_years": fc.get("election_years", []),
            })

    cand_crossref.sort(key=lambda x: x.get("state_total", 0), reverse=True)
    (OUT_DIR / "candidate_crossref.json").write_text(
        json.dumps(cand_crossref, separators=(",", ":"), ensure_ascii=False)
    )
    print(f"   {len(cand_crossref)} FL state candidates cross-referenced with FEC")
    print(f"   Wrote candidate_crossref.json")

    # ── 5. Summary ────────────────────────────────────────────────────────────
    summary = {
        "fl_federal_candidates": len(fl_candidates),
        "fl_federal_committees": len(fl_committees),
        "donor_crossref_count":  len(donor_crossref),
        "candidate_crossref_count": len(cand_crossref),
        "note": "Candidate/committee names matched by normalized string. FEC DEMO_KEY used (1000 req/hr limit).",
        "generated_by": "scripts/49_fetch_fec_data.py",
    }
    (OUT_DIR / "summary.json").write_text(json.dumps(summary, indent=2))
    print(f"\nWrote summary.json")
    print(json.dumps(summary, indent=2))

    # Save manifest
    MANIFEST.write_text(json.dumps(manifest, indent=2))

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
