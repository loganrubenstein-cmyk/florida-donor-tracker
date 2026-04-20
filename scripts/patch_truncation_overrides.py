"""
Apply data/truncation_overrides.yaml to donor_entities.canonical_name and
insert full-name aliases pointing at the canonical slug.

Dry-run by default; pass --apply to write.

Re-runnable: script 09 uses ON CONFLICT (canonical_slug) DO NOTHING on
donor_entities and only updates donor_aliases when source='self'/'dedup_pipeline',
so these manual patches (source='manual_truncation_fix') survive re-runs.
"""
import os, sys
import yaml
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv(".env.local")
APPLY = "--apply" in sys.argv

with open("data/truncation_overrides.yaml") as f:
    cfg = yaml.safe_load(f)

fixes = cfg.get("fixes", {})
print(f"Mode: {'APPLY' if APPLY else 'DRY-RUN'}")
print(f"Truncation fixes to apply: {len(fixes)}")

conn = psycopg2.connect(os.getenv("SUPABASE_DB_URL"))
conn.autocommit = True
cur = conn.cursor()

# Preview
cur.execute("SELECT canonical_slug, canonical_name FROM donor_entities WHERE canonical_slug = ANY(%s)",
            (list(fixes.keys()),))
current = {s: n for s, n in cur.fetchall()}
print("\nSlug / current → full")
for slug, entry in fixes.items():
    cur_name = current.get(slug, "<MISSING>")
    print(f"  {slug}: {cur_name!r} → {entry['full']!r}")

if not APPLY:
    print("\nDry-run only. Re-run with --apply.")
    sys.exit(0)

# Update canonical_name
update_rows = [(e["full"], slug) for slug, e in fixes.items() if slug in current]
cur.executemany("UPDATE donor_entities SET canonical_name = %s WHERE canonical_slug = %s",
                update_rows)
print(f"\nUpdated {len(update_rows)} canonical_name rows")

# Insert full-name aliases (ON CONFLICT DO NOTHING — don't clobber existing)
alias_rows = [
    (e["full"].upper().strip(), e["full"], slug, "manual_merge", "approved")
    for slug, e in fixes.items() if slug in current
]
execute_values(cur, """
    INSERT INTO donor_aliases
      (alias_text, alias_text_display, canonical_slug, source, review_status)
    VALUES %s
    ON CONFLICT (alias_text) DO NOTHING
""", alias_rows)
print(f"Inserted {len(alias_rows)} aliases (ON CONFLICT DO NOTHING)")

print("\nDone. Refresh donors_mv next:")
print("  python3 scripts/refresh_donors_mv.py")
