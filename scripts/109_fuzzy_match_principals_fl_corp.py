#!/usr/bin/env python3
"""
Grow principal_addresses by fuzzy-matching principals.name → fl_corporations.entity_name.

Current state (pre-run): only the 299 principals whose name matches an
fl_corp entity_name byte-for-byte (UPPER) have addresses seeded. This leaves
the vast majority of registered lobbying principals with no corporate
identity link — Florida Power & Light Company is exact-matched, but
"Florida Power and Light Company" (no ampersand) would not be.

Approach:
  1. Stream fl_corporations (3.9M rows) into an in-memory inverted index
     keyed on significant tokens of a normalized entity_name. Same
     normalization as scripts/16_match_principals.py (strip legal suffixes,
     collapse punctuation) plus the full-form fallback key so short names
     (AT&T, 3M, BP) enter the candidate pool.
  2. For each principal, look up candidates via the token index, score with
     rapidfuzz token_set_ratio, keep score >= MATCH_THRESHOLD.
  3. Write matched principals' addresses into principal_addresses.

This ADDS rows to principal_addresses; it does not truncate. Re-running is
idempotent via ON CONFLICT DO NOTHING on the primary key
(principal_slug, street_num, zip).

Runtime: ~3-5 minutes. Memory: ~600 MB peak for the fl_corp index.
"""
from __future__ import annotations
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values
from rapidfuzz import fuzz

ROOT = Path(__file__).resolve().parent.parent
env = ROOT / ".env.local"
if env.exists():
    for line in env.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

# Mirrors scripts/16_match_principals.py
_SUFFIXES = re.compile(
    r"\b(INC|LLC|LLP|CORP|CO|LTD|PA|PLLC|PC|NA|NV|SA|AG|PLC|"
    r"INCORPORATED|CORPORATION|COMPANY|LIMITED|ASSOCIATES|ASSOCIATION|"
    r"ASSOCIATION OF|AUTHORITY|COMMITTEE|COUNCIL|FOUNDATION|"
    r"GROUP|HOLDINGS|INDUSTRIES|INTERNATIONAL|MANAGEMENT|PARTNERS|"
    r"PARTNERSHIP|PROPERTIES|SERVICES|SOLUTIONS|SYSTEMS|TECHNOLOGIES|"
    r"TECHNOLOGY|TRUST|VENTURES|US|USA|U\.?S\.?A?)\b",
    re.IGNORECASE,
)
_PUNCT = re.compile(r"[^\w\s]")
_SPACE = re.compile(r"\s+")
_STOPWORDS = {
    "AND", "OF", "THE", "FOR", "IN", "AT", "BY", "TO", "A", "AN",
    "FL", "FLORIDA", "STATE", "NATIONAL", "AMERICAN",
}
_MIN_TOKEN_LEN = 3
_FULL_PREFIX = "__FULL__:"

MATCH_THRESHOLD = 100  # Exact normalized-form equality only. Script 16 ran at
                       # 82 against contribution names because donors use highly
                       # variant spellings; the corp registry is the opposite —
                       # variants are already represented as separate rows, so
                       # fuzzy matches pull in unrelated corps whose normalized
                       # form happens to overlap on one token (e.g. "POWER
                       # SOLUTIONS GROUP INC." → "POWER" ← "FLORIDA POWER &
                       # LIGHT COMPANY" after stripping suffixes). Exact
                       # equality is the right bar here.

STREET_NUM_RE = re.compile(r"^\s*(\d+)")


def normalize(name: str) -> str:
    s = str(name or "").upper()
    s = _PUNCT.sub(" ", s)
    s = _SUFFIXES.sub(" ", s)
    s = _SPACE.sub(" ", s).strip()
    return s


def block_keys(normalized: str) -> list[str]:
    keys = [t for t in normalized.split()
            if len(t) >= _MIN_TOKEN_LEN and t not in _STOPWORDS]
    if normalized:
        keys.append(_FULL_PREFIX + normalized)
    return keys


