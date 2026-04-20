# Vendor Canonicalization Plan

**Status:** Draft — 2026-04-19
**Owner:** Claude + Logan
**Source mission:** mission-critical-overhaul-plan.md Phase E4

## Problem

`expenditures.vendor_name` and `candidate_expenditures.vendor_name` are free-text strings from EFDMS filings. Same real-world vendor appears under dozens of variants:

- `"FACEBOOK"`, `"FACEBOOK INC"`, `"FACEBOOK, INC."`, `"META PLATFORMS"`, `"META PLATFORMS INC"`
- `"USPS"`, `"U.S. POSTAL SERVICE"`, `"UNITED STATES POSTAL SERVICE"`
- `"PAYPAL"`, `"PAYPAL INC"`, `"PAYPAL HOLDINGS"`

This blocks: vendor profile pages, "top vendors" rankings, industry-level spend analysis, and cross-committee vendor network views.

## Goals

1. **Resolve each vendor_name to a canonical entity** without mutating the raw string.
2. **Preserve data scope** — the full row count and full dollar total must survive canonicalization.
3. **Filter false positives AND false negatives** — per user directive.
4. **Be auditable** — every merge decision logged with rationale and row count.
5. **Be idempotent + deterministic** — re-running the pipeline must not renumber cluster IDs.

## Non-goals

- Classifying vendors by industry/NAICS (separate task).
- Linking vendors to committees they also donate to (script 45 already does this).
- Mutating `vendor_name` in the raw expenditure tables.

## Model (mirrors `donor_entities` from migration 015)

New migration: `supabase/migrations/024_vendor_canonical_model.sql`

```sql
create table vendor_entities (
  canonical_slug  text primary key,
  canonical_name  text not null,
  is_government   boolean default false,      -- USPS, state agencies, etc.
  is_franchise    boolean default false,      -- "Marriott Orlando" vs "Marriott Tampa"
  corp_ein        text,
  corp_number     text,                       -- Sunbiz doc number if matched
  notes           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create table vendor_aliases (
  alias_text           text primary key,      -- normalized, uppercase
  alias_text_display   text,
  canonical_slug       text not null references vendor_entities(canonical_slug) on update cascade,
  source               text not null check (source in (
    'dedup_pipeline','manual_merge','corp_match','self'
  )),
  match_score          numeric(5,2),
  review_status        text default 'auto',
  verified_by          text,
  verified_at          timestamptz,
  created_at           timestamptz default now()
);

create table vendor_merge_log (...);         -- same shape as donor_merge_log
create table vendor_review_queue (...);      -- same shape as donor_review_queue
```

**FK columns** (non-destructive) on expenditure tables:
```sql
alter table expenditures add column vendor_canonical_slug text;
alter table candidate_expenditures add column vendor_canonical_slug text;
create index ... on expenditures (vendor_canonical_slug);
create index ... on candidate_expenditures (vendor_canonical_slug);
```

The raw `vendor_name` stays untouched. Joins go through `vendor_aliases` → `vendor_entities`.

## Scripts

| Script | Purpose | Idempotent? |
|---|---|---|
| `scripts/_vendor_norm.py` | Pure normalization primitives (uppercase, strip punct/suffixes, collapse whitespace). Unit-tested. | N/A |
| `scripts/46b_build_vendor_entities.py` | Build `vendor_entities` + `vendor_aliases` from all vendor_name variants in both expenditure tables. Cluster via trigram + rules. Deterministic cluster ID = MIN(normalized) per cluster. | Yes |
| `scripts/46c_link_vendor_ids.py` | Populate `vendor_canonical_slug` FK on both expenditure tables by joining on normalized vendor_name → vendor_aliases. | Yes |
| `scripts/46d_audit_vendor_canon.py` | Run 5 invariants + print cluster stats + top-20 merges for eye-check. Exit non-zero on invariant failure. | Yes |

(46b/c/d chosen because 46_match_ie_candidates.py already exists; 46_* is the closest-available cluster.)

## Normalization rules (`_vendor_norm.py`)

1. `UPPER()` everything.
2. Strip corporate suffixes at the *end* only: `INC`, `INCORPORATED`, `LLC`, `L.L.C.`, `LTD`, `LIMITED`, `CORP`, `CORPORATION`, `CO`, `COMPANY`, `LP`, `L.P.`, `LLP`, `PLLC`, `PA`, `PC`, `PLC`, `TRUST`, `HOLDINGS`.
3. Strip trailing ampersand/comma noise.
4. Replace `&` → `AND` (so "AT&T" and "AT AND T" collide intentionally — but *both* sides must apply).
5. Remove all non-alphanumeric except spaces.
6. Collapse whitespace; trim.
7. Returns empty string for garbage inputs (nulls, pure punctuation) — those get dropped, not clustered.

