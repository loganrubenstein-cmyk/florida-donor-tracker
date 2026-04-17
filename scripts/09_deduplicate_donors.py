#!/usr/bin/env python3
"""
Script 09: Deduplicate contributor names into canonical donor entities.

Replaces the legacy CSV-only clustering pass with a DB-aware multi-pass pipeline
that writes to donor_entities + donor_aliases (see migration 015). Contributions
become source-of-truth; `donors` / `donors_mv` are derived.

Passes, in priority order:
    1. exact_normalized  — alias_text identical → merge (trivial, just ensure row)
    2. corp_match        — donor_entities.corp_ein or corp_number match
    3. manual_merge      — already populated by 09b; we never overwrite
    4. fuzzy_high        — token_sort_ratio ≥ 92 AND token_set_ratio ≥ 95
                           → write alias with source='dedup_pipeline'
    5. fuzzy_gray        — 0.85 ≤ token_sort_ratio < 0.92
                           → write to donor_review_queue for human review

Design choices:
  - Block by first 5 chars of normalized name to keep the N² comparison tractable.
  - Length-ratio guard (min/max >= 0.67) skips obviously-different individual names.
  - "Corporate" pairs (detected via CORP_KEYWORDS) get no length guard — handles
    "FPL, INC" vs "FLORIDA POWER & LIGHT COMPANY" via the manual YAML, not fuzzy.
  - Canonical slug for auto-clusters: highest-$-total alias wins (most-active
    spelling is least likely to be a typo).

Usage:
    python3 scripts/09_deduplicate_donors.py              # normal run
    python3 scripts/09_deduplicate_donors.py --dry-run    # no DB writes
    python3 scripts/09_deduplicate_donors.py --limit 5000 # debug, top-N by $
"""

import os
import re
import sys
from pathlib import Path
from collections import defaultdict

import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv
from thefuzz import fuzz

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env.local")

DB_URL = os.getenv("SUPABASE_DB_URL")

# Thresholds
FUZZY_HIGH_SORT      = 92   # auto-merge floor
FUZZY_HIGH_SET       = 95   # additional gate for auto-merge
FUZZY_GRAY_FLOOR     = 85   # below this we don't even enqueue for review
LENGTH_RATIO_MIN     = 0.67
BLOCK_PREFIX_LEN     = 5

# Structural guards against false-positive clusters (Option D):
#   max size — no real donor has 50 spelling variants; anything bigger is a
#              transitive-chain artifact (A~B~C where A and C aren't similar).
#   cohesion — every pair inside a committed cluster must directly score
#              ≥ COHESION_MIN. Dissolves transitive chains.
MAX_CLUSTER_SIZE     = 50
COHESION_MIN         = 88

# Garbage / aggregation markers routed to the sentinel entity (Option B).
# These are FL DoE filing conventions, not individual donors. Seeded in
# data/manual_donor_merges.yaml as entity 'aggregated-non-itemized'.
SENTINEL_SLUG = "aggregated-non-itemized"
GARBAGE_RE = re.compile(
    r"""
      ^\s*\d+\s*MEMBERS?\b                           # "1 MEMBER", "5 MEMBERS"
    | MEMBERSHIP\s+DUES                              # "MEMBERSHIP DUES ..."
    | MEMBERSHIP\s+CONTRIBUTIONS\s+AGGREGATE         # "MEMBERSHIP CONTRIBUTIONS AGGREGATE AMOUNT ..."
    | ^\s*AGGREGATE\s+(AMOUNT|CONTRIBUTION|OF)       # "AGGREGATE AMOUNT OF ..."
    | ^\s*(ANONYMOUS|UNITEMIZED|VARIOUS|MISCELLANEOUS)\b
    | PAYROLL\s+DEDUCT
    | INTEREST\s+EARN
    | ^\s*\$?[\d,]+\.?\d*\s*(EACH|EA\.?|@)           # "$100 EACH", "50 @"
    | ^\s*\$?[\d,]+\.?\d*\s*$                        # bare dollar amount
    | ^\s*N\s*/?\s*A\s*$                             # N/A
    | \bDUES\s+FROM\s+\d+                            # "DUES FROM 125"
    """,
    re.IGNORECASE | re.VERBOSE,
)

