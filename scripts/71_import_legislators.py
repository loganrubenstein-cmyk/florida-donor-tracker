"""
scripts/71_import_legislators.py
---------------------------------
Import LobbyTools CSV exports (House + Senate) into Supabase `legislators` table.

Cross-references:
  1. LegiScan people_id — from public/data/legislators/index.json
  2. Campaign finance — from politicians_canonical materialized view
  3. Donor records — from donors table

Creates table: legislators

Usage:
    .venv/bin/python scripts/71_import_legislators.py
"""

import csv
import json
import os
import re
from io import StringIO
from pathlib import Path

import psycopg2

ROOT = Path(__file__).parent.parent
dotenv = ROOT / ".env.local"
for line in dotenv.read_text().split("\n"):
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

DB_URL = os.environ["SUPABASE_DB_URL"]

HOUSE_CSV = Path.home() / "Downloads" / "lobbytool_export_house_reps.csv"
SENATE_CSV = Path.home() / "Downloads" / "lobbytool_export_senators.csv"
LEGISCAN_INDEX = ROOT / "public" / "data" / "legislators" / "index.json"

_STRIP_RE = re.compile(r"[^\w\s]")
_WS_RE = re.compile(r"\s+")


def normalize(name):
    s = str(name).upper().strip()
    s = _STRIP_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    return s


def extract_first_name(raw_first):
    """Extract usable first name from LobbyTools format.

    Handles: "Daniel Antonio ''Danny''" -> "Danny" (prefer nickname)
             "Shane G." -> "Shane"
             "Robert Alexander ''Alex''" -> "Alex"
    """
    if not raw_first or not raw_first.strip():
        return ""
    nickname = re.search(r"''([^']+)''", raw_first)
    if nickname:
        return nickname.group(1).strip()
    parts = raw_first.split()
    return parts[0].strip().rstrip(".") if parts else raw_first.strip()


def extract_last_name(raw_last):
    """Strip disambiguation suffix from LobbyTools last name.

    "Alvarez, D." -> "Alvarez"
    "Bracy Davis" -> "Bracy Davis"
    """
    return re.sub(r",\s*[A-Z]\.\s*$", "", raw_last).strip()


def parse_party(raw):
    """Normalize party: 'Rep' -> 'R', 'Dem' -> 'D'."""
    r = raw.strip()
    if r in ("Rep", "R"):
        return "R"
    if r in ("Dem", "D"):
        return "D"
    return r  # NPA, etc.


def parse_csv(path, chamber):
    """Parse a LobbyTools CSV into legislator dicts."""
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            raw_last = r["Last Name"].strip()
            raw_first = r["First Name"].strip()

            clean_last = extract_last_name(raw_last)
            clean_first = extract_first_name(raw_first)
            display_name = f"{clean_first} {clean_last}"

            district = int(r["District"].strip()) if r["District"].strip() else None

            counties = [c.strip() for c in r.get("Local Delegations", "").split(",") if c.strip()]

            district_office = {
                "street1": r.get("District Street 1", "").strip(),
                "street2": r.get("District Street 2", "").strip(),
                "city": r.get("District City", "").strip(),
                "state": r.get("District State", "").strip(),
                "zip": r.get("District Zip", "").strip(),
                "phone": r.get("District Phone", "").strip(),
            }

            capitol_office = {
                "street1": r.get("Capitol Street 1", "").strip(),
                "street2": r.get("Capitol Street 2", "").strip(),
                "city": r.get("Capitol City", "").strip(),
                "state": r.get("Capitol State", "").strip(),
                "zip": r.get("Capitol Zip", "").strip(),
                "phone": r.get("Capitol Phone", "").strip(),
            }

            staff_raw = r.get("Staff", "").strip()
            staff_emails = [s.strip() for s in re.split(r"[;,]", staff_raw) if s.strip()]

            terms_out = r.get("Terms Out", "").strip()
            term_limit_year = int(terms_out) if terms_out and terms_out.isdigit() else None

            twitter = r.get("Twitter", "").strip()
            if twitter and not twitter.startswith("@"):
                twitter = f"@{twitter}"

            rows.append({
                "raw_last": raw_last,
                "raw_first": raw_first,
                "first_name": clean_first,
                "last_name": clean_last,
                "display_name": display_name,
                "chamber": chamber,
                "party": parse_party(r.get("Party", "")),
                "district": district,
                "leadership_title": r.get("Leadership Title", "").strip() or None,
                "city": r.get("City of Residence", "").strip() or None,
                "counties": counties,
                "district_office": district_office,
                "capitol_office": capitol_office,
                "staff_emails": staff_emails,
                "email": r.get("Email Address", "").strip() or None,
                "twitter": twitter or None,
                "term_limit_year": term_limit_year,
            })
    return rows


