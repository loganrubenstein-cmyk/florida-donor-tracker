"""
scripts/72_scrape_committees.py
---------------------------------
Scrape FL House + Senate legislative committee memberships.

House: Scrape member detail pages (committee list page returns 403).
  - Representatives listing -> get MemberIds
  - Each member page has "Current Committee Assignments" with committee links + roles

Senate: Scrape committee listing + detail pages.
  - /Committees -> list of all committees with abbreviations
  - /Committees/Show/{abbrev} -> members with Chair/Vice Chair roles

Creates tables: legislative_committees, committee_memberships

Usage:
    .venv/bin/python scripts/72_scrape_committees.py
"""

import os
import re
import time
from pathlib import Path

import psycopg2
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).parent.parent
dotenv = ROOT / ".env.local"
for line in dotenv.read_text().split("\n"):
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

DB_URL = os.environ["SUPABASE_DB_URL"]
CACHE_DIR = ROOT / "data" / "raw" / "committees"
DELAY = 1.5

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"

_STRIP_RE = re.compile(r"[^\w\s]")
_WS_RE = re.compile(r"\s+")


def normalize(name):
    s = str(name).upper().strip()
    s = _STRIP_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    return s


def get_session():
    s = requests.Session()
    s.headers.update({
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    })
    return s


def fetch_cached(session, url, cache_path):
    """Fetch URL with caching to disk."""
    if cache_path.exists():
        return cache_path.read_text(encoding="utf-8")
    time.sleep(DELAY)
    r = session.get(url, timeout=30)
    r.raise_for_status()
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(r.text, encoding="utf-8")
    return r.text


# ── House: scrape from member pages ──────────────────────────────────────────

def scrape_house_members_list(session):
    """Get all House member IDs from the representatives listing page."""
    cache = CACHE_DIR / "house" / "reps_listing.html"
    html = fetch_cached(session, "https://www.flhouse.gov/Sections/Representatives/representatives.aspx", cache)
    soup = BeautifulSoup(html, "html.parser")

    members = []
    for a in soup.find_all("a", href=lambda h: h and "MemberId=" in (h or "") and "LegislativeTermId" in (h or "")):
        href = a["href"]
        m = re.search(r"MemberId=(\d+)", href)
        t = re.search(r"LegislativeTermId=(\d+)", href)
        if m and t:
            members.append({
                "member_id": int(m.group(1)),
                "term_id": int(t.group(1)),
                "url": f"https://www.flhouse.gov{href}",
            })

    # Deduplicate by member_id
    seen = set()
    unique = []
    for mem in members:
        if mem["member_id"] not in seen:
            seen.add(mem["member_id"])
            unique.append(mem)
    return unique


def scrape_house_member_committees(session, member_id, term_id):
    """Scrape committee assignments from a House member detail page."""
    url = f"https://www.flhouse.gov/Sections/Representatives/details.aspx?MemberId={member_id}&LegislativeTermId={term_id}"
    cache = CACHE_DIR / "house" / "members" / f"{member_id}.html"
    html = fetch_cached(session, url, cache)
    soup = BeautifulSoup(html, "html.parser")

    # Extract member name from <title>: "First Last - 2024 - 2026 (Speaker X) | Florida House..."
    member_name = None
    if soup.title:
        t = soup.title.get_text(strip=True)
        if " | " in t:
            t = t.split(" | ")[0]
        if " - " in t:
            t = t.split(" - ")[0]
        t = t.strip()
        if t and "not" not in t.lower():
            member_name = t

    # Find committee assignments
    committees = []
    ul = soup.find("ul", class_="active-committees")
    if not ul:
        return member_name, committees

    for li in ul.find_all("li", class_="root-committee"):
        a = li.find("a")
        if not a:
            continue

        comm_name = a.get_text(strip=True)
        comm_href = a.get("href", "")
        comm_id_match = re.search(r"CommitteeId=(\d+)", comm_href)
        comm_id = int(comm_id_match.group(1)) if comm_id_match else None

        # Role from the bold span
        role = "Member"
        role_span = li.find("span", class_="textBoldI")
        if role_span:
            role_text = role_span.get_text(strip=True)
            if "Chair" in role_text and "Vice" not in role_text and "Ranking" not in role_text:
                role = "Chair"
            elif "Vice Chair" in role_text:
                role = "Vice Chair"
            elif "Ranking" in role_text or "Democratic Ranking" in role_text:
                role = "Ranking Member"

        committees.append({
            "name": comm_name,
            "committee_id": comm_id,
            "role": role,
        })

    return member_name, committees


