#!/usr/bin/env python3
"""
21b_enrich_donor_naics.py

Enrich donor_entities with NAICS codes + industry bucket via 4 passes:
  Pass 1: exact normalized-name match against union of 3 NAICS sources
          (lobbyist_registrations > principals > federal_contracts)
  Pass 2: pg_trgm fuzzy match @ 0.75 threshold (gated at 0.75 — below that
          the 21a audit showed clear false positives like TIDES→TCC)
  Pass 3: PAC/committee name-pattern → Political/Lobbying (NAICS 813940)
          Catches GOPAC, FL JUSTICE PAC, FREEDOM FIRST COMMITTEE, etc.
  Pass 4: individual donors — route top_occupation through existing
          occupation heuristic (scripts/industry_classifier.py)

Writes to donor_entities (naics_code, naics_source, naics_confidence,
naics_match_score, industry). Idempotent: each run nulls out those four
columns and rebuilds.

Invariants verified at end:
  - donor row count unchanged
  - total_combined dollar sum unchanged (via donors_mv refresh check)
  - bucket distribution sanity (no single non-Other bucket > 40%)

Usage:
    .venv/bin/python -u scripts/21b_enrich_donor_naics.py
"""
import importlib.util
import os
import re
import sys
import time
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values

PROJECT = Path(__file__).resolve().parent.parent

# Import naics_to_bucket and industry_classifier as modules
_spec = importlib.util.spec_from_file_location("nb", PROJECT / "scripts" / "naics_to_bucket.py")
nb = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(nb)
_spec2 = importlib.util.spec_from_file_location("ic", PROJECT / "scripts" / "industry_classifier.py")
ic = importlib.util.module_from_spec(_spec2); _spec2.loader.exec_module(ic)
_spec3 = importlib.util.spec_from_file_location("ntb", PROJECT / "scripts" / "ntee_to_bucket.py")
ntb = importlib.util.module_from_spec(_spec3); _spec3.loader.exec_module(ntb)

DB_URL = os.getenv("SUPABASE_DB_URL")
if not DB_URL:
    sys.exit("ERROR: SUPABASE_DB_URL not set")

FUZZY_THRESHOLD = 0.75

# PAC/committee name patterns (order matters — most specific first)
PAC_PATTERNS = [
    re.compile(r"\bPOLITICAL (ACTION )?COMMITTEE\b", re.I),
    # PAC must be near the end (last 3 tokens) OR immediately followed by INC/LLC/FUND/OF
    # — excludes "PAC SORREL DBA..." style prefixes
    re.compile(r"\bPAC(\s+(INC|LLC|LTD|FUND|STATE|OF|FOR))?\b[^A-Z]*$", re.I),
    re.compile(r"\bP\.A\.C\.?\s*$", re.I),
    # Committee/campaign OF a person or cause — not bare "FRIENDS OF"
    re.compile(r"\b(COMMITTEE|CAMPAIGN) (OF|TO ELECT)\b", re.I),
    re.compile(r"\bFOR (CONGRESS|SENATE|GOVERNOR|PRESIDENT|FLORIDA|AMERICA)\b", re.I),
    re.compile(r"^(KEEP|ELECT|RE-?ELECT) ", re.I),
    re.compile(r"\bCONSERVATIVES? FOR\b", re.I),
    re.compile(r"\b(DEMOCRATS?|REPUBLICANS?|LIBERTARIANS?) FOR\b", re.I),
    # Political party, not "party rentals" — require DEMOCRATIC/REPUBLICAN/POLITICAL/STATE/etc.
    re.compile(r"\b(DEMOCRATIC|REPUBLICAN|LIBERTARIAN|POLITICAL|STATE|NATIONAL|COUNTY|LOCAL) PARTY\b", re.I),
    re.compile(r"\bPOLITICAL CAUCUS\b", re.I),
    re.compile(r"\bLEADERSHIP FUND\b", re.I),
    re.compile(r"\b527\b", re.I),
    re.compile(r"\bFREEDOM (FUND|COMMITTEE|PAC)\b", re.I),
]

# NAICS code for political organizations
NAICS_POLITICAL = "813940"


def normalize(raw: str) -> str:
    s = str(raw or "").upper()
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def is_pac_name(name: str) -> bool:
    if not name:
        return False
    for pat in PAC_PATTERNS:
        if pat.search(name):
            return True
    return False


