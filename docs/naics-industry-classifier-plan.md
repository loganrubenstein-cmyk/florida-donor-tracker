# NAICS-Based Donor Industry Classifier — Plan

## Goal
Enrich every donor's `industry` field with a confidence-tiered classification
that overlays the existing occupation-string heuristic with real 6-digit
NAICS codes from authoritative sources. Output feeds aggregates
(`industry_by_committee`, `industry_trends`, etc.) and backend queries;
no new frontend required.

## Data reality (audited 2026-04-19)

### Donor population
- **1,061,588 total donors**
- **47,981 corporate** (is_corporate=true)
- **1,013,607 individual**
- Current `donors.industry`: only 9 rows populated — the existing
  `industry_classifier.py` writes to committee-level aggregates, not the
  donor row. Greenfield.

### NAICS-tagged entity sources
| Source | Distinct names | NAICS coverage | Identity cols | Notes |
|--------|---------------|----------------|---------------|-------|
| `lobbyist_registrations` | 5,191 principals | 100% (27,421 rows) | name + addr only | 6-digit NAICS; most reliable for FL-active firms |
| `federal_contracts`      | 2,530 recipients | 100%               | `recipient_uei` (not EIN) | 6-digit NAICS from USASpending |
| `principals`             | 4,034            | 100%               | name + slug only | Overlaps heavily with lobbyist_registrations |
| **Union (dedupe by normalized name)** | ~6–8K unique (to be measured in Phase 0) | | | principals and lobbyist_registrations share the FL lobbying universe |

### Sunbiz (fl_corporations) — revised role
- 3.9M corp records, all with EIN
- **No NAICS field** in Sunbiz filings
- `federal_contracts` has `recipient_uei`, **not EIN** — so the Sunbiz EIN → federal_contracts NAICS bridge **does not exist** in current data
- Reduced use: corp-existence confirmation only (donor is a real FL entity), not an industry lookup path
- Re-evaluate if we ingest a UEI↔EIN crosswalk (SAM.gov) or a new NAICS source with EIN

### Individual donors — the constraint
- `contributions.contributor_occupation` exists (213K distinct)
- **No `employer` column** in contributions schema
- So the NAICS path for individuals is blocked at the source — can't
  classify someone via employer NAICS when we never captured the employer
- Existing 15-bucket occupation heuristic remains the only tool for
  individuals

## Realistic coverage estimate

**Corporate donor NAICS coverage** (to be verified in Phase 0 audit — EIN bridge removed):
- Exact name match: est. 3–5K / 48K (~8–10%)
- Fuzzy name match (trigram ≥ 0.75): est. +5–8K (~20–25% total)
- EIN bridge: **not available** (federal_contracts has UEI, not EIN)
- **Total realistic: 20–25% of corporate donors get NAICS by count**

That's not nothing: corporate donors account for disproportionate dollar
volume. Even 30% coverage by count likely means 50–70% by dollars.

## Design

### Schema additions
Non-destructive: add columns to `donors`:
```sql
alter table donors add column if not exists naics_code text;
alter table donors add column if not exists naics_source text;
    -- 'lobbyist_registration' | 'federal_contract' | 'principal' |
    -- 'ein_match' | 'occupation_heuristic' | null
alter table donors add column if not exists naics_confidence text;
    -- 'exact' | 'fuzzy' | 'ein' | 'inferred' | null
alter table donors add column if not exists naics_match_score numeric(5,2);
```
Re-use existing `donors.industry` for the final 15-bucket label (set by
either NAICS→bucket mapping or occupation heuristic, whichever wins).

### NAICS → bucket mapping
6-digit NAICS → existing 15-bucket taxonomy. Stored in
`scripts/naics_to_bucket.py` as a `dict[str, str]` keyed by 2-digit
sector with per-6-digit overrides for special cases (e.g. 813910
"Business Associations" → Political/Lobbying, not "Other").

### Pipeline — script 21b
New script `scripts/21b_enrich_donor_naics.py`:

1. Build NAICS lookup table (union of 3 sources, deduped by normalized name; when a
   name appears in multiple sources, prefer lobbyist_registrations > principals >
   federal_contracts based on FL-specificity)
2. For each corporate donor:
   - Pass 1: exact normalized-name match → `naics_source=<src>`, confidence=exact
   - Pass 2: trigram ≥ 0.75 (pg_trgm) → confidence=fuzzy
   - Pass 3: *(EIN bridge removed — no UEI↔EIN crosswalk available)*
3. For each individual donor:
   - Apply occupation heuristic → `naics_source=occupation_heuristic`
4. Map NAICS → bucket, write `donors.industry` + metadata columns
5. Invariant audits (dollar preservation, no-nulls for corporate after
   merge, confidence-tier distribution)

### Idempotency
Script truncates the 4 new columns, rebuilds from scratch each run.
Deterministic given the same input data.

## Testing discipline

### Phase 0 — coverage audit (before any build)
Script: `scripts/21a_audit_naics_coverage.py` (test-only, no writes)
- Output: exact-match count per source, fuzzy match distribution by
  threshold (0.60–0.95 sweep), overlap between sources
- Output: top 50 corporate donors by total $ with their best candidate
  NAICS matches for eyeball review
- **Gate**: if realistic coverage < 15% of corporate donors, stop —
  this project isn't worth it in its current form

### Phase 1 — labeled regression set
`tests/naics_classifier_labels.csv` — 200+ hand-labeled
(donor_name, expected_naics_2digit, expected_bucket, rationale) rows:
- Obvious corps: "FPL GROUP" → 22 Utilities → Energy/Utilities
- Ambiguous: "MIAMI ASSOCIATES" → could be real estate, legal, or random
- Negative controls: "JOHN SMITH" individual → should NOT get NAICS
- Edge cases: PACs, unions, religious orgs, 501c3/4s

### Phase 2 — threshold sweep
Mirror 46a approach: pg_trgm threshold sweep 0.60–0.95 against labeled
set, pick tiebreaker that minimizes FP rate first, then FN.

### Phase 3 — invariants
- Row invariant: count(donors) unchanged after enrichment
- Dollar invariant: SUM(donor.total_combined) unchanged
- Coverage invariants: corporate donors with naics_source IS NOT NULL ≥ threshold
- Bucket distribution: no single bucket > 40% (sanity check for runaway
  classification)
- Cross-check: top 20 donors by $ — eyeball for plausibility

### Phase 4 — visual smoke tests (Puppeteer)
If frontend consumes the new columns:
- `/donors` directory filtered by industry
- `/industry/[slug]` — new top donors list
- Confirm no empty bars for buckets that previously had data

## Deferred / out of scope
- Employer field for individual donors — would require re-ingesting
  contributions CSV with a new column; massive pipeline change
- Non-FL out-of-state donor NAICS — no source available
- Industry inheritance for donor children (e.g. foundations) — handled
  by entity graph, separate concern

## Order of operations
1. Write Phase 0 audit script
2. Run Phase 0, report coverage numbers
3. Get gate decision (user approves proceed or halt)
4. Build labeled regression set
5. Threshold sweep
6. Build 21b enrichment script
7. Run + audit
8. Update docs + memory
