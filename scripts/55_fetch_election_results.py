# scripts/55_fetch_election_results.py
"""
Script 55: Fetch FL election results (2022 + 2024 general elections) and
cross-reference with candidate campaign finance data.

Downloads precinct-level election results from the FL Division of Elections
and produces candidate-level totals, winner/loser status, and spending
efficiency metrics ($ per vote for candidates in our database).

Source files:
  2024 gen: https://dos.myflorida.com/media/708761/2024-gen-outputofficial1.zip
  2022 gen: https://dos.myflorida.com/media/706300/2022-gen-outputofficial.zip

Record format (tab-separated):
  County_Code, County_Name, Precinct_ID, Date, Election_Name, Contest_Code,
  Precinct_Name, Registered_Voters, Election_Day, Early_Voting,
  Absentee, Contest_Name, Amendment_Name, Candidate_ID, Candidate_Name,
  Party, Write_In, Candidate_Total, Candidate_Precinct_Total

Outputs:
  public/data/elections/2024_general.json    candidate totals + finance crossref
  public/data/elections/2022_general.json
  public/data/elections/summary.json         races where we have finance data

Usage (from project root, with .venv activated):
    python scripts/55_fetch_election_results.py
"""

import io
import json
import re
import sys
import time
import zipfile
from pathlib import Path

import pandas as pd
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

sys.path.insert(0, str(Path(__file__).parent))
from config import PROJECT_ROOT

DATA_DIR = PROJECT_ROOT / "public" / "data"
RAW_DIR  = PROJECT_ROOT / "data" / "raw" / "election_results"
OUT_DIR  = DATA_DIR / "elections"

BASE = "https://dos.fl.gov"

ELECTIONS = [
    # General elections (most useful — statewide races, gubernatorial, US Senate)
    {"year": 2024, "type": "general", "name": "2024 General Election",
     "url": "https://dos.myflorida.com/media/708761/2024-gen-outputofficial1.zip"},
    {"year": 2024, "type": "primary", "name": "2024 Primary Election",
     "url": BASE + "/media/708691/2024-pri-outputofficial.zip"},
    {"year": 2022, "type": "general", "name": "2022 General Election",
     "url": "https://dos.myflorida.com/media/706300/2022-gen-outputofficial.zip"},
    {"year": 2022, "type": "primary", "name": "2022 Primary Election",
     "url": BASE + "/media/707057/enightprecinctfiles2022_pri.zip"},
    {"year": 2020, "type": "general", "name": "2020 General Election",
     "url": "https://fldoswebumbracoprod.blob.core.windows.net/media/703763/2020-general-election-rev.zip"},
    {"year": 2020, "type": "primary", "name": "2020 Primary Election",
     "url": BASE + "/media/703721/2020-pe-precinct-level-election-results-corrected-12-2020.zip"},
    {"year": 2018, "type": "general", "name": "2018 General Election",
     "url": BASE + "/media/700501/precinctlevelelectionresults2018gen.zip"},
    {"year": 2018, "type": "primary", "name": "2018 Primary Election",
     "url": BASE + "/media/700241/precinctlevelelectionresults2018pri.zip"},
    {"year": 2016, "type": "general", "name": "2016 General Election",
     "url": BASE + "/media/697454/precinctlevelelectionresults2016gen.zip"},
    {"year": 2016, "type": "primary", "name": "2016 Primary Election",
     "url": BASE + "/media/697202/precinctlevelelectionresults2016pri.zip"},
    {"year": 2014, "type": "general", "name": "2014 General Election",
     "url": BASE + "/media/697201/precinctlevelelectionresults2014gen.zip"},
    {"year": 2012, "type": "general", "name": "2012 General Election",
     "url": BASE + "/media/697204/precinctlevelelectionresults2012gen.zip"},
]

# Column names for FL precinct result format
COLS = [
    "county_code", "county_name", "precinct_id", "date", "election_name",
    "contest_code", "precinct_name", "registered_voters", "election_day",
    "early_voting", "absentee", "contest_name", "amendment_name",
    "candidate_id", "candidate_name", "party", "write_in",
    "candidate_total", "candidate_precinct_total",
]

_STRIP_RE = re.compile(r"[^\w\s]")
_WS_RE    = re.compile(r"\s+")


def normalize(name: str) -> str:
    s = str(name).upper().strip()
    s = _STRIP_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    return s


