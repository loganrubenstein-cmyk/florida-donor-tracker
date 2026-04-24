"""
scripts/40c_reload_principal_matches.py
---------------------------------------
Targeted reload of principal_donation_matches + principal_lobbyists from
public/data/principals/*.json. Mirrors script 40's load_principals() sidecar
INSERT loop but scoped to just the two downstream tables — no truncate of
donors, candidates, committees, etc. Used after re-running scripts 16+26 to
widen donor↔principal matches without touching the rest of the graph.

Usage:
    .venv/bin/python scripts/40c_reload_principal_matches.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

ROOT = Path(__file__).parent.parent
# .env.local exists locally but not in CI (where SUPABASE_DB_URL comes from
# repository secrets via the workflow env: block). Read the file only if
# present.
dotenv = ROOT / ".env.local"
if dotenv.exists():
    for line in dotenv.read_text().split("\n"):
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

DB_URL = os.environ.get("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("SUPABASE_DB_URL not set (need .env.local locally or env var in CI)")
PRIN_DIR = ROOT / "public" / "data" / "principals"


def main() -> int:
    print(f"Reading {PRIN_DIR}")
    pl_rows: list[tuple] = []
    pdm_rows: list[tuple] = []

    for fpath in PRIN_DIR.glob("*.json"):
        if fpath.name in ("index.json", "influence_index.json"):
            continue
        try:
            d = json.loads(fpath.read_text())
        except Exception:
            continue
        if not isinstance(d, dict):
            continue
        slug = d.get("slug", fpath.stem)
        for lob in d.get("lobbyists", []):
            lob_name = lob.get("lobbyist_name", "")
            # slugify keeps only alphanum + dashes; inline to avoid importing
            lob_slug = (
                "".join(c if c.isalnum() else "-" for c in lob_name.lower())
                .strip("-")
            )
            pl_rows.append((slug, lob_name, lob_slug,
                            lob.get("firm"), lob.get("branch"),
                            lob.get("is_active", False), lob.get("since")))
        for dm in d.get("donation_matches", []):
            pdm_rows.append((slug, dm.get("contributor_name"),
                             dm.get("match_score"), dm.get("total_donated"),
                             dm.get("num_contributions")))

    print(f"  {len(pl_rows):,} principal_lobbyist rows")
    print(f"  {len(pdm_rows):,} donation match rows")

    conn = psycopg2.connect(
        DB_URL,
        keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=5,
    )
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("SET statement_timeout = 0")

    print("\nTruncating principal_donation_matches + principal_lobbyists…")
    cur.execute("TRUNCATE principal_donation_matches")
    cur.execute("TRUNCATE principal_lobbyists")

    print("Inserting principal_lobbyists…")
    execute_values(cur, """
        INSERT INTO principal_lobbyists
          (principal_slug, lobbyist_name, lobbyist_slug, firm, branch, is_active, since)
        VALUES %s
    """, pl_rows, page_size=5000)

    print("Inserting principal_donation_matches…")
    execute_values(cur, """
        INSERT INTO principal_donation_matches
          (principal_slug, contributor_name, match_score, total_donated, num_contributions)
        VALUES %s
    """, pdm_rows, page_size=5000)

    cur.execute("SELECT COUNT(*) FROM principal_donation_matches")
    print(f"\nprincipal_donation_matches: {cur.fetchone()[0]:,} rows")
    cur.execute("SELECT COUNT(DISTINCT principal_slug) FROM principal_donation_matches")
    print(f"distinct principals with matches: {cur.fetchone()[0]:,}")

    cur.close()
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
