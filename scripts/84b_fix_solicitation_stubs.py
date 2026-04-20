"""
Fix solicitation-derived linkage edges that have no committee match.

For each distinct `pc_name` in `candidate_pc_edges` where source is a
solicitation filing and `pc_acct_num` is NULL, try fuzzy matching against
`committees.committee_name`. High-confidence matches (token_set_ratio >= 90
AND token_sort_ratio >= 85) get patched in-place. Unresolved stubs are
written to `data/logs/84b_unresolved_stubs.json` for manual review.

Safe to re-run. Dry-run by default; pass --apply to write.
"""
import os, sys, json, time
from pathlib import Path
import psycopg2
from psycopg2.extras import RealDictCursor, execute_values
from dotenv import load_dotenv
from thefuzz import fuzz

load_dotenv(".env.local")
APPLY = "--apply" in sys.argv
LOG_DIR = Path("data/logs"); LOG_DIR.mkdir(parents=True, exist_ok=True)
OUT_JSON = LOG_DIR / "84b_unresolved_stubs.json"

SCORE_SET  = 95
SCORE_SORT = 90

conn = psycopg2.connect(os.getenv("SUPABASE_DB_URL"), cursor_factory=RealDictCursor)
conn.autocommit = True
cur = conn.cursor()
cur.execute("SET statement_timeout='600s'")

print(f"Mode: {'APPLY' if APPLY else 'DRY-RUN'}", flush=True)

print("Loading distinct stub pc_names…", flush=True)
cur.execute("""
  SELECT pc_name, COUNT(*) AS n
  FROM candidate_pc_edges
  WHERE source_type IN ('solicitation_index','solicitation_csv')
    AND (pc_acct_num IS NULL OR pc_acct_num = '')
    AND is_publishable = true
  GROUP BY pc_name
  ORDER BY n DESC
""")
stubs = cur.fetchall()
print(f"  {len(stubs)} stub pc_names", flush=True)

print("Loading committee name index…", flush=True)
cur.execute("SELECT acct_num, committee_name FROM committees WHERE committee_name IS NOT NULL")
committees = cur.fetchall()
print(f"  {len(committees):,} committees", flush=True)

def best_match(name: str):
    best = None
    name_up = name.upper()
    for c in committees:
        cn = c["committee_name"].upper()
        s_set  = fuzz.token_set_ratio(name_up, cn)
        if s_set < SCORE_SET:
            continue
        s_sort = fuzz.token_sort_ratio(name_up, cn)
        if s_sort < SCORE_SORT:
            continue
        score = (s_set + s_sort) / 2
        if best is None or score > best["score"]:
            best = {"acct_num": c["acct_num"], "committee_name": c["committee_name"],
                    "score": score, "s_set": s_set, "s_sort": s_sort}
    return best

resolved, unresolved = [], []
for st in stubs:
    m = best_match(st["pc_name"])
    if m:
        resolved.append({
            "pc_name": st["pc_name"], "n_edges": st["n"],
            "acct_num": m["acct_num"], "matched_name": m["committee_name"],
            "score": round(m["score"], 1), "s_set": m["s_set"], "s_sort": m["s_sort"],
        })
    else:
        unresolved.append({"pc_name": st["pc_name"], "n_edges": st["n"]})

print(f"\nResolved: {len(resolved)}  Unresolved: {len(unresolved)}")
print("\n=== Resolved matches (top 30) ===")
for r in resolved[:30]:
    print(f"  {r['score']:>5.1f}  {r['pc_name'][:40]:<40} → #{r['acct_num']} {r['matched_name'][:40]}")

print("\n=== Unresolved (for manual review) ===")
for r in unresolved:
    print(f"  {r['n_edges']:>4}x  {r['pc_name']}")

OUT_JSON.write_text(json.dumps({
    "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "resolved": resolved,
    "unresolved": unresolved,
}, indent=2))
print(f"\nReport → {OUT_JSON}")

if not APPLY:
    print("\nDry-run only. Re-run with --apply to patch candidate_pc_edges.")
    sys.exit(0)

if not resolved:
    print("Nothing to apply.")
    sys.exit(0)

print(f"\nApplying {len(resolved)} patches…", flush=True)
t0 = time.time()
for r in resolved:
    cur.execute("""
      UPDATE candidate_pc_edges
      SET pc_acct_num = %s
      WHERE pc_name = %s
        AND source_type IN ('solicitation_index','solicitation_csv')
        AND (pc_acct_num IS NULL OR pc_acct_num = '')
        AND is_publishable = true
    """, (r["acct_num"], r["pc_name"]))
print(f"  done in {time.time()-t0:.1f}s", flush=True)