_SUFFIX_RE = re.compile(r"\b(JR|SR|II|III|IV|V)\b\.?", re.IGNORECASE)


def strip_suffix(name):
    """Remove Jr, Sr, II, III, etc. from a name."""
    return _SUFFIX_RE.sub("", name).strip().rstrip(",").strip()


def match_legiscan(legislators, legiscan_index):
    """Match LobbyTools legislators to LegiScan people_ids.

    Strategy (in order):
      1. (norm_last, first3, chamber, district) — strict match
      2. (norm_last, chamber, district) — last name + location
      3. (last_word_of_last_name, chamber, district) — multi-word last names
      4. (chamber, district) — when exactly one LegiScan entry for that seat
    """
    # Build LegiScan lookups
    ls_strict = {}       # (norm_last, first3, chamber, district)
    ls_by_last = {}      # (norm_last, chamber, district)
    ls_by_lastword = {}  # (last_word, chamber, district)
    ls_by_seat = {}      # (chamber, district) -> [entries]

    for entry in legiscan_index:
        dist_str = entry.get("district", "")
        dist_match = re.search(r"(\d+)", dist_str)
        if not dist_match:
            continue
        dist_num = int(dist_match.group(1))
        chamber_code = "H" if entry["role"] == "Rep" else "S"

        raw_last = entry.get("last_name", entry["name"].split()[-1])
        raw_first = entry.get("first_name", entry["name"].split()[0])
        norm_last = normalize(strip_suffix(raw_last))
        norm_first = normalize(raw_first)
        first3 = norm_first[:3]
        last_word = normalize(raw_last.split()[-1])

        ls_strict[(norm_last, first3, chamber_code, dist_num)] = entry
        ls_by_last[(norm_last, chamber_code, dist_num)] = entry
        ls_by_lastword[(last_word, chamber_code, dist_num)] = entry

        seat = (chamber_code, dist_num)
        ls_by_seat.setdefault(seat, []).append(entry)

    matched = 0
    unmatched = []
    synthetic_id = -1

    for leg in legislators:
        if not leg["last_name"]:  # vacant seat
            leg["people_id"] = synthetic_id
            leg["ballotpedia"] = ""
            leg["votesmart_id"] = 0
            leg["sessions"] = []
            unmatched.append(f"  {leg['display_name'] or 'Vacant'} ({leg['chamber']} D-{leg['district']}) — vacant/empty")
            synthetic_id -= 1
            continue

        chamber_code = "H" if leg["chamber"] == "House" else "S"
        norm_last = normalize(strip_suffix(leg["last_name"]))
        norm_first = normalize(leg["first_name"])
        first3 = norm_first[:3]
        last_word = normalize(leg["last_name"].split()[-1])

        entry = (
            ls_strict.get((norm_last, first3, chamber_code, leg["district"]))
            or ls_by_last.get((norm_last, chamber_code, leg["district"]))
            or ls_by_lastword.get((last_word, chamber_code, leg["district"]))
        )

        # Fallback: unique seat match (only one LegiScan legislator for this chamber+district)
        if not entry:
            seat_entries = ls_by_seat.get((chamber_code, leg["district"]), [])
            if len(seat_entries) == 1:
                entry = seat_entries[0]

        if entry:
            leg["people_id"] = entry["people_id"]
            leg["ballotpedia"] = entry.get("ballotpedia", "")
            leg["votesmart_id"] = entry.get("votesmart_id", 0)
            leg["sessions"] = entry.get("sessions", [])
            matched += 1
        else:
            leg["people_id"] = synthetic_id
            leg["ballotpedia"] = ""
            leg["votesmart_id"] = 0
            leg["sessions"] = []
            unmatched.append(f"  {leg['display_name']} ({leg['chamber']} D-{leg['district']})")
            synthetic_id -= 1

    return matched, unmatched