CORP_KEYWORDS = frozenset([
    "INC", "LLC", "CORP", "CO", "COMPANY", "ASSOCIATION", "ASSN",
    "FOUNDATION", "PAC", "FUND", "TRUST", "GROUP", "ENTERPRISES",
    "SERVICES", "INDUSTRIES", "PARTNERS", "HOLDINGS", "LP", "LLP",
])


def is_garbage(display_name: str) -> bool:
    """True if this contributor_name is a FL DoE aggregation marker, not a donor."""
    return bool(GARBAGE_RE.search(str(display_name or "")))


# ── Normalization (mirrors SQL donor_normalize) ───────────────────────────────
def normalize(raw: str) -> str:
    s = str(raw or "").upper()
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def is_corporate(cleaned: str) -> bool:
    return bool(set(cleaned.split()) & CORP_KEYWORDS)


def slugify(name: str) -> str:
    s = str(name).lower()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"\s+", "-", s.strip())
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:120]


# ── Union-find ────────────────────────────────────────────────────────────────
class UF:
    def __init__(self, items):
        self.p = {x: x for x in items}
    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x
    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[ra] = rb
    def clusters(self):
        groups = defaultdict(list)
        for x in self.p:
            groups[self.find(x)].append(x)
        return list(groups.values())


# ── Load contribution name totals from the DB ─────────────────────────────────
def load_name_totals(cur, limit=None):
    """
    Returns {normalized: {"display": best_display, "total": float, "count": int}}.
    Reads from `contributions.contributor_name` directly — the authoritative source.
    """
    q = """
        SELECT
            contributor_name,
            SUM(amount)::numeric AS total,
            COUNT(*)::bigint     AS cnt
        FROM contributions
        WHERE contributor_name IS NOT NULL
          AND contributor_name <> ''
        GROUP BY contributor_name
    """
    if limit:
        q += f" ORDER BY total DESC LIMIT {int(limit)}"
    cur.execute(q)
    out = {}
    for (name, total, cnt) in cur.fetchall():
        norm = normalize(name)
        if not norm:
            continue
        garbage = is_garbage(name)
        prev = out.get(norm)
        if prev is None or total > prev["total"]:
            out[norm] = {
                "display":  name,
                "total":    float(total or 0),
                "count":    int(cnt),
                "garbage":  garbage,
            }
        else:
            prev["total"] += float(total or 0)
            prev["count"] += int(cnt)
            # A norm key is "garbage" if any variant that maps to it is garbage
            # (the display-name picker already keeps the highest-$ variant).
            prev["garbage"] = prev["garbage"] or garbage
    return out


def load_existing_aliases(cur):
    cur.execute("""
        SELECT alias_text, canonical_slug, source
        FROM donor_aliases
    """)
    return {r[0]: (r[1], r[2]) for r in cur.fetchall()}


def load_entity_corp_index(cur):
    """Returns {ein: slug, corp_number: slug} for corp-match pass."""
    cur.execute("""
        SELECT canonical_slug, corp_ein, corp_number
        FROM donor_entities
        WHERE corp_ein IS NOT NULL OR corp_number IS NOT NULL
    """)
    by_ein, by_corp = {}, {}
    for slug, ein, corp in cur.fetchall():
        if ein:  by_ein[ein.strip()] = slug
        if corp: by_corp[corp.strip()] = slug
    return by_ein, by_corp


# ── Fuzzy clustering on unassigned names ──────────────────────────────────────
def _cluster_diameter(cluster):
    """Min pairwise token_sort_ratio across all members. Used to reject
    transitively-chained clusters where ends are dissimilar."""
    if len(cluster) < 2:
        return 100
    worst = 100
    for i in range(len(cluster)):
        for j in range(i + 1, len(cluster)):
            s = fuzz.token_sort_ratio(cluster[i], cluster[j])
            if s < worst:
                worst = s
                if worst < COHESION_MIN:
                    return worst  # early-out; already failing
    return worst


