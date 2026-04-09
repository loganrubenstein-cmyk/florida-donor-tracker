# scripts/50_fetch_voting_records.py
"""
Script 50: Fetch FL legislator voting records from LegiScan and cross-reference
with campaign finance donors.

Uses LegiScan API to pull:
  - FL legislators for the 2 most recent regular sessions (2025, 2026)
  - Roll call votes for all bills in those sessions (floor votes only)
  - Per-legislator voting profiles

Then cross-references legislator names against our FL campaign finance data
to link "who funded this legislator" with "how did they vote."

LegiScan API: https://api.legiscan.com/
  - getSessionList?state=FL       → list of FL sessions
  - getSessionPeople?id={session} → FL legislators in a session
  - getMasterList?id={session}    → all bills in session
  - getBill?id={bill_id}          → bill detail including vote roll call IDs
  - getRollCall?id={roll_call_id} → individual vote by legislator

Rate limits: LegiScan API is generous but has per-day limits.
This script caches aggressively and is resumable.

Outputs:
  public/data/legislators/index.json              all FL legislators (current + recent)
  public/data/legislators/{people_id}.json        per-legislator profile + voting summary
  public/data/legislators/donor_crossref.json     legislators whose names appear in donor index
  public/data/legislators/votes/summary.json      overall voting statistics
  data/manifests/voting_records.json              cache of fetched bill/vote IDs

Usage (from project root, with .venv activated):
    python scripts/50_fetch_voting_records.py
"""

import json
import re
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent))
from config import PROJECT_ROOT

LEGISCAN_KEY = "30f2525a5f24b71c1ed2493e0d8499a0"
LEGISCAN_BASE = "https://api.legiscan.com/"

# Sessions to pull: 2025 regular + 2026 regular
TARGET_SESSIONS = [2135, 2220]   # 2025 Regular, 2026 Regular

OUT_DIR       = PROJECT_ROOT / "public" / "data" / "legislators"
VOTES_DIR     = OUT_DIR / "votes"
DATA_DIR      = PROJECT_ROOT / "public" / "data"
MANIFEST_FILE = PROJECT_ROOT / "data" / "manifests" / "voting_records.json"

REQUEST_DELAY = 0.5   # LegiScan is more generous than FEC

# Max bills per session to fetch full detail for (avoid blowing API quota)
# We focus on bills that actually got floor votes (status >= 4)
MAX_BILLS_PER_SESSION = 500

_STRIP_RE = re.compile(r"[^\w\s]")
_WS_RE    = re.compile(r"\s+")


def normalize(name: str) -> str:
    s = str(name).upper().strip()
    s = _STRIP_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    return s


def legiscan_get(session: requests.Session, op: str, **kwargs) -> dict:
    """Call LegiScan API with retry."""
    params = {"key": LEGISCAN_KEY, "op": op, **kwargs}
    for attempt in range(3):
        try:
            r = session.get(LEGISCAN_BASE, params=params, timeout=30)
            r.raise_for_status()
            data = r.json()
            if data.get("status") == "OK":
                return data
            if data.get("status") == "ERROR":
                print(f"  LegiScan error ({op}): {data.get('alert', {}).get('message', '?')}")
                return {}
            return data
        except Exception as e:
            print(f"  WARNING: {op} attempt {attempt+1}: {e}")
            time.sleep(3 * (attempt + 1))
    return {}


def load_manifest() -> dict:
    if MANIFEST_FILE.exists():
        return json.loads(MANIFEST_FILE.read_text())
    return {"fetched_bills": [], "fetched_votes": [], "last_run": None}


def save_manifest(manifest: dict) -> None:
    MANIFEST_FILE.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_FILE.write_text(json.dumps(manifest, indent=2))


def load_donor_index(data_dir: Path) -> dict[str, dict]:
    """Normalized name → donor for cross-referencing legislators."""
    path = data_dir / "donors" / "index.json"
    if not path.exists():
        return {}
    donors = json.loads(path.read_text())
    return {normalize(d["name"]): d for d in donors}


def load_candidate_stats(data_dir: Path) -> dict[str, dict]:
    """Normalized candidate name → candidate record."""
    path = data_dir / "candidate_stats.json"
    if not path.exists():
        return {}
    cands = json.loads(path.read_text())
    lookup = {}
    for c in cands:
        raw = c.get("candidate_name", "")
        lookup[normalize(raw)] = c
        if "," in raw:
            parts = raw.split(",", 1)
            flipped = normalize(f"{parts[1].strip()} {parts[0].strip()}")
            lookup[flipped] = c
    return lookup