def download_and_parse(url: str, year: int, election_type: str = "general") -> pd.DataFrame | None:
    """Download ZIP, concatenate all county TXT files, return DataFrame."""
    cache_path = RAW_DIR / f"{year}_{election_type}.parquet"
    if cache_path.exists():
        print(f"  Loading cached {year} results ...")
        return pd.read_parquet(cache_path)

    print(f"  Downloading {year} results from {url} ...")
    try:
        r = requests.get(url, timeout=120, verify=False,
                         headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
    except Exception as e:
        print(f"  ERROR: {e}")
        return None

    print(f"  Downloaded {len(r.content):,} bytes. Parsing ...")
    z = zipfile.ZipFile(io.BytesIO(r.content))
    frames = []
    for fname in z.namelist():
        if not fname.endswith(".txt") or "recount" in fname.lower():
            continue
        try:
            content = z.read(fname).decode("latin-1", errors="replace")
            df = pd.read_csv(
                io.StringIO(content), sep="\t", header=None, names=COLS,
                dtype=str, on_bad_lines="skip",
            )
            frames.append(df)
        except Exception as e:
            print(f"    WARNING: {fname}: {e}")

    if not frames:
        return None

    combined = pd.concat(frames, ignore_index=True)
    for col in ["registered_voters", "election_day", "early_voting",
                 "absentee", "candidate_total", "candidate_precinct_total"]:
        combined[col] = pd.to_numeric(combined[col], errors="coerce").fillna(0)

    # Cache to parquet for faster re-runs
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    combined.to_parquet(cache_path, index=False)
    print(f"  Parsed {len(combined):,} rows, cached to {cache_path.name}")
    return combined


def load_candidate_finance(data_dir: Path) -> dict[str, dict]:
    """Normalized candidate name → {acct_num, total_raised, office, party}."""
    path = data_dir / "candidate_stats.json"
    if not path.exists():
        return {}
    cands = json.loads(path.read_text())
    lookup = {}
    for c in cands:
        raw = c.get("candidate_name", "")
        norm_full = normalize(raw)
        record = {
            "acct_num":    str(c.get("acct_num", "")),
            "name":        raw,
            "office":      c.get("office_desc", ""),
            "party":       c.get("party_code", ""),
            "total_raised": c.get("total_combined", 0) or 0,
            "election_year": c.get("election_year", 0) or 0,
        }
        lookup[norm_full] = record
        # Also index FIRST LAST for comma-delimited names
        if "," in raw:
            parts = raw.split(",", 1)
            flipped = normalize(f"{parts[1].strip()} {parts[0].strip()}")
            lookup[flipped] = record
    return lookup


def _build_race_clusters(df: pd.DataFrame) -> dict:
    """Cluster candidates into real races via union-find on precinct co-occurrence.

    FL precinct data labels many contests ambiguously (e.g. *all* 28 US House
    races are labeled just "Representative in Congress" — no district number).
    Grouping by contest_name alone merges distinct races and picks only one
    winner across all of them.

    Fix: two candidates are in the same race iff they appear together in the
    same (county_code, precinct_id, contest_name) group. Union-find those
    pairings to get connected components = real races.

    Returns: {(contest_name, candidate_name, party) -> race_id (int)}
    """
    parent = {}
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    # Candidate key = (contest_name, candidate_name, party). init each to itself.
    keys = df[["contest_name", "candidate_name", "party"]].drop_duplicates()
    for _, r in keys.iterrows():
        k = (r["contest_name"], r["candidate_name"], r["party"])
        parent[k] = k

    # Group by precinct+contest; within each group, union all candidates together.
    for _, sub in df.groupby(["county_code", "precinct_id", "contest_name"], sort=False):
        cands = sub[["contest_name", "candidate_name", "party"]].drop_duplicates()
        if len(cands) < 2:
            continue
        first = (cands.iloc[0]["contest_name"], cands.iloc[0]["candidate_name"], cands.iloc[0]["party"])
        for _, r in cands.iloc[1:].iterrows():
            union(first, (r["contest_name"], r["candidate_name"], r["party"]))

    # Assign sequential race ids to connected components.
    roots = {}
    race_id = {}
    next_id = 0
    for k in parent:
        root = find(k)
        if root not in roots:
            roots[root] = next_id
            next_id += 1
        race_id[k] = roots[root]
    return race_id


def process_election(df: pd.DataFrame, year: int, cand_finance: dict) -> dict:
    """Aggregate to candidate-level totals and cross-reference with finance."""
    print(f"  Processing {year} results: {len(df):,} rows")

    for col in ["contest_name", "candidate_name", "party"]:
        df[col] = df[col].fillna("").astype(str).str.strip()

    race_id = _build_race_clusters(df)

    deduped = (
        df.groupby(["contest_name", "candidate_name", "party"])["candidate_precinct_total"]
        .sum()
        .reset_index()
        .rename(columns={"candidate_precinct_total": "total_votes"})
    )
    deduped["race_id"] = deduped.apply(
        lambda r: race_id.get((r["contest_name"], r["candidate_name"], r["party"]), -1),
        axis=1,
    )

    deduped["rank"] = (
        deduped.groupby("race_id")["total_votes"]
        .rank(method="first", ascending=False)
    )
    deduped["winner"] = deduped["rank"] == 1.0
    print(f"  clustered into {deduped['race_id'].nunique()} distinct races "
          f"(prior method: {deduped['contest_name'].nunique()} contest_names)")

    # Cross-reference with campaign finance
    results = []
    matched = 0
    for _, row in deduped.iterrows():
        raw_name = str(row["candidate_name"])
        norm_name = normalize(raw_name)
        finance = cand_finance.get(norm_name)
        # For "LAST / RUNNING_MATE" format (governor/Lt. Gov races), try just the first part
        if not finance and "/" in raw_name:
            first_part = normalize(raw_name.split("/")[0].strip())
            finance = cand_finance.get(first_part)
            # Also try reversed "FIRST LAST" format
            if not finance:
                parts = first_part.split()
                if len(parts) >= 2:
                    flipped = " ".join(reversed(parts))
                    finance = cand_finance.get(flipped)

        entry: dict = {
            "contest_name":   str(row["contest_name"]),
            "race_id":        int(row["race_id"]),
            "candidate_name": raw_name,
            "party":          str(row["party"]),
            "total_votes":    int(row["total_votes"]),
            "winner":         bool(row["winner"]),
        }
        if finance:
            entry["finance_acct_num"]     = finance["acct_num"]
            entry["finance_total_raised"] = round(finance["total_raised"], 2)
            entry["office_desc"]          = finance["office"]
            if row["total_votes"] > 0 and finance["total_raised"] > 0:
                entry["cost_per_vote"] = round(finance["total_raised"] / row["total_votes"], 2)
            matched += 1
        results.append(entry)

    print(f"  Cross-referenced {matched}/{len(results)} candidates with finance data")

    # Sort by contest name + votes
    results.sort(key=lambda x: (x["contest_name"], -x["total_votes"]))
    return {"year": year, "candidates": results, "total_candidates": len(results),
            "finance_matched": matched}


def main() -> int:
    print("=== Script 55: Fetch FL Election Results ===\n")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    cand_finance = load_candidate_finance(DATA_DIR)
    print(f"Loaded {len(cand_finance):,} candidate finance records\n")

    http = requests.Session()
    all_summaries = []

    for election in ELECTIONS:
        year      = election["year"]
        etype     = election.get("type", "general")
        ename     = election["name"]
        print(f"Processing {ename} ...")
        df = download_and_parse(election["url"], year, etype)
        if df is None:
            print(f"  Skipping {ename} — no data")
            continue

        result = process_election(df, year, cand_finance)
        out_path = OUT_DIR / f"{year}_{etype}.json"
        out_path.write_text(
            json.dumps(result, separators=(",", ":"), ensure_ascii=False)
        )
        print(f"  Wrote {out_path.name} ({result['total_candidates']:,} candidates, {result['finance_matched']} finance-matched)")

        # Build a "races with finance data" summary for this election
        # Find races where at least one candidate has finance data
        candidates = result["candidates"]
        races: dict[int, dict] = {}
        for c in candidates:
            cc = c["race_id"]  # key by clustered race id, not contest_name
            if cc not in races:
                races[cc] = {
                    "contest_name": c["contest_name"],
                    "race_id":      c["race_id"],
                    "candidates":   [],
                    "has_finance":  False,
                }
            entry = {
                "candidate_name": c["candidate_name"],
                "party":          c["party"],
                "total_votes":    c["total_votes"],
                "winner":         c["winner"],
            }
            if "finance_total_raised" in c:
                entry["total_raised"] = c["finance_total_raised"]
                entry["cost_per_vote"] = c.get("cost_per_vote", 0)
                entry["finance_acct_num"] = c["finance_acct_num"]
                races[cc]["has_finance"] = True
            races[cc]["candidates"].append(entry)

        # Sort candidates within each race by votes
        for race in races.values():
            race["candidates"].sort(key=lambda x: -x["total_votes"])

        # Filter to races with finance data
        finance_races = [r for r in races.values() if r["has_finance"]]
        finance_races.sort(
            key=lambda x: max(c.get("total_raised", 0) for c in x["candidates"]),
            reverse=True,
        )

        all_summaries.append({
            "year":             year,
            "election_type":    etype,
            "election_name":    ename,
            "total_contests":   len(races),
            "contests_with_finance": len(finance_races),
            "finance_races_top50": finance_races[:50],
        })

        time.sleep(2)

    # Write summary
    (OUT_DIR / "summary.json").write_text(json.dumps(all_summaries, indent=2))
    print(f"\nWrote elections/summary.json")
    for s in all_summaries:
        print(f"  {s['election_name']}: {s['total_contests']} contests, {s['contests_with_finance']} with finance data")

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
