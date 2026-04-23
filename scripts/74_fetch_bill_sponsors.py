"""
scripts/74_fetch_bill_sponsors.py
---------------------------------
Extract bill sponsorship data from LegiScan getBill responses.

Uses the cached bill manifest from script 50 (voting_records.json) to
identify bills, then fetches getBill for each to extract sponsors[].

Creates table: bill_sponsorships

Usage:
    .venv/bin/python scripts/74_fetch_bill_sponsors.py
"""

import json
import os
import re
import time
from io import StringIO
from pathlib import Path

import psycopg2
import requests

_BILL_NUM_RE = re.compile(r'^([HS])0*(\d+)$')

def _bill_number_to_slug(bn):
    if not bn:
        return None
    m = _BILL_NUM_RE.match(str(bn).strip())
    if not m:
        return None
    prefix = 'hb' if m.group(1).upper() == 'H' else 'sb'
    return f"{prefix}-{m.group(2)}"


ROOT = Path(__file__).parent.parent
dotenv = ROOT / ".env.local"
for line in dotenv.read_text().split("\n"):
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

DB_URL = os.environ["SUPABASE_DB_URL"]
LEGISCAN_KEY = "30f2525a5f24b71c1ed2493e0d8499a0"
LEGISCAN_BASE = "https://api.legiscan.com/"
MANIFEST_FILE = ROOT / "data" / "manifests" / "voting_records.json"
BILL_CACHE_DIR = ROOT / "data" / "raw" / "bill_details"
REQUEST_DELAY = 0.5


def legiscan_get(session, op, **kwargs):
    params = {"key": LEGISCAN_KEY, "op": op, **kwargs}
    for attempt in range(3):
        try:
            r = session.get(LEGISCAN_BASE, params=params, timeout=30)
            r.raise_for_status()
            data = r.json()
            if data.get("status") == "OK":
                return data
            print(f"  LegiScan error ({op}): {data.get('alert', {}).get('message', '?')}")
            return {}
        except Exception as e:
            print(f"  WARNING: {op} attempt {attempt+1}: {e}")
            time.sleep(3 * (attempt + 1))
    return {}


def get_bill_cached(session, bill_id):
    """Fetch bill details with disk caching."""
    cache = BILL_CACHE_DIR / f"{bill_id}.json"
    if cache.exists():
        return json.loads(cache.read_text())

    time.sleep(REQUEST_DELAY)
    data = legiscan_get(session, "getBill", id=bill_id)
    bill = data.get("bill", {})
    if bill:
        BILL_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(bill))
    return bill


def main():
    print("=== Script 74: Fetch Bill Sponsorships from LegiScan ===\n")

    # Load bill manifest
    if not MANIFEST_FILE.exists():
        print("ERROR: No voting_records.json manifest found. Run script 50 first.")
        return

    manifest = json.loads(MANIFEST_FILE.read_text())
    bill_ids = manifest.get("fetched_bills", [])
    print(f"Bills in manifest: {len(bill_ids)}")

    # Get valid people_ids from legislators table
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()

    cur.execute("SELECT people_id FROM legislators WHERE people_id > 0")
    valid_pids = {r[0] for r in cur.fetchall()}
    print(f"Valid people_ids in legislators table: {len(valid_pids)}")

    # Create table
    cur.execute("DROP TABLE IF EXISTS bill_sponsorships")
    cur.execute("""
        CREATE TABLE bill_sponsorships (
            id           SERIAL PRIMARY KEY,
            people_id    INTEGER NOT NULL,
            bill_id      INTEGER NOT NULL,
            bill_number  TEXT,
            bill_slug    TEXT,
            bill_title   TEXT,
            sponsor_type TEXT,
            session_id   INTEGER,
            UNIQUE(people_id, bill_id, sponsor_type)
        )
    """)
    cur.execute("CREATE INDEX bs_people_idx ON bill_sponsorships (people_id)")
    cur.execute("CREATE INDEX bs_bill_idx ON bill_sponsorships (bill_id)")
    cur.execute("CREATE INDEX bs_bill_slug_idx ON bill_sponsorships (bill_slug)")

    # Fetch bills and extract sponsors
    http = requests.Session()
    http.headers.update({"User-Agent": "FloridaDonorTracker/1.0"})

    rows = []
    processed = 0
    cached_hits = 0
    api_calls = 0

    for bill_id in bill_ids:
        cache_path = BILL_CACHE_DIR / f"{bill_id}.json"
        if cache_path.exists():
            cached_hits += 1

        bill = get_bill_cached(http, bill_id)
        if not bill:
            continue

        processed += 1
        if not cache_path.exists():
            api_calls += 1

        bill_number = bill.get("bill_number", "")
        bill_title = (bill.get("title", "") or "")[:200]
        session_id = bill.get("session_id")
        sponsors = bill.get("sponsors", [])

        for sp in sponsors:
            people_id = sp.get("people_id")
            sponsor_type_id = sp.get("sponsor_type_id", 2)
            sponsor_type = "Primary" if sponsor_type_id == 1 else "Co-Sponsor"

            # Only include sponsors who are in our legislators table
            if people_id and people_id in valid_pids:
                rows.append((
                    people_id,
                    bill_id,
                    bill_number or None,
                    _bill_number_to_slug(bill_number),
                    bill_title or None,
                    sponsor_type,
                    session_id,
                ))

        if processed % 50 == 0:
            print(f"  Processed {processed}/{len(bill_ids)} bills, {len(rows)} sponsorships found (API calls: {api_calls})")

    print(f"\nProcessed: {processed} bills, {cached_hits} from cache, {api_calls} API calls")
    print(f"Sponsorship rows: {len(rows)}")

    if not rows:
        print("No sponsorships found. Verify LegiScan bills have sponsors[] data.")
        cur.close()
        conn.close()
        return

    # Deduplicate
    seen = set()
    deduped = []
    for r in rows:
        key = (r[0], r[1], r[5])
        if key not in seen:
            seen.add(key)
            deduped.append(r)
    print(f"After dedup: {len(deduped)} rows")

    # Bulk COPY
    buf = StringIO()
    for r in deduped:
        fields = [
            str(r[0]),
            str(r[1]),
            r[2] or "\\N",
            r[3] or "\\N",
            (r[4] or "").replace("\t", " ").replace("\n", " ") or "\\N",
            r[5],
            str(r[6]) if r[6] else "\\N",
        ]
        buf.write("\t".join(fields) + "\n")

    buf.seek(0)
    cur.copy_from(buf, "bill_sponsorships", columns=[
        "people_id", "bill_id", "bill_number", "bill_slug", "bill_title", "sponsor_type", "session_id",
    ])

    # Verify
    cur.execute("SELECT COUNT(*) FROM bill_sponsorships")
    total = cur.fetchone()[0]
    cur.execute("SELECT COUNT(DISTINCT people_id) FROM bill_sponsorships")
    unique_pids = cur.fetchone()[0]
    cur.execute("SELECT sponsor_type, COUNT(*) FROM bill_sponsorships GROUP BY sponsor_type")
    type_dist = cur.fetchall()

    print(f"\n=== Summary ===")
    print(f"  Total sponsorships:  {total:,}")
    print(f"  Unique legislators:  {unique_pids}")
    for st, ct in type_dist:
        print(f"    {st}: {ct:,}")

    cur.close()
    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