def fuzzy_cluster(name_stats, existing, pre_assigned):
    """
    Returns (auto_clusters, gray_pairs, rejected).

      auto_clusters: list[list[norm]] — each list is a merge group (≥2 members).
      gray_pairs:    list[(norm_a, norm_b, score)] — needs human review.
      rejected:      list[(cluster, reason)] — clusters dropped by Option D guards.

    Only operates on names that are NOT already assigned (via manual_merge,
    corp_match, or the aggregation-marker sentinel). Garbage names are skipped
    entirely — script 09's commit step points them at SENTINEL_SLUG directly.
    """
    names = [
        n for n in name_stats
        if n not in pre_assigned and not name_stats[n].get("garbage")
    ]
    uf = UF(names)
    gray = []

    blocks = defaultdict(list)
    for n in names:
        key = n[:BLOCK_PREFIX_LEN] if len(n) >= BLOCK_PREFIX_LEN else n
        blocks[key].append(n)

    for block in blocks.values():
        if len(block) < 2:
            continue
        for i in range(len(block)):
            a = block[i]
            a_corp = is_corporate(a)
            la = len(a)
            for j in range(i + 1, len(block)):
                b = block[j]
                b_corp = is_corporate(b)
                either_corp = a_corp or b_corp

                if not either_corp:
                    lb = len(b)
                    if la and lb and min(la, lb) / max(la, lb) < LENGTH_RATIO_MIN:
                        continue

                score = fuzz.token_sort_ratio(a, b)
                if score >= FUZZY_HIGH_SORT:
                    set_score = fuzz.token_set_ratio(a, b)
                    if set_score >= FUZZY_HIGH_SET:
                        uf.union(a, b)
                        continue
                if FUZZY_GRAY_FLOOR <= score < FUZZY_HIGH_SORT:
                    gray.append((a, b, score))

    raw = [c for c in uf.clusters() if len(c) > 1]
    auto, rejected = [], []
    for c in raw:
        if len(c) > MAX_CLUSTER_SIZE:
            rejected.append((c, f"size {len(c)} > {MAX_CLUSTER_SIZE}"))
            continue
        diameter = _cluster_diameter(c)
        if diameter < COHESION_MIN:
            rejected.append((c, f"cohesion {diameter} < {COHESION_MIN}"))
            continue
        auto.append(c)
    return auto, gray, rejected


