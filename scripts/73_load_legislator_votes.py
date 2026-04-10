"""
scripts/73_load_legislator_votes.py
---------------------------------
Load existing LegiScan vote data from static JSON files into Supabase.

Reads:  public/data/legislators/{people_id}.json  (226 files)
Creates table: legislator_votes

Usage:
    .venv/bin/python scripts/73_load_legislator_votes.py
"""

import json
import os
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
LEG_DIR = ROOT / "public" / "data" / "legislators"


def main():
    print("=== Script 73: Load Legislator Votes → Supabase ===\n")

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()

    # Create table
    cur.execute("DROP TABLE IF EXISTS legislator_votes")
    cur.execute("""
        CREATE TABLE legislator_votes (
            id           SERIAL PRIMARY KEY,
            people_id    INTEGER NOT NULL,
            bill_id      INTEGER NOT NULL,
            bill_number  TEXT,
            bill_title   TEXT,
            vote_text    TEXT,
            vote_date    DATE,
            roll_call_id INTEGER,
            session_id   INTEGER,
            UNIQUE(people_id, roll_call_id)
        )
    """)
    cur.execute("CREATE INDEX lv_people_idx ON legislator_votes (people_id)")
    cur.execute("CREATE INDEX lv_bill_idx ON legislator_votes (bill_id)")
    cur.execute("CREATE INDEX lv_date_idx ON legislator_votes (vote_date DESC NULLS LAST)")

    # Get valid people_ids from legislators table (to avoid FK issues)
    cur.execute("SELECT people_id FROM legislators")
    valid_pids = {r[0] for r in cur.fetchall()}
    print(f"Valid people_ids in legislators table: {len(valid_pids)}")

    # Read all legislator JSON files
    json_files = sorted(LEG_DIR.glob("*.json"))
    # Exclude non-profile files
    json_files = [f for f in json_files if f.name not in ("index.json", "donor_crossref.json")]

    print(f"JSON files to process: {len(json_files)}")

    rows = []
    legislators_with_votes = 0
    skipped_pids = 0

    for jf in json_files:
        try:
            data = json.loads(jf.read_text())
        except Exception as e:
            print(f"  WARNING: Could not read {jf.name}: {e}")
            continue

        people_id = data.get("people_id")
        if not people_id:
            continue

        # Only load votes for legislators in our table
        if people_id not in valid_pids:
            skipped_pids += 1
            continue

        sessions = data.get("sessions", [])
        votes = data.get("recent_votes", [])
        if not votes:
            continue

        legislators_with_votes += 1
        for v in votes:
            roll_call_id = v.get("roll_call_id")
            if not roll_call_id:
                continue

            bill_id = v.get("bill_id") or 0
            bill_number = (v.get("bill_number") or "").strip() or None
            bill_title = (v.get("bill_title") or "").strip() or None
            vote_text = v.get("vote_text", "")
            vote_date = v.get("date") or None
            # Determine session from sessions array (use first session as fallback)
            session_id = sessions[0] if sessions else None

            rows.append((
                people_id,
                bill_id,
                bill_number,
                bill_title,
                vote_text,
                vote_date,
                roll_call_id,
                session_id,
            ))

    print(f"Legislators with votes: {legislators_with_votes}")
    print(f"Skipped (not in legislators table): {skipped_pids}")
    print(f"Total vote rows: {len(rows)}")

    # Deduplicate by (people_id, roll_call_id)
    seen = set()
    deduped = []
    for r in rows:
        key = (r[0], r[6])  # (people_id, roll_call_id)
        if key not in seen:
            seen.add(key)
            deduped.append(r)
    print(f"After dedup: {len(deduped)} rows")

    # Bulk COPY
    print("\nLoading to Supabase...")
    buf = StringIO()
    for r in deduped:
        fields = [
            str(r[0]),                      # people_id
            str(r[1]),                      # bill_id
            r[2] or "\\N",                  # bill_number
            (r[3] or "")[:200].replace("\t", " ").replace("\n", " ") or "\\N",  # bill_title
            r[4] or "\\N",                  # vote_text
            str(r[5]) if r[5] else "\\N",   # vote_date
            str(r[6]),                      # roll_call_id
            str(r[7]) if r[7] else "\\N",   # session_id
        ]
        buf.write("\t".join(fields) + "\n")

    buf.seek(0)
    cur.copy_from(buf, "legislator_votes", columns=[
        "people_id", "bill_id", "bill_number", "bill_title",
        "vote_text", "vote_date", "roll_call_id", "session_id",
    ])

    # Verify
    cur.execute("SELECT COUNT(*) FROM legislator_votes")
    total = cur.fetchone()[0]
    cur.execute("SELECT COUNT(DISTINCT people_id) FROM legislator_votes")
    unique_pids = cur.fetchone()[0]
    cur.execute("SELECT vote_text, COUNT(*) FROM legislator_votes GROUP BY vote_text ORDER BY COUNT(*) DESC")
    vote_dist = cur.fetchall()

    print(f"\n=== Summary ===")
    print(f"  Total votes loaded:   {total:,}")
    print(f"  Unique legislators:   {unique_pids}")
    print(f"  Vote distribution:")
    for vt, ct in vote_dist:
        print(f"    {vt or 'NULL':10s}: {ct:,}")

    cur.close()
    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