def main() -> int:
    print("=== Script 50: Fetch FL Voting Records ===\n")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    VOTES_DIR.mkdir(parents=True, exist_ok=True)

    manifest = load_manifest()
    fetched_bills_set  = set(manifest.get("fetched_bills", []))
    fetched_votes_set  = set(manifest.get("fetched_votes", []))

    http = requests.Session()
    http.headers.update({"User-Agent": "FloridaDonorTracker/1.0"})

    # ── 1. Fetch legislators across target sessions ───────────────────────────
    print("1. Fetching FL legislators ...\n")
    all_people: dict[int, dict] = {}  # people_id → person dict
    people_by_session: dict[int, list[int]] = {}

    for session_id in TARGET_SESSIONS:
        data = legiscan_get(http, "getSessionPeople", id=session_id)
        people = data.get("sessionpeople", {}).get("people", [])
        print(f"   Session {session_id}: {len(people)} legislators")
        people_by_session[session_id] = []
        for p in people:
            pid = p["people_id"]
            if pid not in all_people:
                all_people[pid] = {
                    "people_id":    pid,
                    "name":         p.get("name", ""),
                    "first_name":   p.get("first_name", ""),
                    "last_name":    p.get("last_name", ""),
                    "party":        p.get("party", ""),
                    "role":         p.get("role", ""),          # "Rep" or "Sen"
                    "district":     p.get("district", ""),
                    "ballotpedia":  p.get("ballotpedia", ""),
                    "votesmart_id": p.get("votesmart_id", 0),
                    "sessions":     [],
                    "vote_counts":  {"yea": 0, "nay": 0, "nv": 0, "absent": 0},
                    "bills_voted":  [],
                }
            all_people[pid]["sessions"].append(session_id)
            people_by_session[session_id].append(pid)
        time.sleep(REQUEST_DELAY)

    print(f"\n   Total unique legislators across sessions: {len(all_people)}")

    # ── 2. Fetch bills and floor votes ────────────────────────────────────────
    print("\n2. Fetching bills and roll call votes ...\n")

    # Map people_id → vote history: list of {bill_id, bill_number, bill_title, vote_text, date}
    vote_history: dict[int, list[dict]] = {pid: [] for pid in all_people}

    total_roll_calls = 0
    total_bills_fetched = 0

    for session_id in TARGET_SESSIONS:
        print(f"   Session {session_id}:")
        master_data = legiscan_get(http, "getMasterList", id=session_id)
        masterlist = master_data.get("masterlist", {})
        bills = [v for k, v in masterlist.items()
                 if isinstance(v, dict) and v.get("bill_id")]
        # Focus on bills that passed or had significant votes (status >= 3)
        active_bills = [b for b in bills if b.get("status", 0) >= 3]
        print(f"   {len(bills)} total bills, {len(active_bills)} active/passed")
        time.sleep(REQUEST_DELAY)

        fetched_count = 0
        for bill in active_bills[:MAX_BILLS_PER_SESSION]:
            bill_id = bill["bill_id"]
            if bill_id in fetched_bills_set:
                continue  # already have this bill's votes

            bill_data = legiscan_get(http, "getBill", id=bill_id)
            if not bill_data:
                continue
            bill_detail = bill_data.get("bill", {})
            bill_number = bill_detail.get("number", "")
            bill_title  = bill_detail.get("title", "")[:80]
            votes_list  = bill_detail.get("votes", [])

            # Only floor votes (Third Reading or Final Vote)
            floor_votes = [
                v for v in votes_list
                if any(kw in v.get("desc", "").upper()
                       for kw in ["THIRD READING", "FINAL PASSAGE", "FLOOR", "PASSAGE", "RCS#", "READING RCS"])
            ]

            for vote_summary in floor_votes:
                rc_id = vote_summary.get("roll_call_id")
                if not rc_id or rc_id in fetched_votes_set:
                    continue

                rc_data = legiscan_get(http, "getRollCall", id=rc_id)
                if not rc_data:
                    continue
                roll_call = rc_data.get("roll_call", {})
                vote_date = roll_call.get("date", "")
                votes     = roll_call.get("votes", [])

                for v in votes:
                    pid = v.get("people_id")
                    vote_text = v.get("vote_text", "")
                    if pid in vote_history:
                        vote_history[pid].append({
                            "bill_id":     bill_id,
                            "bill_number": bill_number,
                            "bill_title":  bill_title,
                            "vote_text":   vote_text,
                            "date":        vote_date,
                            "roll_call_id": rc_id,
                        })
                        # Tally vote counts
                        vt_upper = vote_text.upper()
                        if "YEA" in vt_upper or "YES" in vt_upper or vt_upper == "Y":
                            all_people[pid]["vote_counts"]["yea"] += 1
                        elif "NAY" in vt_upper or "NO" in vt_upper or vt_upper == "N":
                            all_people[pid]["vote_counts"]["nay"] += 1
                        elif "ABSENT" in vt_upper:
                            all_people[pid]["vote_counts"]["absent"] += 1
                        else:
                            all_people[pid]["vote_counts"]["nv"] += 1

                fetched_votes_set.add(rc_id)
                total_roll_calls += 1
                time.sleep(REQUEST_DELAY)

            fetched_bills_set.add(bill_id)
            fetched_count += 1
            total_bills_fetched += 1
            time.sleep(REQUEST_DELAY)

            if fetched_count % 50 == 0:
                print(f"     ... {fetched_count} bills fetched, {total_roll_calls} roll calls", flush=True)
                save_manifest({
                    "fetched_bills": list(fetched_bills_set),
                    "fetched_votes": list(fetched_votes_set),
                    "last_run": time.strftime("%Y-%m-%dT%H:%M:%S"),
                })

        print(f"   Session {session_id} done: {fetched_count} new bills, {total_roll_calls} roll calls total")

    # ── 3. Cross-reference legislators with donors + candidates ──────────────
    print("\n3. Cross-referencing legislators with campaign finance data ...")
    donor_lookup = load_donor_index(DATA_DIR)
    cand_lookup  = load_candidate_stats(DATA_DIR)
    print(f"   {len(donor_lookup):,} donors, {len(cand_lookup):,} candidate variants")

    donor_crossref = []
    for pid, person in all_people.items():
        name = person["name"]
        last = person.get("last_name", "")
        norm_full = normalize(name)
        norm_last = normalize(last)

        # Check if this legislator appears as a candidate in our state data
        cand_match = cand_lookup.get(norm_full)
        if not cand_match and len(norm_last) > 3:
            # Try last-name search among candidates
            for k, c in cand_lookup.items():
                if norm_last and norm_last in k.split():
                    cand_match = c
                    break

        # Check if they appear as a donor
        donor_match = donor_lookup.get(norm_full)
        if not donor_match and len(norm_last) > 4:
            for k, d in donor_lookup.items():
                if k.endswith(norm_last) or k.startswith(norm_last):
                    donor_match = d
                    break

        if cand_match or donor_match:
            entry = {
                "people_id":   pid,
                "name":        name,
                "party":       person["party"],
                "role":        person["role"],
                "district":    person["district"],
                "vote_counts": person["vote_counts"],
            }
            if cand_match:
                entry["state_acct_num"]       = str(cand_match.get("acct_num", ""))
                entry["state_candidate_name"] = cand_match.get("candidate_name", "")
                entry["state_total_raised"]   = cand_match.get("hard_money_total", 0)
            if donor_match:
                entry["donor_slug"]       = donor_match.get("slug", "")
                entry["donor_total_gave"] = donor_match.get("total_combined", 0)
            donor_crossref.append(entry)

    donor_crossref.sort(key=lambda x: x.get("state_total_raised", 0), reverse=True)

    # ── 4. Write per-legislator JSON files ────────────────────────────────────
    print(f"\n4. Writing per-legislator JSON files ...")
    for pid, person in all_people.items():
        votes = vote_history.get(pid, [])
        # Sort by date descending, keep last 200 votes
        votes_sorted = sorted(votes, key=lambda v: v["date"], reverse=True)[:200]
        vc = person["vote_counts"]
        total_votes = sum(vc.values())
        payload = {
            "people_id":      pid,
            "name":           person["name"],
            "first_name":     person["first_name"],
            "last_name":      person["last_name"],
            "party":          person["party"],
            "role":           person["role"],
            "district":       person["district"],
            "ballotpedia":    person["ballotpedia"],
            "votesmart_id":   person["votesmart_id"],
            "sessions":       person["sessions"],
            "vote_counts":    vc,
            "participation_rate": round(
                (vc["yea"] + vc["nay"]) / total_votes, 3
            ) if total_votes > 0 else 0,
            "recent_votes":   votes_sorted,
        }
        (OUT_DIR / f"{pid}.json").write_text(
            json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
        )

    print(f"   Wrote {len(all_people)} legislator files")

    # ── 5. Write index + summary ──────────────────────────────────────────────
    index = []
    for pid, person in all_people.items():
        vc = person["vote_counts"]
        total = sum(vc.values())
        index.append({
            "people_id":   pid,
            "name":        person["name"],
            "party":       person["party"],
            "role":        person["role"],
            "district":    person["district"],
            "vote_counts": vc,
            "total_votes_cast": total,
        })
    index.sort(key=lambda x: x["total_votes_cast"], reverse=True)
    (OUT_DIR / "index.json").write_text(
        json.dumps(index, separators=(",", ":"), ensure_ascii=False)
    )
    print(f"   Wrote index.json ({len(index)} legislators)")

    (OUT_DIR / "donor_crossref.json").write_text(
        json.dumps(donor_crossref, separators=(",", ":"), ensure_ascii=False)
    )
    print(f"   Wrote donor_crossref.json ({len(donor_crossref)} matched legislators)")

    summary = {
        "total_legislators":  len(all_people),
        "total_bills_fetched": total_bills_fetched,
        "total_roll_calls":   total_roll_calls,
        "sessions_covered":   TARGET_SESSIONS,
        "donor_crossref_count": len(donor_crossref),
        "note": "Floor votes only (Third Reading / Final Passage). Committee votes excluded.",
        "generated_by": "scripts/50_fetch_voting_records.py",
    }
    (VOTES_DIR / "summary.json").write_text(json.dumps(summary, indent=2))
    print(f"\nWrote summary.json")
    print(json.dumps(summary, indent=2))

    save_manifest({
        "fetched_bills": list(fetched_bills_set),
        "fetched_votes": list(fetched_votes_set),
        "last_run": time.strftime("%Y-%m-%dT%H:%M:%S"),
    })

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
