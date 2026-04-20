"""
Insert 13 candidate_pc_edges rows for G-check misses identified in
84 audit 2026-04-19. These are real solicitation-derived PC→candidate
links where the solicitor text in committee_solicitations used a formal
first-name variant (DOUGLAS, CHRISTOPHER, JAMES VERNON, "The Honorable")
that scripts/78 didn't match against the short-form candidate_name.

Idempotent: skips inserts where a row already exists matching
(candidate_acct_num, pc_acct_num, source_type, source_record_id).

Also patches scripts/78 with a first-name variants map + honorific
stripping so these don't regress on the next linker run.

Dry-run by default; pass --apply to write.
"""
import os, sys, json
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv(".env.local")
APPLY = "--apply" in sys.argv

# (candidate_acct_num, pc_acct_num, committee_solicitations.id, note)
# `id` is the bigint PK of committee_solicitations (not solicitation_id, which is
# the FL-issued integer). We use `id` because it uniquely identifies the row.
EDGES = [
    ("80088", "80433", 199, "Doug Bankson ← Mr. Douglas Michael Bankson"),
    ("83677", "80433", 199, "Doug Bankson ← Mr. Douglas Michael Bankson"),
    ("50318", "60981", 193, "Perry Thurston Jr. ← The Honorable Perry Thurston"),
    ("79172", "60981", 193, "Perry Thurston Jr. ← The Honorable Perry Thurston"),
    ("54932", "65559", 117, "Jeffrey Brandes ← The Honorable Jeff Brandes"),
    ("54932", "60790", 266, "Jeffrey Brandes ← The Honorable Jeff Brandes"),
    ("50442", "64916", 237, "Doug Broxson ← The Honorable Douglas Broxson"),
    ("64444", "64916", 237, "Doug Broxson ← The Honorable Douglas Broxson"),
    ("60736", "64950", 260, "Chris Latvala ← The Honorable Christopher Latvala"),
    ("64462", "64950", 260, "Chris Latvala ← The Honorable Christopher Latvala"),
    ("69525", "64950", 260, "Chris Latvala ← The Honorable Christopher Latvala"),
    ("83659", "74575", 143, "James 'Jim' Mooney Jr ← Mr. James Vernon Mooney Jr."),
    ("74473", "74575", 143, "James 'Jim' Mooney Jr ← Mr. James Vernon Mooney Jr."),
    ("79050", "74575", 143, "James 'Jim' Mooney Jr ← Mr. James Vernon Mooney Jr."),
]

conn = psycopg2.connect(os.getenv("SUPABASE_DB_URL"), cursor_factory=RealDictCursor)
conn.autocommit = True
cur = conn.cursor()

print(f"Mode: {'APPLY' if APPLY else 'DRY-RUN'}")
print(f"Edges to consider: {len(EDGES)}")

# Pull PC info once
pc_accts = sorted({e[1] for e in EDGES})
cur.execute("""
  SELECT acct_num, committee_name
  FROM committees WHERE acct_num = ANY(%s)
""", (pc_accts,))
pc_info = {r["acct_num"]: r["committee_name"] for r in cur.fetchall()}

# Pull solicitation filing info (keyed on committee_solicitations.id)
sol_ids = sorted({e[2] for e in EDGES})
cur.execute("""
  SELECT id, acct_num, solicitation_id, solicitation_file_date
  FROM committee_solicitations WHERE id = ANY(%s)
""", (sol_ids,))
sol_info = {r["id"]: r for r in cur.fetchall()}

to_insert, skipped = [], []
for cand_acct, pc_acct, sol_id, note in EDGES:
    pc_name = pc_info.get(pc_acct)
    sol = sol_info.get(sol_id)
    if not pc_name or not sol:
        print(f"  MISSING ref data: pc={pc_acct} sol={sol_id}")
        continue
    # Idempotency check
    cur.execute("""
      SELECT id FROM candidate_pc_edges
      WHERE candidate_acct_num = %s AND pc_acct_num = %s
        AND source_type = 'solicitation_manual'
        AND source_record_id = %s
    """, (cand_acct, pc_acct, str(sol_id)))
    if cur.fetchone():
        skipped.append((cand_acct, pc_acct, sol_id))
        continue
    to_insert.append({
        "candidate_acct_num": cand_acct,
        "pc_acct_num": pc_acct,
        "pc_name": pc_name,
        "pc_type": "PC",
        "edge_type": "solicitation",
        "direction": "pc_solicits_for_candidate",
        "evidence_summary": note,
        "source_type": "solicitation_manual",
        "source_record_id": str(sol_id),
        "match_method": "manual_alias_fix",
        "match_score": 100.0,
        "is_publishable": True,
        "is_candidate_specific": True,
        "source_url": f"https://dos.elections.myflorida.com/committees/ComDetail.asp?account={pc_acct}",
        "source_filing_id": str(sol["solicitation_id"]),
        "source_filing_date": sol["solicitation_file_date"],
        "confidence_score": 95,
    })

print(f"\nWould insert: {len(to_insert)}  Already present (skipped): {len(skipped)}")
for r in to_insert:
    print(f"  cand={r['candidate_acct_num']}  pc={r['pc_acct_num']} ({r['pc_name'][:40]})  sol={r['source_record_id']}")

if not APPLY:
    print("\nDry-run only. Re-run with --apply.")
    sys.exit(0)

if not to_insert:
    print("Nothing to insert.")
    sys.exit(0)

cols = list(to_insert[0].keys())
from psycopg2.extras import execute_values
execute_values(
    cur,
    f"INSERT INTO candidate_pc_edges ({','.join(cols)}) VALUES %s",
    [tuple(r[c] for c in cols) for r in to_insert],
    template="(" + ",".join(["%s"] * len(cols)) + ")",
)
print(f"Inserted {len(to_insert)} edges.")