**Not stripped:** geographic suffixes ("TAMPA", "ORLANDO") — keep franchises distinct.

## Clustering strategy

**Pass 1 (exact):** Group by normalized form. Every variant that normalizes to the same string → one cluster. Source = `self`.

**Pass 2 (prefix+trigram):** For clusters with freq ≥ 2 in Pass 1, find pairs where:
- trigram similarity ≥ 0.85 (Postgres `similarity()` via pg_trgm), AND
- first token matches exactly (guards against "AMERICAN EXPRESS" ↔ "AMERICAN AIRLINES"), AND
- neither is flagged as franchise/government.

Merge into the lexicographically smallest canonical_slug. Source = `dedup_pipeline`, `match_score` = similarity × 100.

**Pass 3 (EIN/Sunbiz):** If `corp_number` matches across clusters → force-merge. Source = `corp_match`. (Deferred to later run — requires joining to `corporations_active`.)

**Review queue:** Pairs with 0.75 ≤ similarity < 0.85 go to `vendor_review_queue` instead of auto-merging.

**Defaults for singletons:** freq=1 vendors get their own entity. Not force-clustered.

## Threshold-setting discipline (per user's "tests, audits" directive)

**BEFORE picking 0.85**, hand-label `tests/vendor_canon_labels.csv` with ~150 pairs:
- 50 positive pairs (should merge): "FACEBOOK" / "FACEBOOK INC", "USPS" / "US POSTAL SERVICE"
- 50 negative pairs (should NOT merge): "AMERICAN EXPRESS" / "AMERICAN AIRLINES", "MARRIOTT ORLANDO" / "MARRIOTT TAMPA"
- 50 edge cases: franchises, law firms with partners' names, consultants with similar names

Sweep threshold 0.70 → 0.95 in 0.05 steps; pick the threshold that minimizes FN + FP on the labeled set. Record the confusion matrix in the audit output.

## Invariants (script 46d)

1. **Dollar invariant:** `SUM(amount) FROM expenditures` == `SUM(amount) GROUPED BY vendor_canonical_slug`. Pre/post must match to the cent.
2. **Row invariant:** `COUNT(*)` pre == `COUNT(*)` post. No row loss.
3. **Labeled-set scoring:** Run `tests/vendor_canon_labels.csv` through the normalizer+clusterer. TP/FP/FN/TN printed. Fail build if FP rate > 5% or FN rate > 10%.
4. **Cluster size distribution:** Print histogram of cluster sizes. Flag any cluster with > 1000 aliases (likely over-merge).
5. **Top-20 largest clusters:** Print their canonical_name + 5 sample aliases + total $ — hand-eyeball before marking green.

## Smoke tests (visual)

After pipeline green, Puppeteer-visit:
1. `/committee/[acct_num]` for a large committee (~Friends of Ron DeSantis) — expenditures tab should render, top vendors should group sanely, no merged garbage.
2. `/politician/[slug]` for a candidate with ≥ 100 expenditures — same check.
3. (Future) `/vendor/[slug]` directory — deferred; this phase produces the data only.

## Known traps

- **Government entities:** USPS, state agencies, cities. These appear under many spellings. Hand-seed `vendor_entities.is_government = true` for ~20 known cases; exempt them from auto-merge suffix stripping.
- **Franchises:** "Marriott", "Hilton", "Courtyard by Marriott". Geographic suffix differentiates location. Leave separate unless someone asks.
- **Law firms:** "Smith & Jones PLLC" vs "Jones & Smith PLLC" — not same firm. Token-order-sensitive similarity only.
- **Consultants:** "John Smith Consulting" vs "Smith Consulting LLC" — likely same person. Review queue.
- **Missing values:** Some rows have `vendor_name IS NULL` or empty. Those must not collapse into a phantom "blank vendor" entity; drop from canonicalization, leave `vendor_canonical_slug = NULL`.

## Rollout order

1. Write `_vendor_norm.py` + `tests/test_vendor_norm.py`. Run `pytest tests/test_vendor_norm.py` — green.
2. Hand-label `tests/vendor_canon_labels.csv`. Sweep thresholds. Commit labels + chosen threshold.
3. Apply migration 024 (empty tables).
4. Run `46b_build_vendor_entities.py` — populate entities/aliases.
5. Run `46c_link_vendor_ids.py` — backfill FKs.
6. Run `46d_audit_vendor_canon.py` — must exit 0.
7. Puppeteer smoke tests.
8. Only after all green → merge + announce.

## Deferred (not this phase)

- Vendor profile pages (`/vendor/[slug]`).
- Industry tagging for vendors.
- Cross-linking to committees/candidates the vendor also donates to (script 45 already exists for this).
- Corp match via Sunbiz/EIN — Pass 3.

## Open questions for Logan

None right now. Will surface if hand-labeling reveals edge cases I can't adjudicate.