def scrape_house(session, legislator_lookup):
    """Scrape all House committees from member pages."""
    print("\n── House Committees ────────────────────────────────────────────────")

    # Warm up session
    session.get("https://www.flhouse.gov/", timeout=30)
    time.sleep(DELAY)

    members = scrape_house_members_list(session)
    print(f"  Found {len(members)} House members")

    # Track committees discovered
    committees = {}  # committee_id -> {name, members: [{people_id, role}]}

    for i, mem in enumerate(members):
        member_name, comms = scrape_house_member_committees(session, mem["member_id"], mem["term_id"])

        # Match member to legislator by name
        people_id = None
        if member_name:
            norm = normalize(member_name)
            people_id = legislator_lookup.get(norm)
            if not people_id:
                # Try last word of name
                last = member_name.split()[-1] if member_name.split() else ""
                for key, pid in legislator_lookup.items():
                    if key.endswith(normalize(last)):
                        people_id = pid
                        break

        if not people_id and member_name:
            print(f"    WARNING: Could not match '{member_name}' to a legislator")

        for c in comms:
            cid = c["committee_id"]
            if cid not in committees:
                committees[cid] = {"name": c["name"], "members": []}
            if people_id:
                committees[cid]["members"].append({
                    "people_id": people_id,
                    "role": c["role"],
                })

        if (i + 1) % 20 == 0:
            print(f"  Processed {i+1}/{len(members)} members, {len(committees)} committees found")

    print(f"  Total: {len(committees)} House committees with {sum(len(c['members']) for c in committees.values())} memberships")
    return committees


# ── Senate: scrape committee pages directly ──────────────────────────────────

def scrape_senate_committee_list(session):
    """Get all Senate committee abbreviations from the committees listing."""
    cache = CACHE_DIR / "senate" / "committees_listing.html"
    html = fetch_cached(session, "https://www.flsenate.gov/Committees", cache)
    soup = BeautifulSoup(html, "html.parser")

    committees = []
    for a in soup.find_all("a", href=lambda h: h and "/Committees/Show/" in (h or "")):
        name = a.get_text(strip=True)
        href = a["href"]
        if not name or "Publication" in name:
            continue
        abbrev = href.rstrip("/").split("/")[-1]
        committees.append({
            "name": name,
            "abbreviation": abbrev,
            "url": f"https://www.flsenate.gov{href}",
        })

    # Deduplicate
    seen = set()
    unique = []
    for c in committees:
        if c["abbreviation"] not in seen:
            seen.add(c["abbreviation"])
            unique.append(c)
    return unique


def scrape_senate_committee_detail(session, abbrev, url, legislator_lookup):
    """Scrape members from a Senate committee detail page."""
    cache = CACHE_DIR / "senate" / f"{abbrev}.html"
    html = fetch_cached(session, url, cache)
    soup = BeautifulSoup(html, "html.parser")

    members = []

    # Find the members section
    members_div = soup.find("div", id="members")
    if not members_div:
        return members

    # Chair and Vice Chair from <dt>/<dd> pairs
    for dt in members_div.find_all("dt"):
        role_text = dt.get_text(strip=True).rstrip(":")
        dd = dt.find_next_sibling("dd")
        if not dd:
            continue
        a = dd.find("a")
        if not a:
            continue

        name_tag = a.find("name")
        name = name_tag.get_text(strip=True) if name_tag else a.get_text(strip=True)
        name = re.sub(r"^Senator\s+", "", name).strip()

        # Extract district from href /Senators/S{district}
        href = a.get("href", "")
        dist_match = re.search(r"/Senators/S(\d+)", href)
        district = int(dist_match.group(1)) if dist_match else None

        role = "Member"
        if "Chair" in role_text and "Vice" not in role_text:
            role = "Chair"
        elif "Vice" in role_text:
            role = "Vice Chair"

        people_id = legislator_lookup.get(normalize(name))
        if not people_id and district:
            # Fallback: match by district for senators
            for key, pid_data in legislator_lookup.items():
                if isinstance(pid_data, dict) and pid_data.get("district") == district:
                    people_id = pid_data["people_id"]
                    break

        members.append({"name": name, "people_id": people_id, "role": role})

    # Regular members from <ul><li>
    for li in members_div.find_all("li"):
        a = li.find("a")
        if not a:
            continue

        name_tag = a.find("name")
        name = name_tag.get_text(strip=True) if name_tag else a.get_text(strip=True)
        name = re.sub(r"^Senator\s+", "", name).strip()

        people_id = legislator_lookup.get(normalize(name))
        if not people_id:
            # Try just last name
            last = name.split()[-1] if name.split() else ""
            for key, pid in legislator_lookup.items():
                if isinstance(pid, int) and key.endswith(normalize(last)):
                    people_id = pid
                    break

        members.append({"name": name, "people_id": people_id, "role": "Member"})

    return members


def scrape_senate(session, legislator_lookup):
    """Scrape all Senate committees."""
    print("\n── Senate Committees ───────────────────────────────────────────────")

    committee_list = scrape_senate_committee_list(session)
    print(f"  Found {len(committee_list)} Senate committees")

    # Determine which are Joint vs Standing
    joint_names = {"JAPC", "JCPD", "JCA", "JSOCB", "JLBC"}

    results = {}
    for c in committee_list:
        members = scrape_senate_committee_detail(session, c["abbreviation"], c["url"], legislator_lookup)
        chamber = "Joint" if c["abbreviation"] in joint_names else "Senate"
        results[c["abbreviation"]] = {
            "name": c["name"],
            "chamber": chamber,
            "url": c["url"],
            "members": members,
        }
        matched = sum(1 for m in members if m["people_id"])
        print(f"  {c['abbreviation']:6s} {c['name'][:50]:50s} {len(members):2d} members ({matched} matched)")

    return results


