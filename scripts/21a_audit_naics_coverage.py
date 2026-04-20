#!/usr/bin/env python3
"""
21a_audit_naics_coverage.py

Phase 0 coverage audit for the NAICS donor industry classifier (plan:
docs/naics-industry-classifier-plan.md).

READ-ONLY. Writes nothing. Prints real numbers that the gate decision
uses: exact-match counts per source, fuzzy match distribution across a
threshold sweep, source-overlap matrix, and top-50 corporate donors by
$ with their best candidate matches for eyeball review.

Usage:
    .venv/bin/python -u scripts/21a_audit_naics_coverage.py
"""
import os
import re
import sys
from collections import defaultdict

import psycopg2
from psycopg2.extras import execute_values

DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set")

SWEEP_THRESHOLDS = [0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95]


def normalize(raw: str) -> str:
    s = str(raw or "").upper()
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def main():
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()

    print("=" * 72)
    print("NAICS COVERAGE AUDIT — Phase 0 (read-only)")
    print("=" * 72)

    # 1. Donor population
    cur.execute("""
        select
          count(*) as total,
          count(*) filter (where is_corporate) as corp,
          count(*) filter (where not is_corporate or is_corporate is null) as indiv,
          count(*) filter (where industry is not null) as already_tagged
        from donors
    """)
    total, corp, indiv, tagged = cur.fetchone()
    print(f"\nDonor population:")
    print(f"  total:           {total:>10,}")
    print(f"  corporate:       {corp:>10,}")
    print(f"  individual:      {indiv:>10,}")
    print(f"  already tagged:  {tagged:>10,}")

    # 2. NAICS source inventory (distinct normalized names per source)
    print(f"\nNAICS source inventory (distinct normalized names):")
    sources = {}
    for label, sql in [
        ("lobbyist_registrations", """
            select distinct principal_name, industry_code
            from lobbyist_registrations
            where principal_name is not null and industry_code is not null
        """),
        ("principals", """
            select distinct name, naics
            from principals
            where name is not null and naics is not null
        """),
        ("federal_contracts", """
            select distinct recipient_name, naics_code
            from federal_contracts
            where recipient_name is not null and naics_code is not null
        """),
    ]:
        cur.execute(sql)
        rows = cur.fetchall()
        norm_map = {}  # normalized_name -> naics (keep first seen)
        for name, naics in rows:
            n = normalize(name)
            if n and n not in norm_map:
                norm_map[n] = str(naics)
        sources[label] = norm_map
        print(f"  {label:<28} {len(rows):>6,} raw rows → {len(norm_map):>6,} distinct normalized names")

    # 3. Source overlap matrix
    print(f"\nSource overlap (distinct normalized names):")
    keys = list(sources.keys())
    for a in keys:
        for b in keys:
            if a >= b:
                continue
            inter = len(sources[a].keys() & sources[b].keys())
            print(f"  {a} ∩ {b}: {inter:,}")

    union_names = set()
    for s in sources.values():
        union_names |= s.keys()
    print(f"  UNION of all sources:           {len(union_names):,}")

    # 4. Build donor-side population (corporate)
    cur.execute("""
        select name, total_combined
        from donors
        where is_corporate
    """)
    donor_rows = cur.fetchall()
    donor_norm = {}  # normalized -> (display, total)
    for display, total_amt in donor_rows:
        n = normalize(display)
        if not n:
            continue
        prev = donor_norm.get(n)
        if prev is None or (total_amt or 0) > (prev[1] or 0):
            donor_norm[n] = (display, float(total_amt or 0))
    print(f"\nCorporate donors (deduped by normalized name): {len(donor_norm):,}")

    # 5. Pass 1 — exact match per source
    print(f"\nPass 1 — exact normalized-name match (corp donors → NAICS):")
    matched_by_exact = set()
    per_source_exact = {}
    for label, src_map in sources.items():
        hits = donor_norm.keys() & src_map.keys()
        per_source_exact[label] = hits
        matched_by_exact |= hits
        dollars = sum(donor_norm[n][1] for n in hits)
        print(f"  {label:<28} {len(hits):>6,} donors   ${dollars:>15,.0f}")
    total_exact_dollars = sum(donor_norm[n][1] for n in matched_by_exact)
    total_corp_dollars = sum(t for _, t in donor_norm.values())
    print(f"  UNION (any source):          {len(matched_by_exact):>6,} donors   ${total_exact_dollars:>15,.0f}")
    pct_count = 100.0 * len(matched_by_exact) / max(len(donor_norm), 1)
    pct_dollars = 100.0 * total_exact_dollars / max(total_corp_dollars, 1)
    print(f"  → {pct_count:.1f}% of corp donors by count, {pct_dollars:.1f}% by dollars")

    # 6. Pass 2 — pg_trgm threshold sweep (via tmp table for speed)
    print(f"\nPass 2 — pg_trgm fuzzy match sweep (unmatched corp donors only):")
    unmatched = [n for n in donor_norm.keys() if n not in matched_by_exact]
    print(f"  candidates: {len(unmatched):,} unmatched corp donor names")

    cur.execute("create extension if not exists pg_trgm")
    cur.execute("drop table if exists _naics_audit_donor_tmp")
    cur.execute("create temp table _naics_audit_donor_tmp (name text primary key)")
    execute_values(
        cur, "insert into _naics_audit_donor_tmp(name) values %s on conflict do nothing",
        [(n,) for n in unmatched], page_size=5000,
    )
    cur.execute("create index on _naics_audit_donor_tmp using gin (name gin_trgm_ops)")

    # Build a union source table
    cur.execute("drop table if exists _naics_audit_src_tmp")
    cur.execute("create temp table _naics_audit_src_tmp (name text, naics text, source text)")
    src_rows = []
    for label, src_map in sources.items():
        for n, naics in src_map.items():
            src_rows.append((n, naics, label))
    execute_values(
        cur, "insert into _naics_audit_src_tmp(name, naics, source) values %s",
        src_rows, page_size=5000,
    )
    cur.execute("create index on _naics_audit_src_tmp using gin (name gin_trgm_ops)")

    for thr in SWEEP_THRESHOLDS:
        cur.execute(f"set pg_trgm.similarity_threshold = {thr}")
        cur.execute(
            "select count(distinct d.name) "
            "from _naics_audit_donor_tmp d "
            "join _naics_audit_src_tmp s on d.name % s.name "
            f"where similarity(d.name, s.name) >= {thr}"
        )
        (hits,) = cur.fetchone()
        added_pct = 100.0 * hits / max(len(donor_norm), 1)
        total_pct = pct_count + added_pct
        print(f"  threshold {thr:.2f}: +{hits:>6,} fuzzy matches ({added_pct:.1f}% additional → {total_pct:.1f}% total)")

    # 7. Top 50 corp donors by $ with best candidate matches at 0.75
    print(f"\nTop 50 corporate donors by $ — best candidate NAICS match (thr≥0.60 for review):")
    cur.execute("set pg_trgm.similarity_threshold = 0.60")
    top_donors = sorted(donor_norm.items(), key=lambda kv: -kv[1][1])[:50]

    already_exact = per_source_exact
    # Flatten to {normalized: (naics, source)} (first-wins by preference order)
    src_pref = ["lobbyist_registrations", "principals", "federal_contracts"]
    name_to_match = {}
    for s in src_pref:
        for n, naics in sources[s].items():
            if n not in name_to_match:
                name_to_match[n] = (naics, s)

    for norm_name, (display, total_amt) in top_donors:
        if norm_name in name_to_match:
            naics, src = name_to_match[norm_name]
            print(f"  ${total_amt:>13,.0f}  EXACT  [{src:<22}] naics={naics}  {display[:60]}")
            continue
        # Try fuzzy
        cur.execute("""
            select s.name, s.naics, s.source, similarity(%s, s.name) as sim
            from _naics_audit_src_tmp s
            where %s %% s.name
            order by sim desc
            limit 1
        """, (norm_name, norm_name))
        row = cur.fetchone()
        if row:
            match_name, naics, src, sim = row
            print(f"  ${total_amt:>13,.0f}  FUZZY  [{src:<22}] naics={naics} sim={sim:.2f}  {display[:40]} ≈ {match_name[:30]}")
        else:
            print(f"  ${total_amt:>13,.0f}  NONE                                   {display[:60]}")

    # 8. Gate decision
    print(f"\n{'=' * 72}")
    print("GATE DECISION")
    print(f"{'=' * 72}")
    # Use 0.75 threshold for realistic total
    cur.execute("set pg_trgm.similarity_threshold = 0.75")
    cur.execute(
        "select count(distinct d.name) "
        "from _naics_audit_donor_tmp d "
        "join _naics_audit_src_tmp s on d.name % s.name "
        "where similarity(d.name, s.name) >= 0.75"
    )
    (fuzzy_075,) = cur.fetchone()
    realistic_total = len(matched_by_exact) + fuzzy_075
    realistic_pct = 100.0 * realistic_total / max(len(donor_norm), 1)
    print(f"  Exact matches:       {len(matched_by_exact):>6,} ({pct_count:.1f}%)")
    print(f"  Fuzzy @0.75:         {fuzzy_075:>6,} ({100.0*fuzzy_075/max(len(donor_norm),1):.1f}%)")
    print(f"  Realistic coverage:  {realistic_total:>6,} / {len(donor_norm):,} corp donors ({realistic_pct:.1f}%)")
    print(f"  Dollar coverage (exact only): {pct_dollars:.1f}%")
    if realistic_pct >= 15.0:
        print(f"\n  ✓ PASS: coverage ≥ 15% — worth proceeding to Phase 1 (labeled set)")
    else:
        print(f"\n  ✗ FAIL: coverage < 15% — reconsider before building 21b")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