def pick_canonical(cluster, name_stats, existing):
    """
    If any member of the cluster already has a canonical_slug via existing
    aliases (e.g. self-row from seed), use that slug. Otherwise pick the
    highest-$-total member and slugify its display name.
    """
    for n in cluster:
        if n in existing:
            return existing[n][0]
    anchor = max(cluster, key=lambda x: name_stats[x]["total"])
    return slugify(name_stats[anchor]["display"])


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    dry_run = "--dry-run" in sys.argv
    limit = None
    for i, arg in enumerate(sys.argv):
        if arg == "--limit" and i + 1 < len(sys.argv):
            limit = int(sys.argv[i + 1])

    if not DB_URL:
        sys.exit("ERROR: SUPABASE_DB_URL not set")

    print("=== Script 09: Deduplicate Donors (canonical model) ===\n")
    # TCP keepalives survive idle SSL sessions — fuzzy pass can take hours, so
    # a bare psycopg2 connection will timeout mid-upsert without these.
    conn = psycopg2.connect(
        DB_URL,
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=5,
    )
    # Chunked commits: autocommit=True lets us flush in batches so a late
    # error doesn't lose all prior work. Per-chunk retries are not needed —
    # keepalives handle the SSL layer; any remaining transient failure aborts
    # the script with partial progress persisted.
    conn.autocommit = True

    CHUNK = 5000  # rows per execute_values call (also the commit boundary)

    def upsert_entities(cur, rows):
        for i in range(0, len(rows), CHUNK):
            execute_values(cur, """
                INSERT INTO donor_entities
                    (canonical_slug, canonical_name, is_corporate,
                     corp_ein, corp_number, industry, notes)
                VALUES %s
                ON CONFLICT (canonical_slug) DO NOTHING
            """, rows[i:i + CHUNK], page_size=1000)

    def upsert_aliases(cur, rows):
        for i in range(0, len(rows), CHUNK):
            execute_values(cur, """
                INSERT INTO donor_aliases
                    (alias_text, alias_text_display, canonical_slug,
                     source, match_score, review_status, verified_by, verified_at)
                VALUES %s
                ON CONFLICT (alias_text) DO UPDATE SET
                    alias_text_display = EXCLUDED.alias_text_display,
                    canonical_slug     = EXCLUDED.canonical_slug,
                    source             = EXCLUDED.source,
                    match_score        = EXCLUDED.match_score
                WHERE donor_aliases.source = 'self'
                   OR donor_aliases.source = 'dedup_pipeline'
            """, rows[i:i + CHUNK], page_size=1000)

    with conn.cursor() as cur:
        print("Loading contributor totals from contributions…", flush=True)
        name_stats = load_name_totals(cur, limit=limit)
        print(f"  distinct normalized names: {len(name_stats):,}")
        garbage_names = [n for n, s in name_stats.items() if s.get("garbage")]
        print(f"  aggregation markers (→ sentinel): {len(garbage_names):,}")

        print("Loading existing aliases + corp index…", flush=True)
        existing = load_existing_aliases(cur)
        by_ein, by_corp = load_entity_corp_index(cur)
        print(f"  existing aliases: {len(existing):,}")
        print(f"  entities with EIN: {len(by_ein):,}; with corp_number: {len(by_corp):,}")

        # Pre-assigned set — names that already have a manual_merge or corp_match
        # row. These are immutable in this pass.
        pre_assigned = {
            n for n, (_slug, src) in existing.items()
            if src in ("manual_merge", "corp_match", "lobbyist_match")
        }
        print(f"  pre-assigned (manual/corp/lobbyist): {len(pre_assigned):,}")

        print(f"\nFuzzy clustering (≥{FUZZY_HIGH_SORT}% sort AND ≥{FUZZY_HIGH_SET}% set)…",
              flush=True)
        auto_clusters, gray, rejected = fuzzy_cluster(name_stats, existing, pre_assigned)
        print(f"  auto-merge clusters (≥2 members): {len(auto_clusters):,}")
        print(f"  gray-zone pairs (85-91%):         {len(gray):,}")
        print(f"  rejected clusters (size/cohesion): {len(rejected):,}")

        # Emit sample for visibility
        largest = sorted(auto_clusters, key=len, reverse=True)[:5]
        if largest:
            print("\nLargest auto-merge clusters:")
            for c in largest:
                slug = pick_canonical(c, name_stats, existing)
                print(f"  [{len(c)}] → {slug}")
                for n in sorted(c, key=lambda x: -name_stats[x]["total"])[:4]:
                    print(f"      ${name_stats[n]['total']:>14,.0f}  {name_stats[n]['display']!r}")

        if rejected:
            print("\nRejected clusters (by Option D guards — NOT merged):")
            for c, reason in sorted(rejected, key=lambda x: -len(x[0]))[:5]:
                anchor = max(c, key=lambda x: name_stats[x]["total"])
                print(f"  [{len(c)}] {reason}  anchor={name_stats[anchor]['display']!r}")

        if dry_run:
            print("\n[dry-run] no writes performed.")
            return 0

        # ── Write auto-merge clusters ───────────────────────────────────────
        entity_rows = []
        alias_rows  = []
        merge_log   = []

        for cluster in auto_clusters:
            slug = pick_canonical(cluster, name_stats, existing)
            canon_display = max(cluster, key=lambda x: name_stats[x]["total"])
            entity_rows.append((
                slug,
                name_stats[canon_display]["display"],
                is_corporate(canon_display),
                None, None, None,
                "auto-created by dedup_pipeline",
            ))
            anchor = max(cluster, key=lambda x: name_stats[x]["total"])
            for n in cluster:
                if n in pre_assigned:
                    continue
                score = 100.0 if n == anchor else float(
                    fuzz.token_sort_ratio(n, anchor)
                )
                alias_rows.append((
                    n,
                    name_stats[n]["display"],
                    slug,
                    "dedup_pipeline",
                    score,
                    "auto",
                    None,
                    None,
                ))
            if len(cluster) > 1:
                merge_log.append((
                    "merge",
                    None,
                    slug,
                    None,
                    sum(name_stats[n]["count"] for n in cluster),
                    "scripts/09",
                    f"fuzzy auto-merge, {len(cluster)} variants",
                ))

        # ── Route garbage names to the sentinel entity ──────────────────────
        # Sentinel row itself is seeded by scripts/09b via manual_donor_merges.yaml;
        # we only need to upsert aliases pointing each garbage string at it.
        if garbage_names:
            print(f"Routing {len(garbage_names):,} aggregation markers → "
                  f"{SENTINEL_SLUG!r}…", flush=True)
            for n in garbage_names:
                if n in pre_assigned:
                    continue
                alias_rows.append((
                    n,
                    name_stats[n]["display"],
                    SENTINEL_SLUG,
                    "dedup_pipeline",
                    None,
                    "auto",
                    None,
                    None,
                ))
            merge_log.append((
                "sentinel_route",
                None,
                SENTINEL_SLUG,
                None,
                sum(name_stats[n]["count"] for n in garbage_names),
                "scripts/09",
                f"{len(garbage_names)} aggregation markers routed to sentinel",
            ))

        if entity_rows:
            print(f"\nUpserting {len(entity_rows):,} entities (in chunks of {CHUNK:,})…",
                  flush=True)
            upsert_entities(cur, entity_rows)

        if alias_rows:
            print(f"Upserting {len(alias_rows):,} aliases (in chunks of {CHUNK:,})…",
                  flush=True)
            upsert_aliases(cur, alias_rows)

        if merge_log:
            execute_values(cur, """
                INSERT INTO donor_merge_log
                    (action, from_slug, to_slug, alias_text,
                     rows_affected, actor, rationale)
                VALUES %s
            """, merge_log, page_size=1000)

        # ── Write gray-zone pairs to review queue ──────────────────────────
        if gray:
            # Dedup pairs: one row per candidate (worst offender), not both directions
            seen = set()
            q_rows = []
            for a, b, score in gray:
                key = tuple(sorted([a, b]))
                if key in seen:
                    continue
                seen.add(key)
                # Candidate = lower-$ name; proposed canonical = higher-$ name
                if name_stats[a]["total"] >= name_stats[b]["total"]:
                    winner, loser = a, b
                else:
                    winner, loser = b, a
                q_rows.append((
                    slugify(name_stats[loser]["display"]),
                    name_stats[loser]["display"],
                    existing.get(winner, (slugify(name_stats[winner]["display"]),))[0],
                    name_stats[winner]["display"],
                    float(score),
                    "fuzzy_gray",
                    float(name_stats[loser]["total"]),
                ))
            print(f"Enqueuing {len(q_rows):,} pairs for human review…", flush=True)
            for i in range(0, len(q_rows), CHUNK):
                execute_values(cur, """
                    INSERT INTO donor_review_queue
                        (candidate_slug, candidate_name,
                         proposed_canonical_slug, proposed_canonical_name,
                         match_score, method, total_amount)
                    VALUES %s
                """, q_rows[i:i + CHUNK], page_size=1000)

        # autocommit=True, each chunk already persisted — "Committed." is the
        # orchestrator's completion marker, keep it.
        print("\nCommitted.")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