def main():
    t0 = time.time()
    conn = psycopg2.connect(
        DB_URL,
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=5,
    )
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("set statement_timeout = 0")

    print("=" * 72)
    print("21b — donor NAICS enrichment")
    print("=" * 72)

    # Pre-snapshot for dollar invariant
    cur.execute("select coalesce(sum(total_combined), 0) from donors_mv")
    pre_dollars = float(cur.fetchone()[0])
    cur.execute("select count(*) from donor_entities")
    pre_rows = cur.fetchone()[0]
    print(f"Pre: {pre_rows:,} donor_entities  |  ${pre_dollars:,.0f} total_combined")

    # Reset NAICS columns + industry (industry will be rebuilt from NAICS or occupation)
    # Chunked to survive Supavisor pooler idle/network limits on 1M-row UPDATEs.
    print("\nResetting NAICS + industry columns (chunked) ...")
    total_reset = 0
    while True:
        cur.execute("""
            update donor_entities set
              naics_code = null,
              naics_source = null,
              naics_confidence = null,
              naics_match_score = null,
              industry = null
            where ctid in (
              select ctid from donor_entities
              where naics_code is not null
                 or naics_source is not null
                 or naics_confidence is not null
                 or naics_match_score is not null
                 or industry is not null
              limit 50000
            )
        """)
        n = cur.rowcount
        if n == 0:
            break
        total_reset += n
        print(f"  reset batch: {n} (cum {total_reset:,})", flush=True)
    print(f"  reset complete: {total_reset:,} rows")

    # Build source union as temp table
    print("Building NAICS source union (lobbyist_reg > principals > federal_contracts) ...")
    cur.execute("drop table if exists _naics_src")
    cur.execute("""
        create table _naics_src (
          name_norm text primary key,
          naics text,
          source text
        )
    """)
    # Preference: lobbyist_registrations > principals > federal_contracts
    for label, sql in [
        ("lobbyist_registrations",
         "select principal_name, industry_code from lobbyist_registrations "
         "where principal_name is not null and industry_code is not null"),
        ("principals",
         "select name, naics from principals where name is not null and naics is not null"),
        ("federal_contracts",
         "select recipient_name, naics_code from federal_contracts "
         "where recipient_name is not null and naics_code is not null"),
    ]:
        cur.execute(sql)
        rows = []
        for name, naics in cur.fetchall():
            n = normalize(name)
            if n:
                rows.append((n, str(naics), label))
        # on conflict do nothing → preserves higher-preference source (inserted first)
        execute_values(
            cur,
            "insert into _naics_src(name_norm, naics, source) values %s "
            "on conflict (name_norm) do nothing",
            rows, page_size=5000,
        )
    cur.execute("create index _naics_src_trgm on _naics_src using gin (name_norm gin_trgm_ops)")
    cur.execute("select count(*), count(distinct source) from _naics_src")
    src_rows, src_kinds = cur.fetchone()
    print(f"  {src_rows:,} unique NAICS-tagged names across {src_kinds} sources")

    # Build donor_entities normalized-name temp table (corporate only for passes 1-3)
    print("\nBuilding donor normalized-name table ...")
    cur.execute("drop table if exists _naics_donor")
    cur.execute("""
        create table _naics_donor (
          canonical_slug text primary key,
          name_norm text,
          raw_name text,
          is_corporate boolean
        )
    """)
    cur.execute("""
        insert into _naics_donor(canonical_slug, name_norm, raw_name, is_corporate)
        select canonical_slug,
               regexp_replace(regexp_replace(upper(canonical_name), '[^A-Z0-9 ]', ' ', 'g'),
                              '\\s+', ' ', 'g'),
               canonical_name,
               coalesce(is_corporate, false)
          from donor_entities
         where canonical_name is not null
    """)
    cur.execute("create index _naics_donor_norm_idx on _naics_donor (name_norm)")
    cur.execute("create index _naics_donor_trgm on _naics_donor using gin (name_norm gin_trgm_ops)")
    cur.execute("select count(*) filter (where is_corporate), count(*) from _naics_donor")
    corp, total = cur.fetchone()
    print(f"  {corp:,} corporate / {total:,} total donor_entities")

    # Pass 1 — exact match
    print("\nPass 1: exact normalized-name match ...")
    cur.execute("""
        update donor_entities de set
          naics_code = s.naics,
          naics_source = s.source,
          naics_confidence = 'exact',
          naics_match_score = 1.00
        from _naics_donor d
        join _naics_src s on s.name_norm = d.name_norm
        where de.canonical_slug = d.canonical_slug
          and d.is_corporate
    """)
    pass1 = cur.rowcount
    print(f"  → {pass1:,} donors matched exact")

    # Pass 2 — fuzzy @ 0.75
    print(f"\nPass 2: pg_trgm fuzzy @ {FUZZY_THRESHOLD} ...")
    cur.execute(f"set pg_trgm.similarity_threshold = {FUZZY_THRESHOLD}")
    # pick the single best fuzzy match per donor
    cur.execute(f"""
        with cand as (
          select d.canonical_slug, s.naics, s.source,
                 similarity(d.name_norm, s.name_norm) as sim,
                 row_number() over (partition by d.canonical_slug
                                    order by similarity(d.name_norm, s.name_norm) desc) as rn
            from _naics_donor d
            join donor_entities de on de.canonical_slug = d.canonical_slug
            join _naics_src s on d.name_norm % s.name_norm
           where d.is_corporate
             and de.naics_code is null
             and similarity(d.name_norm, s.name_norm) >= {FUZZY_THRESHOLD}
        )
        update donor_entities de set
          naics_code = c.naics,
          naics_source = c.source,
          naics_confidence = 'fuzzy',
          naics_match_score = round(c.sim::numeric, 2)
        from cand c
        where c.rn = 1 and de.canonical_slug = c.canonical_slug
    """)
    pass2 = cur.rowcount
    print(f"  → {pass2:,} donors matched fuzzy")

    # Build filtered IRS temp table — orgs likely to make political donations
    # Filter: asset > $100K OR political-leaning subsection OR political NTEE letter
    print("\nFiltering IRS BMF to likely-donor orgs ...")
    cur.execute("set statement_timeout = 0")
    cur.execute("drop table if exists _irs_filtered")
    cur.execute("""
        create table _irs_filtered as
        select ein, name_normalized, ntee_code, subsection, asset_amt
          from irs_exempt_orgs
         where name_normalized is not null
           and (
                coalesce(asset_amt, 0) > 1000000
             or subsection in ('04','05','06','07')
             or left(coalesce(ntee_code,''),1) in ('R','S','T','W','Q')
           )
    """)
    cur.execute("select count(*) from _irs_filtered")
    (irs_n,) = cur.fetchone()
    cur.execute("create index _irs_filtered_norm on _irs_filtered(name_normalized)")
    cur.execute("create index _irs_filtered_trgm on _irs_filtered using gin (name_normalized gin_trgm_ops)")
    cur.execute("analyze _irs_filtered")
    print(f"  {irs_n:,} filtered IRS orgs (from 1.95M total)")

    # Pass 3 — IRS BMF exact name match (non-profits: TIDES, SIXTEEN THIRTY FUND, etc.)
    print("\nPass 3: IRS BMF (non-profits) exact name match ...")
    cur.execute("""
        with cand as (
          select d.canonical_slug, i.ntee_code, i.subsection,
                 row_number() over (partition by d.canonical_slug
                                    order by coalesce(i.asset_amt, 0) desc) as rn
            from _naics_donor d
            join donor_entities de on de.canonical_slug = d.canonical_slug
            join _irs_filtered i on i.name_normalized = d.name_norm
           where d.is_corporate
             and de.naics_code is null
        )
        update donor_entities de set
          naics_code = coalesce(c.ntee_code, ''),
          naics_source = 'irs_bmf',
          naics_confidence = 'exact',
          naics_match_score = 1.00
        from cand c
        where c.rn = 1 and de.canonical_slug = c.canonical_slug
    """)
    pass3a = cur.rowcount
    print(f"  → {pass3a:,} donors matched IRS exact")

    # Pass 4 — IRS BMF fuzzy @ 0.88 (raised from 0.75 — 47K donors × 580K IRS at 0.75
    # is too many comparisons for pooler; 0.88 prunes GIN much harder with marginal recall loss)
    IRS_FUZZY_THRESHOLD = 0.88
    print(f"\nPass 4: IRS BMF fuzzy @ {IRS_FUZZY_THRESHOLD} ...")
    cur.execute(f"set pg_trgm.similarity_threshold = {IRS_FUZZY_THRESHOLD}")
    cur.execute(f"""
        with cand as (
          select d.canonical_slug, i.ntee_code, i.subsection,
                 similarity(d.name_norm, i.name_normalized) as sim,
                 row_number() over (
                   partition by d.canonical_slug
                   order by similarity(d.name_norm, i.name_normalized) desc,
                            coalesce(i.asset_amt, 0) desc
                 ) as rn
            from _naics_donor d
            join donor_entities de on de.canonical_slug = d.canonical_slug
            join _irs_filtered i on d.name_norm % i.name_normalized
           where d.is_corporate
             and de.naics_code is null
             and similarity(d.name_norm, i.name_normalized) >= {IRS_FUZZY_THRESHOLD}
        )
        update donor_entities de set
          naics_code = coalesce(c.ntee_code, ''),
          naics_source = 'irs_bmf',
          naics_confidence = 'fuzzy',
          naics_match_score = round(c.sim::numeric, 2)
        from cand c
        where c.rn = 1 and de.canonical_slug = c.canonical_slug
    """)
    pass3b = cur.rowcount
    print(f"  → {pass3b:,} donors matched IRS fuzzy")

    # Pass 5 — PAC / committee name pattern
    print("\nPass 5: PAC/committee name patterns ...")
    # Fetch unmatched corporate donors, apply regex in Python (richer patterns
    # than pure SQL regex)
    cur.execute("""
        select canonical_slug, canonical_name
          from donor_entities
         where naics_code is null
           and coalesce(is_corporate, false)
    """)
    pac_slugs = []
    for slug, name in cur.fetchall():
        if is_pac_name(name):
            pac_slugs.append(slug)
    pass5 = len(pac_slugs)
    print(f"  → {pass5:,} PAC/committee names matched pattern")
    if pac_slugs:
        cur.execute("drop table if exists _naics_pac_tmp")
        cur.execute("create table _naics_pac_tmp (slug text primary key)")
        execute_values(cur,
            "insert into _naics_pac_tmp(slug) values %s on conflict do nothing",
            [(s,) for s in pac_slugs], page_size=5000)
        cur.execute(f"""
            update donor_entities de set
              naics_code = %s,
              naics_source = 'pac_pattern',
              naics_confidence = 'pattern',
              naics_match_score = 0.90
            from _naics_pac_tmp t
            where de.canonical_slug = t.slug
              and de.naics_code is null
        """, (NAICS_POLITICAL,))
        print(f"    committed {cur.rowcount:,} rows")

    # Pass 6 — individual donors via occupation heuristic (sets industry directly, no NAICS)
    print("\nPass 6: individual donors via occupation heuristic ...")
    # Need top_occupation per donor slug — pull from donors_mv
    cur.execute("""
        select e.canonical_slug, mv.top_occupation
          from donor_entities e
          join donors_mv mv on mv.slug = e.canonical_slug
         where not coalesce(e.is_corporate, false)
           and e.naics_code is null
           and mv.top_occupation is not null and mv.top_occupation <> ''
    """)
    occ_rows = cur.fetchall()
    bucketed = []
    for slug, occ in occ_rows:
        bucket = ic.classify_occupation(occ)
        if bucket and bucket != "Other":
            bucketed.append((slug, bucket))
    print(f"  {len(occ_rows):,} individuals have top_occupation; {len(bucketed):,} resolved to a bucket")
    if bucketed:
        cur.execute("drop table if exists _naics_occ_tmp")
        cur.execute("create table _naics_occ_tmp (slug text primary key, bucket text)")
        execute_values(cur,
            "insert into _naics_occ_tmp(slug,bucket) values %s on conflict do nothing",
            bucketed, page_size=10000)
        cur.execute("""
            update donor_entities de set
              naics_source = 'occupation_heuristic',
              naics_confidence = 'inferred',
              naics_match_score = 0.50,
              industry = t.bucket
            from _naics_occ_tmp t
            where de.canonical_slug = t.slug
              and de.naics_code is null
              and de.industry is null
        """)
        print(f"  → {cur.rowcount:,} individuals tagged")

    # Map NAICS → bucket for NAICS-source rows, NTEE → bucket for IRS rows.
    print("\nMapping codes → 15-bucket industry ...")
    cur.execute("""
        select distinct naics_code, naics_source from donor_entities
         where naics_code is not null and industry is null and naics_source is not null
    """)
    rows = cur.fetchall()
    code_to_bucket = []
    for code, src in rows:
        if src == "irs_bmf":
            bucket = ntb.classify_ntee(code)
        else:
            bucket = nb.classify_naics(code)
        code_to_bucket.append((code, src, bucket))

    # Also bucket IRS rows where naics_code='' (no NTEE) using subsection fallback
    cur.execute("""
        select distinct de.canonical_slug, i.subsection
          from donor_entities de
          left join _irs_filtered i on i.name_normalized =
               regexp_replace(regexp_replace(upper(de.canonical_name), '[^A-Z0-9 ]', ' ', 'g'),
                              '\\s+', ' ', 'g')
         where de.naics_source = 'irs_bmf'
           and (de.naics_code is null or de.naics_code = '')
           and de.industry is null
    """)
    irs_no_ntee = cur.fetchall()

    if code_to_bucket:
        cur.execute("drop table if exists _naics_bucket_tmp")
        cur.execute("create table _naics_bucket_tmp "
                    "(naics text, src text, bucket text, primary key (naics, src))")
        execute_values(cur,
            "insert into _naics_bucket_tmp(naics,src,bucket) values %s on conflict do nothing",
            code_to_bucket, page_size=5000)
        cur.execute("""
            update donor_entities de set industry = t.bucket
              from _naics_bucket_tmp t
             where de.naics_code = t.naics
               and coalesce(de.naics_source,'') = coalesce(t.src,'')
               and de.industry is null
        """)
        print(f"  → {cur.rowcount:,} rows bucketed from NAICS/NTEE codes")

    if irs_no_ntee:
        bucketed = []
        for slug, sub in irs_no_ntee:
            b = ntb.classify_ntee(None, sub)
            if b != "Other":
                bucketed.append((slug, b))
        if bucketed:
            cur.execute("drop table if exists _naics_sub_tmp")
            cur.execute("create table _naics_sub_tmp (slug text primary key, bucket text)")
            execute_values(cur,
                "insert into _naics_sub_tmp(slug,bucket) values %s on conflict do nothing",
                bucketed, page_size=5000)
            cur.execute("""
                update donor_entities de set industry = t.bucket
                  from _naics_sub_tmp t
                 where de.canonical_slug = t.slug
                   and de.industry is null
            """)
            print(f"  → {cur.rowcount:,} IRS rows bucketed via 501(c) subsection fallback")

    # Refresh donors_mv so invariant checks reflect new state
    print("\nRefreshing donors_mv ...")
    cur.execute("refresh materialized view donors_mv")

    # Invariants
    print("\n" + "=" * 72)
    print("INVARIANTS")
    print("=" * 72)
    cur.execute("select count(*) from donor_entities")
    post_rows = cur.fetchone()[0]
    cur.execute("select coalesce(sum(total_combined), 0) from donors_mv")
    post_dollars = float(cur.fetchone()[0])
    print(f"  rows:    {pre_rows:,} → {post_rows:,}   Δ = {post_rows - pre_rows}")
    print(f"  dollars: ${pre_dollars:,.2f} → ${post_dollars:,.2f}   Δ = ${post_dollars - pre_dollars:,.2f}")
    assert post_rows == pre_rows, "ROW COUNT CHANGED"
    assert abs(post_dollars - pre_dollars) < 1.0, "DOLLAR TOTAL CHANGED"

    # Coverage report
    cur.execute("""
        select naics_source, count(*)
          from donor_entities
         group by naics_source
         order by 2 desc
    """)
    print("\n  Coverage by source:")
    for src, cnt in cur.fetchall():
        print(f"    {str(src) or '(none)':<28} {cnt:>10,}")

    # Bucket distribution
    cur.execute("""
        select coalesce(industry, '(null)') as bucket,
               count(*),
               sum(total_combined)
          from donors_mv
         group by 1 order by 2 desc
    """)
    print("\n  Bucket distribution:")
    rows = cur.fetchall()
    total_cnt = sum(r[1] for r in rows)
    for bucket, cnt, dollars in rows:
        pct = 100.0 * cnt / max(total_cnt, 1)
        print(f"    {bucket:<32} {cnt:>10,}  {pct:>5.1f}%  ${dollars or 0:>15,.0f}")

    # Sanity: no non-Other bucket > 40% (allow Not Employed/Retired/null since they dominate individuals)
    for bucket, cnt, _ in rows:
        if bucket in ("(null)", "Not Employed", "Retired", "Other"):
            continue
        pct = 100.0 * cnt / max(total_cnt, 1)
        if pct > 40.0:
            print(f"  ⚠  Bucket {bucket} is {pct:.1f}% — runaway classification?")

    elapsed = time.time() - t0
    print(f"\n✓ Done in {elapsed:.1f}s")

    for t in ("_naics_src", "_naics_donor", "_irs_filtered",
              "_naics_pac_tmp", "_naics_occ_tmp",
              "_naics_bucket_tmp", "_naics_sub_tmp"):
        try:
            cur.execute(f"drop table if exists {t}")
        except Exception:
            pass

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