# ── Database loading ─────────────────────────────────────────────────────────

def load_to_supabase(cur, house_committees, senate_committees, legislator_lookup):
    """Create tables and load committee data."""
    cur.execute("DROP TABLE IF EXISTS committee_memberships")
    cur.execute("DROP TABLE IF EXISTS legislative_committees CASCADE")

    cur.execute("""
        CREATE TABLE legislative_committees (
            abbreviation  TEXT PRIMARY KEY,
            name          TEXT NOT NULL,
            chamber       TEXT NOT NULL,
            url           TEXT,
            scraped_at    TIMESTAMPTZ DEFAULT NOW()
        )
    """)

    cur.execute("""
        CREATE TABLE committee_memberships (
            id            SERIAL PRIMARY KEY,
            people_id     INTEGER NOT NULL,
            abbreviation  TEXT NOT NULL,
            role          TEXT DEFAULT 'Member',
            UNIQUE(people_id, abbreviation)
        )
    """)
    cur.execute("CREATE INDEX cm_people_idx ON committee_memberships (people_id)")
    cur.execute("CREATE INDEX cm_abbrev_idx ON committee_memberships (abbreviation)")

    # Insert House committees
    house_count = 0
    house_mem_count = 0
    for cid, data in house_committees.items():
        abbrev = f"H-{cid}"
        cur.execute(
            "INSERT INTO legislative_committees (abbreviation, name, chamber, url) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
            (abbrev, data["name"], "House", f"https://www.flhouse.gov/Sections/Committees/committeesdetail.aspx?CommitteeId={cid}"),
        )
        house_count += 1
        for mem in data["members"]:
            if mem["people_id"]:
                cur.execute(
                    "INSERT INTO committee_memberships (people_id, abbreviation, role) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                    (mem["people_id"], abbrev, mem["role"]),
                )
                house_mem_count += 1

    # Insert Senate committees
    senate_count = 0
    senate_mem_count = 0
    for abbrev, data in senate_committees.items():
        full_abbrev = f"S-{abbrev}" if data["chamber"] == "Senate" else f"J-{abbrev}"
        cur.execute(
            "INSERT INTO legislative_committees (abbreviation, name, chamber, url) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
            (full_abbrev, data["name"], data["chamber"], data["url"]),
        )
        senate_count += 1
        for mem in data["members"]:
            if mem["people_id"]:
                cur.execute(
                    "INSERT INTO committee_memberships (people_id, abbreviation, role) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                    (mem["people_id"], full_abbrev, mem["role"]),
                )
                senate_mem_count += 1

    return house_count, house_mem_count, senate_count, senate_mem_count


def main():
    print("=== Script 72: Scrape FL Legislative Committees ===\n")

    # Build legislator lookup: normalized_name -> people_id
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()

    cur.execute("SELECT people_id, display_name, last_name, chamber, district FROM legislators")
    rows = cur.fetchall()

    legislator_lookup = {}
    for pid, display, last, chamber, district in rows:
        legislator_lookup[normalize(display)] = pid
        # Also add by last name + chamber for fallback
        legislator_lookup[normalize(last)] = pid

    print(f"Loaded {len(rows)} legislators for matching")

    session = get_session()

    # Scrape both chambers
    house = scrape_house(session, legislator_lookup)
    senate = scrape_senate(session, legislator_lookup)

    # Load to Supabase
    print("\n── Loading to Supabase ────────────────────────────────────────────")
    h_count, h_mem, s_count, s_mem = load_to_supabase(cur, house, senate, legislator_lookup)

    # Verify
    cur.execute("SELECT COUNT(*) FROM legislative_committees")
    total_committees = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM committee_memberships")
    total_memberships = cur.fetchone()[0]
    cur.execute("SELECT COUNT(DISTINCT people_id) FROM committee_memberships")
    unique_legislators = cur.fetchone()[0]

    print(f"\n=== Summary ===")
    print(f"  House committees:     {h_count} ({h_mem} memberships)")
    print(f"  Senate committees:    {s_count} ({s_mem} memberships)")
    print(f"  Total committees:     {total_committees}")
    print(f"  Total memberships:    {total_memberships}")
    print(f"  Unique legislators:   {unique_legislators}")

    # Show chairs
    cur.execute("""
        SELECT cm.abbreviation, lc.name, l.display_name, cm.role
        FROM committee_memberships cm
        JOIN legislative_committees lc ON lc.abbreviation = cm.abbreviation
        JOIN legislators l ON l.people_id = cm.people_id
        WHERE cm.role = 'Chair'
        ORDER BY lc.chamber, lc.name
    """)
    chairs = cur.fetchall()
    if chairs:
        print(f"\n  Committee Chairs ({len(chairs)}):")
        for abbrev, name, chair, role in chairs:
            print(f"    {abbrev:10s} {name[:45]:45s} {chair}")

    cur.close()
    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