def match_finance(cur, legislators):
    """Match legislators to campaign finance data via politicians_canonical view."""
    # Fetch all politicians_canonical rows for state-level offices
    cur.execute("""
        SELECT display_name, party, latest_office, latest_district,
               latest_acct_num, total_combined_all, latest_cycle
        FROM politicians_canonical
        WHERE latest_office ILIKE '%%representative%%'
           OR latest_office ILIKE '%%senator%%'
           OR latest_office ILIKE '%%senate%%'
           OR latest_office ILIKE '%%house%%'
        ORDER BY latest_cycle DESC
    """)
    pols = cur.fetchall()

    # Build lookup: (norm_last, district) -> best match
    pol_lookup = {}
    for p in pols:
        name, party, office, dist, acct, total, cycle = p
        norm_last = normalize(name.split()[-1]) if name else ""
        dist_num = None
        if dist:
            dm = re.search(r"(\d+)", str(dist))
            if dm:
                dist_num = int(dm.group(1))
        key = (norm_last, dist_num)
        if key not in pol_lookup:
            pol_lookup[key] = (acct, name, total)

    matched = 0
    for leg in legislators:
        norm_last = normalize(leg["last_name"])
        key = (norm_last, leg["district"])
        hit = pol_lookup.get(key)
        if hit:
            leg["acct_num"] = hit[0]
            leg["candidate_name"] = hit[1]
            leg["total_raised"] = hit[2]
            matched += 1
        else:
            leg["acct_num"] = None
            leg["candidate_name"] = None
            leg["total_raised"] = None

    return matched


def match_donors(cur, legislators):
    """Check if legislators also appear as donors."""
    cur.execute("SELECT slug, name, total_combined FROM donors ORDER BY total_combined DESC")
    donors = cur.fetchall()

    donor_lookup = {}
    for slug, name, total in donors:
        norm = normalize(name)
        if norm not in donor_lookup:
            donor_lookup[norm] = (slug, total)

    matched = 0
    for leg in legislators:
        norm = normalize(leg["display_name"])
        hit = donor_lookup.get(norm)
        if hit:
            leg["donor_slug"] = hit[0]
            matched += 1
        else:
            leg["donor_slug"] = None

    return matched


def load_to_supabase(cur, legislators):
    """Create table and bulk load via COPY."""
    cur.execute("DROP TABLE IF EXISTS committee_memberships")
    cur.execute("DROP TABLE IF EXISTS legislators CASCADE")
    cur.execute("""
        CREATE TABLE legislators (
            people_id         INTEGER PRIMARY KEY,
            first_name        TEXT NOT NULL,
            last_name         TEXT NOT NULL,
            display_name      TEXT NOT NULL,
            chamber           TEXT NOT NULL,
            party             TEXT,
            district          INTEGER,
            leadership_title  TEXT,
            city              TEXT,
            counties          TEXT[],
            district_office   JSONB,
            capitol_office    JSONB,
            staff_emails      TEXT[],
            email             TEXT,
            twitter           TEXT,
            term_limit_year   INTEGER,
            ballotpedia       TEXT,
            votesmart_id      INTEGER,
            acct_num          TEXT,
            total_raised      NUMERIC(15,2),
            donor_slug        TEXT,
            votes_yea         INTEGER DEFAULT 0,
            votes_nay         INTEGER DEFAULT 0,
            votes_nv          INTEGER DEFAULT 0,
            votes_absent      INTEGER DEFAULT 0,
            participation_rate NUMERIC(5,3),
            sessions          INTEGER[],
            term_label        TEXT DEFAULT '2024-2026',
            is_current        BOOLEAN DEFAULT TRUE
        )
    """)
    cur.execute("CREATE INDEX legislators_chamber_idx ON legislators (chamber)")
    cur.execute("CREATE INDEX legislators_party_idx ON legislators (party)")
    cur.execute("CREATE INDEX legislators_district_idx ON legislators (district)")
    cur.execute("CREATE INDEX legislators_acct_num_idx ON legislators (acct_num)")

    buf = StringIO()
    for leg in legislators:
        counties_pg = "{" + ",".join(f'"{c}"' for c in leg["counties"]) + "}" if leg["counties"] else "{}"
        staff_pg = "{" + ",".join(f'"{s}"' for s in leg["staff_emails"]) + "}" if leg["staff_emails"] else "{}"
        sessions_pg = "{" + ",".join(str(s) for s in leg.get("sessions", [])) + "}" if leg.get("sessions") else "{}"

        fields = [
            str(leg["people_id"]),
            leg["first_name"],
            leg["last_name"],
            leg["display_name"],
            leg["chamber"],
            leg.get("party") or "\\N",
            str(leg["district"]) if leg["district"] is not None else "\\N",
            leg.get("leadership_title") or "\\N",
            leg.get("city") or "\\N",
            counties_pg,
            json.dumps(leg["district_office"]),
            json.dumps(leg["capitol_office"]),
            staff_pg,
            leg.get("email") or "\\N",
            leg.get("twitter") or "\\N",
            str(leg["term_limit_year"]) if leg.get("term_limit_year") else "\\N",
            leg.get("ballotpedia") or "\\N",
            str(leg.get("votesmart_id") or 0),
            leg.get("acct_num") or "\\N",
            str(leg["total_raised"]) if leg.get("total_raised") is not None else "\\N",
            leg.get("donor_slug") or "\\N",
            "0", "0", "0", "0",  # vote counts (updated by script 75)
            "\\N",  # participation_rate
            sessions_pg,
            "2024-2026",
            "t",  # is_current
        ]
        # Escape tabs and newlines in text fields
        escaped = []
        for f in fields:
            escaped.append(f.replace("\t", " ").replace("\n", " ").replace("\r", ""))
        buf.write("\t".join(escaped) + "\n")

    buf.seek(0)
    cur.copy_from(buf, "legislators", columns=[
        "people_id", "first_name", "last_name", "display_name", "chamber",
        "party", "district", "leadership_title", "city", "counties",
        "district_office", "capitol_office", "staff_emails", "email", "twitter",
        "term_limit_year", "ballotpedia", "votesmart_id", "acct_num",
        "total_raised", "donor_slug",
        "votes_yea", "votes_nay", "votes_nv", "votes_absent",
        "participation_rate", "sessions", "term_label", "is_current",
    ])

    return len(legislators)


