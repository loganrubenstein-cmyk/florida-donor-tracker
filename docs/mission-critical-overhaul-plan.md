# Mission-Critical Data Overhaul — Candidates / Contributions / Expenditures

**Saved:** 2026-04-20
**Scope:** Fix gaps identified in the 2026-04-19 report card

## Dependency order + risk classification

```
C1 (safe cleanup) ──┐
C2 (read-only analysis) ──┼── (independent, do first) ──┐
                    │                                    │
E1 (DDL migration) ─────┐                                │
                        ├── E2 (loaders) ── E3 (workflow)│
                        │                                │
                        └── E5 (pc_edges backfill) ──────┘
                                                         │
                                      E4 (vendor canon) ─┘  ◄── scope too large, deferred
```

## Phase C1 — Future-dated contribution cleanup (tiny) — ✅ RESOLVED 2026-04-19

**Original:** 74 contribution rows with `contribution_date > 2030-01-01` (max year 9919).

**Status:** Already clean. `SELECT COUNT(*) WHERE contribution_date > '2030-01-01'` = 0. Cleanup applied sometime before this check. Max date today is 2026-10-30, with only 5 rows beyond `CURRENT_DATE + 30` — realistic amounts/names, likely minor typos not worth mass-nulling.

---

## Phase C2 — pc_edges source-URL gap analysis — ✅ RESOLVED 2026-04-19

**Original:** 46,656 pc_edges; 19,232 (41%) missing `source_url`. Is it (a) scriptable recovery or (b) legitimately unmatchable?

**Result:** **100% category (b)**. All 19,232 missing-URL rows are `edge_type=ADMIN_OVERLAP_ONLY, source_type=registry` — edges inferred from shared treasurer/chair across two registry entries. There is no single filing document to link to; the relationship is derived from comparing registrations. All `DIRECT_CONTRIBUTION_TO_CAND` (25,039) and `SOLICITATION_CONTROL` (2,360) edges already carry URLs.

**Frontend follow-up (different ticket):** `candidate_pc_edges` rows with `edge_type='ADMIN_OVERLAP_ONLY'` should render "Derived from shared registry admin (treasurer/chair overlap)" instead of a broken source-link slot.

**Phase E5 (pc_edges source-URL backfill) is RETIRED** — there is nothing scriptable to recover.

---

## Phase E1 — Expenditures schema migration (moderate, reversible)

**Problem:** Only summary tables exist. Row-level expenditures live in gitignored `public/data/expenditures/` JSON — not queryable from Supabase.

**Migration 021:**
```sql
CREATE TABLE expenditures (
  id               bigserial PRIMARY KEY,
  acct_num         text NOT NULL,
  expenditure_date date,
  amount           numeric(14,2),
  vendor_name      text,
  vendor_addr      text,
  purpose          text,
  expense_type     text,
  source_filing    text,
  retrieved_at     timestamptz DEFAULT now(),
  UNIQUE (acct_num, expenditure_date, amount, vendor_name, purpose)
);

CREATE INDEX expenditures_acct_idx ON expenditures (acct_num);
CREATE INDEX expenditures_date_idx ON expenditures (expenditure_date);
CREATE INDEX expenditures_vendor_trgm ON expenditures USING gin (vendor_name gin_trgm_ops);

CREATE TABLE candidate_expenditures (
  id               bigserial PRIMARY KEY,
  candidate_id     bigint REFERENCES candidates(id),
  acct_num         text,
  expenditure_date date,
  amount           numeric(14,2),
  vendor_name      text,
  vendor_addr      text,
  purpose          text,
  expense_type     text,
  source_filing    text,
  retrieved_at     timestamptz DEFAULT now(),
  UNIQUE (candidate_id, expenditure_date, amount, vendor_name, purpose)
);

CREATE INDEX cand_exp_cand_idx ON candidate_expenditures (candidate_id);
CREATE INDEX cand_exp_date_idx ON candidate_expenditures (expenditure_date);
CREATE INDEX cand_exp_vendor_trgm ON candidate_expenditures USING gin (vendor_name gin_trgm_ops);
```

**Risk:** Low — additive only, no existing table modified.

**Exit:** Both tables exist, 0 rows.

---

## Phase E2 — Loader scripts (moderate)

**Deliverables:**
- `scripts/43_load_expenditures.py` — reads `data/processed/expenditures.csv`, upserts to `expenditures`
- `scripts/44_load_candidate_expenditures.py` — reads `data/processed/candidate_expenditures.csv`, joins to `candidates` by acct_num, upserts to `candidate_expenditures`

**Pattern:** Model on `scripts/41_load_contributions.py` — COPY into staging temp table, then INSERT … ON CONFLICT DO NOTHING into target.

**Exit:** Local run loads all current CSVs; row counts logged.

---

## Phase E3 — Daily-expenditures workflow (low, structural)

**Deliverable:** `.github/workflows/daily-expenditures.yml`

Steps (gated on `expend.exe` up):
1. Probe `expend.exe` (skip entire job if 502, existing watchdog handles alerting)
2. `04_scrape_expenditures.py --since-last-manifest`
3. `07_import_expenditures.py`
4. `43_load_expenditures.py`
5. `35_scrape_candidate_expenditures.py --since-last-manifest`
6. `36_import_candidate_expenditures.py`
7. `44_load_candidate_expenditures.py`

Schedule: `0 12 * * *` (one hour after contributions scrape to avoid concurrency on expend.exe).

**Exit:** One manual dispatch succeeds end-to-end.

---

## Phase E4 — Vendor canonicalization — DEFERRED

This is an analog of the `donor_entities` build-out (T3 Phase 1). Scope ≈ 2 days. Not starting autonomously; requires user alignment on dedup strategy and name-normalization rules.

---

## Phase E5 — pc_edges source-URL backfill

**Blocked on C2.** Only actionable if C2 shows scriptable misses exist.

---

## Execution order this session

1. ✅ (already done) Phase A + B of registration PDF parser — supporting scaffolding
2. C1 → C2 (fast, safe)
3. E1 schema migration
4. E2 loaders (local test)
5. E3 workflow (push, manual dispatch)
6. Report back with end-state metrics