def main() -> int:
    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        print("SUPABASE_DB_URL not set", file=sys.stderr)
        return 1

    conn = psycopg2.connect(db_url, keepalives=1, keepalives_idle=30)

    # ── Load principals ────────────────────────────────────────────────────
    print("Loading principals …", flush=True)
    with conn.cursor() as cur:
        cur.execute("SET statement_timeout='60s'")
        cur.execute("SELECT slug, name FROM principals WHERE name IS NOT NULL")
        prins = cur.fetchall()
    print(f"  {len(prins):,} principals")

    # ── Stream fl_corporations and build index ─────────────────────────────
    print("\nStreaming fl_corporations into in-memory index …", flush=True)
    # Holds per-corp tuple (entity_name, address, zip, corp_number)
    corps: list[tuple[str, str, str, str]] = []
    index: dict[str, list[int]] = defaultdict(list)
    normed: list[str] = []

    with conn.cursor(name="fl_corp_stream") as cur:
        cur.itersize = 50_000
        cur.execute(
            """
            SELECT entity_name, address, zip, corp_number
            FROM fl_corporations
            WHERE entity_name IS NOT NULL
              AND address IS NOT NULL
              AND zip IS NOT NULL
            """
        )
        count = 0
        for ename, addr, zipcode, corp_num in cur:
            # Only keep rows where we can extract a usable street_num + 5-digit zip
            m = STREET_NUM_RE.match(addr)
            if not m:
                continue
            z = (zipcode or "")[:5]
            if not (len(z) == 5 and z.isdigit()):
                continue
            norm = normalize(ename)
            if not norm:
                continue
            idx = len(corps)
            corps.append((ename, m.group(1), z, corp_num))
            normed.append(norm)
            for k in block_keys(norm):
                index[k].append(idx)
            count += 1
            if count % 500_000 == 0:
                print(f"  indexed {count:,} corps, {len(index):,} keys", flush=True)

    print(f"  {len(corps):,} indexable corps, {len(index):,} keys")

    # ── Match each principal ───────────────────────────────────────────────
    print("\nMatching principals …", flush=True)
    addr_rows: list[tuple[str, str, str, str]] = []
    hits_per_principal = 0
    matched_principals = 0

    for pslug, pname in prins:
        pn = normalize(pname)
        keys = block_keys(pn)
        if not keys:
            continue
        cand: set[int] = set()
        for k in keys:
            cand.update(index.get(k, []))
        if not cand:
            continue

        # Require exact normalized-form equality. This is the key dedupe:
        # multiple corp rows often share the same canonical name (different
        # filings of the same entity), so one principal can legitimately map
        # to several distinct addresses — all belonging to that entity.
        matches: list[int] = []
        for i in cand:
            if normed[i] == pn:
                matches.append(i)

        if not matches:
            continue
        matched_principals += 1
        seen_addr_per_p: set[tuple[str, str]] = set()
        for i in matches:
            ename, street_num, z, corp_num = corps[i]
            if (street_num, z) in seen_addr_per_p:
                continue
            seen_addr_per_p.add((street_num, z))
            addr_rows.append((pslug, street_num, z, corp_num))
            hits_per_principal += 1

    print(f"  {matched_principals:,} principals matched, {hits_per_principal:,} address rows")

    # ── Write principal_addresses ──────────────────────────────────────────
    if addr_rows:
        print("\nInserting into principal_addresses (ON CONFLICT DO NOTHING) …", flush=True)
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout='120s'")
            execute_values(
                cur,
                """
                INSERT INTO principal_addresses
                  (principal_slug, street_num, zip, source_corp_number)
                VALUES %s
                ON CONFLICT (principal_slug, street_num, zip) DO NOTHING
                """,
                addr_rows,
                page_size=5000,
            )
        conn.commit()

    # ── Refresh corroboration MV ────────────────────────────────────────────
    # principal_addresses changed; the corroboration MV needs to re-run so
    # /api/follow?step=principals sees the new links on the next request.
    # CONCURRENTLY refresh requires autocommit (cannot run inside a tx block).
    prev_autocommit = conn.autocommit
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute("SET statement_timeout = 0")
            print("\nRefreshing donor_principal_address_corroboration_v …", flush=True)
            cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY donor_principal_address_corroboration_v")
    finally:
        conn.autocommit = prev_autocommit

    # ── Summary ────────────────────────────────────────────────────────────
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*), COUNT(DISTINCT principal_slug) FROM principal_addresses")
        print(f"\nprincipal_addresses now: {cur.fetchone()}")
        cur.execute("""
            SELECT COUNT(*), COUNT(DISTINCT donor_slug), COUNT(DISTINCT principal_slug)
            FROM donor_principal_address_corroboration_v
        """)
        print(f"corroboration_v rows, donors, principals: {cur.fetchone()}")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