def main():
    print("=== Script 71: Import LobbyTools Legislators → Supabase ===\n")

    # 1. Parse CSVs
    print("1. Parsing LobbyTools CSVs ...")
    house = parse_csv(HOUSE_CSV, "House")
    senate = parse_csv(SENATE_CSV, "Senate")
    legislators = house + senate
    print(f"   House: {len(house)} | Senate: {len(senate)} | Total: {len(legislators)}")

    # 2. Match to LegiScan
    print("\n2. Matching to LegiScan people_ids ...")
    legiscan_index = json.loads(LEGISCAN_INDEX.read_text())
    ls_matched, ls_unmatched = match_legiscan(legislators, legiscan_index)
    print(f"   Matched: {ls_matched}/{len(legislators)} ({ls_matched*100//len(legislators)}%)")
    if ls_unmatched:
        print(f"   Unmatched ({len(ls_unmatched)}):")
        for u in ls_unmatched:
            print(u)

    # 3. Match to finance + donors
    print("\n3. Matching to campaign finance + donor records ...")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()

    fin_matched = match_finance(cur, legislators)
    print(f"   Finance matched: {fin_matched}/{len(legislators)} ({fin_matched*100//len(legislators)}%)")

    don_matched = match_donors(cur, legislators)
    print(f"   Donor matched: {don_matched}/{len(legislators)}")

    # 4. Load to Supabase
    print("\n4. Loading to Supabase ...")
    count = load_to_supabase(cur, legislators)
    print(f"   Loaded {count} rows into legislators table")

    # 5. Verify
    cur.execute("SELECT COUNT(*) FROM legislators")
    total = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM legislators WHERE chamber = 'House'")
    house_ct = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM legislators WHERE chamber = 'Senate'")
    senate_ct = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM legislators WHERE acct_num IS NOT NULL")
    finance_ct = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM legislators WHERE people_id > 0")
    legiscan_ct = cur.fetchone()[0]

    print(f"\n=== Summary ===")
    print(f"   Total:          {total}")
    print(f"   House:          {house_ct}")
    print(f"   Senate:         {senate_ct}")
    print(f"   LegiScan match: {legiscan_ct} ({legiscan_ct*100//total}%)")
    print(f"   Finance match:  {finance_ct} ({finance_ct*100//total}%)")

    # Show some leadership entries
    cur.execute("SELECT display_name, leadership_title FROM legislators WHERE leadership_title IS NOT NULL ORDER BY chamber, display_name")
    leaders = cur.fetchall()
    if leaders:
        print(f"\n   Leadership ({len(leaders)}):")
        for name, title in leaders:
            print(f"     {name} — {title}")

    cur.close()
    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
