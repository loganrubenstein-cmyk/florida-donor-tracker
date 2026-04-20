# Florida Donor Tracker — Data Integrity + Automation Overhaul

**Status as of 2026-04-17:** Stage A complete. Stage B Phase 2 in progress (script 09 full run PID 39123).

---

## Context

The site's pipeline has become "smart not hard" — fragile, manual, and producing visible data errors that hurt the project's credibility:

- **FPL shows $330M / 37k contributions on the homepage but only ~$30M on `/donor/florida-power-light-company`.** Root cause: (a) `DonorTable.js` derives the profile URL via `slugify(donor.name)` instead of `donor.slug`, and (b) dedup leaves multiple un-merged donor records per entity. `donors.total_combined` is computed one way; `donor_committees`/`donor_by_year` another.
- **Committee 70275 (Friends of Ron DeSantis → Empower Parents PAC) needed bespoke scripts to appear at all.** The `committees` table has no `former_name`/name-history field.
- **Soft-linkage edges are not externally verifiable.** The six-pass matcher (script 78) is sound, but the frontend exposes no link back to the solicitation filing, no filing date, no status, no confidence badge.
- **Reconciliation is one-directional.** Script 85 raises totals but never lowers them → stale inflated numbers survive (Florida Realtors drift: $136M).
- **No automation.** The only scheduled workflow is a quarterly reminder (GitHub issue). All scrapers are double-click `.command` files.

**Goal:** a site whose every number is externally verifiable, whose pipeline runs on a schedule with alerting, and whose data updates automatically after each FL campaign-finance filing deadline — without manual babysitting.

**User decisions locked in:** Full overhaul · GitHub Actions runtime · Rebuild canonical donor model · Add source-URL verification everywhere.

---

## Phase 1 — Data-Accuracy Foundation (blocking; everything else builds on it)

### 1.1 Fix the frontend FPL symptom immediately (smallest-diff quick win)

- **File:** `components/donors/DonorTable.js:90`
  - Change `href={`/donor/${slugify(donor.name)}`}` → `href={`/donor/${donor.slug || slugify(donor.name)}`}`
- Audit every call site of `slugify(donor.name)` and replace with `donor.slug` when the record already carries a slug.
- **File:** `lib/loadDonor.js:17-21` — add fuzzy-slug fallback: if exact `.eq('slug', slug)` returns nothing, try `.ilike('name', name_from_slug)`.

### 1.2 Build a canonical donor entity model (source of truth)

**New tables (migrations in `supabase/migrations/`):**

- `donor_entities` — canonical entity per real-world donor
  - `canonical_slug` (PK), `canonical_name`, `is_corporate`, `corp_ein`, `corp_number`, `industry`, `notes`, `created_at`, `updated_at`
- `donor_aliases` — every contributor-name variant that maps to a canonical entity
  - `alias_text` (PK), `alias_text_normalized`, `canonical_slug` (FK), `source` (enum: `dedup_pipeline`/`manual_merge`/`corp_match`/`lobbyist_match`), `match_score` (nullable), `verified_by` (nullable), `verified_at` (nullable)
- `donor_merge_log` — audit trail of every merge/split decision (append-only). Action enum: `create_entity`/`merge`/`split`/`reassign_alias`/`delete_alias`/`note`/`sentinel_route`.

**Seed data:** Back-fill from current `donors` table; each existing slug becomes a canonical entity. Curated merge list applied on top via `data/manual_donor_merges.yaml`:
- FPL: all variants → `florida-power-light-company`
- Florida Realtors: all variants → `florida-realtors`
- Walt Disney Co: all subsidiaries → `the-walt-disney-company`
- Publix, U.S. Sugar, Florida Chamber, AIF, GEO Group, FHBA
- `aggregated-non-itemized` sentinel entity for FL DoE aggregation markers
- `gaetz-family` placeholder (blocks fuzzy merging of Don vs Matt Gaetz)

### 1.3 Rebuild dedup as a deterministic canonical pass

**`scripts/09_deduplicate_donors.py`** — rewrite. Logic:
1. Load contributor name totals from contributions
2. Pre-pass: exact-normalized-name match → canonical_slug
3. Corporate pass: EIN match → canonical_slug (highest confidence)
4. Fuzzy pass: token_sort_ratio ≥ 92 AND token_set_ratio ≥ 95 within same first-letter bucket
5. **Option D guards:** reject clusters >50 members OR cohesion <88 (min pairwise score). Dissolves transitive chains (A~B~C where A and C aren't similar).
6. **Option B sentinel routing:** GARBAGE_RE detects FL DoE aggregation markers ("MEMBERSHIP DUES", "1 MEMBER @ $225,000", "ANONYMOUS $500", "PAYROLL DEDUCTIONS") and routes to `aggregated-non-itemized` sentinel.
7. Ambiguous pairs (0.85 ≤ score < 0.92) written to `donor_review_queue` for manual adjudication.

**Resilience for long runs (added 2026-04-17 after SSL timeout on 22M-row attempt):**
- TCP keepalives on psycopg2 connection
- `autocommit=True` + chunked execute_values (CHUNK=5000)
- `SET statement_timeout = '3600s'` to bypass Supabase's 8-min pool default
- **Close DB connection** after load phase, run fuzzy clustering purely in-memory, **reopen fresh connection** for upsert phase. A 3h idle SSL session to Supabase will be killed by the pooler even with keepalives.
- **Cache fuzzy results** to `data/logs/09_clusters.json` before upsert phase. If upsert fails, relaunch with `--resume-from-cache` — skips the 3h load+fuzzy.

**`scripts/09b_apply_manual_merges.py`** — reads curated `data/manual_donor_merges.yaml` and upserts to `donor_aliases` with `source='manual_merge'`. Version-controlled merge authority.

Every downstream loader (`41_load_contributions.py`, `42_load_candidate_contributions_supabase.py`, `25_export_donor_profiles.py`) rewrites `donor_slug` on every row via a JOIN against `donor_aliases`. **Contributions become source-of-truth; `donors` table becomes a derived rollup.**

### 1.4 Make `donors` a derived materialized view (ends the drift problem)

Replace the current `donors` table with a Postgres materialized view `donors_mv` rebuilt from `contributions` + `donor_entities` on every load. Script 85 (reconcile) becomes `REFRESH MATERIALIZED VIEW donors_mv` and fails the build if post-refresh totals don't match contributions sum within $0.01.

### 1.5 Committee name-history + closed-committee auto-discovery

**Schema additions:**
- `committees.former_names` JSONB — ordered list of `{name, effective_date, source_url}`
- `committees.status` ENUM — `active`/`closed`/`terminated`/`revoked`
- `committees.successor_acct_num` nullable FK

**Pipeline:**
- Fold `02b_discover_closed_committees.py` logic into `02_download_registry.py` as a first-class step.
- Every registry refresh: (a) pull active, (b) pull all-letter closed, (c) diff, (d) scrape any newly-appearing acct_num, (e) write name-history rows.
- Retire one-off scripts `82_load_committee_70275.py` and `83_backfill_contributions_70275.py` once 70275 is fully represented via the normal pipeline.

**Frontend:**
- `lib/loadCommittee.js` — include `former_names` in select
- `components/committee/CommitteeProfile.js` — render "Formerly known as" block
- `/committee/70275` search works whether searched as "Friends of Ron DeSantis" or "Empower Parents PAC"

### 1.6 Verification block for Phase 1

Release-blocking:

1. `/donor/florida-power-light-company` shows same `total_combined` as homepage #1 row (within $1).
2. `SELECT SUM(total_combined) FROM donors_mv` = `SELECT SUM(amount) FROM contributions` (within $0.01).
3. `/committee/70275` renders "Formerly: Friends of Ron DeSantis" and shows ≥$200M total.
4. Search for "Friends of Ron DeSantis" returns 70275 as top hit.
5. Integrity audit (84) finds zero rows in Check A and Check B drift < $100 per donor.

---

## Phase 2 — Soft-Linkage Quality + Source Verification

### 2.1 Schema: every edge carries its source

- `candidate_pc_edges` — add `source_url`, `source_filing_id`, `source_filing_date`, `source_filing_status` (`active`/`withdrawn`/`amended`), `confidence_score` (0-1), `match_method`.
- `shadow_orgs` — add `source_url`, `source_filing_date`, `fec_filing_url`.

### 2.2 Script 78 populate source fields on every pass

- Pass 1 (SOLICITATION_CONTROL): FL DoE solicitations source URL + filing id
- Pass 2-3 (DIRECT/OTHER distribution): expenditure row URL (TreFin/expend view)
- Pass 4-5 (IEC/ECC): independent-expenditure filing URL
- Pass 6 (ADMIN_OVERLAP): mark `publishable=false`, store shared-attribute basis as JSONB evidence

### 2.3 Running-mate handling — generalize

Extend beyond Gov/Lt.Gov: build `running_mate_pairs` table from candidate-registry metadata. Dedup any PAC where all linked candidates are from the same ticket, keeping only top-of-ticket.

### 2.4 Confidence badges + source links in UI

- `ConfidenceBadge.js` — render "High (92%)" / "Medium (78%)" / "Low (65%)"
- `CandidateProfile.js` — each soft-money row gets confidence badge, "View filing →" link, filing date caption (grayed if withdrawn)
- Shadow PAC sections — show FL solicitation link + FEC Form 8872 + ProPublica side-by-side

### 2.5 Verification block for Phase 2

1. Spot-check 10 random soft-money rows — every row has a working source link
2. Click through FPL → candidate they support → verify solicitation filing matches
3. Running-mate spot check: Gillum/King, DeSantis/Nunez, Putnam/Lopez-Cantera show only top-of-ticket

---

## Phase 3 — Reconciliation, Auditing, Smoke Tests

### 3.1 Bi-directional reconciliation

- Rewrite `85_reconcile_donor_aggregates.py` as full rebuild (covered by making `donors` an MV).
- New `85b_reconcile_committees.py` — same pattern for `committees.total_received`/`num_contributions`.

### 3.2 Expand `84_audit_data_integrity.py` from 4 checks to ~15

Add:
- Check E — committees in solicitation but missing from `committees` (shadow-PAC gap)
- Check F — contributions with `donor_slug` having no `donor_entities` row (orphans)
- Check G — candidates with no linkage edges but filed solicitation (false-negatives)
- Check H — edges with conflicting `link_type` (should never happen)
- Check I — homepage top-100 donors: `donors_mv.total_combined == SUM(contributions)` per donor
- Check J — expend.exe 502 detector: committee with $1M+ contributions but zero expenditures
- Check K — former_name coverage: every `status != 'active'` has `former_names` entry OR "never renamed" note
- Check L — solicitation records where `organization` didn't match committees — manual triage
- Check M — FPL/Realtors/Disney/Publix totals vs. external anchors in `data/external_anchors.yaml` (fail if drift >5%)
- Check N — candidate totals vs. FL DoE extractCanList.asp (100 random spot-check)
- Check O — cycle totals vs. FL DoE cycle reports

### 3.3 Nightly smoke test

`scripts/99_smoke_test.py` — read-only production check:
- Top-10 donors: homepage → profile → `total_combined` matches within $1
- `/committee/70275` renders former name + $200M+ total
- `/influence` top-10 entities render
- Known search query returns expected results
- Nonzero exit on any discrepancy

### 3.4 Verification block for Phase 3

1. All checks A–O pass in CI
2. Nightly smoke test green for 7 consecutive days

---

## Phase 4 — Automation on GitHub Actions

### 4.1 Pipeline containerization

- `.github/actions/run-script/action.yml` — composite: checkout → setup Python → restore cache → run script N → upload logs
- `scripts/config.py` — read all secrets from env (no `.env.local` assumed on CI)
- `requirements.txt` pinned via pip-tools

### 4.2 Scheduled workflows

| Workflow | Cadence | Purpose |
|---|---|---|
| `daily-new-committees.yml` | 6 AM ET daily | 02 + 02b (new + closed PACs) |
| `daily-contributions.yml` | 7 AM ET daily | 03 resumable scrape since last manifest |
| `weekly-transfers.yml` | Sunday 4 AM ET | 11 (fund transfers, ~40 min) |
| `weekly-lobbyists.yml` | Sunday 5 AM ET | 14, 47 (lobbyist + comp) |
| `quarterly-full-refresh.yml` | Jan/Apr/Jul/Oct 11 noon ET | Full pipeline 01→99 |
| `nightly-smoke.yml` | 2 AM ET daily | 99 + 84 read-only; opens issue on failure |
| `expend-exe-watchdog.yml` | Hourly | HEAD request; 12h+ 502 → issue tagged `data-source-down` |

### 4.3 Alerting + observability

- Every workflow: on failure opens GitHub issue via `peter-evans/create-issue-from-file`, tagged `pipeline-failure` + severity
- Optional Slack webhook on high-severity
- `lib/dataLastUpdated.js` reads from new `pipeline_runs` table (workflow, run_id, started_at, finished_at, status, rows_added, rows_updated)

### 4.4 GitHub-managed-secrets migration

- Document in `docs/automation.md`: all secrets under repo Settings → Actions
- Rotate any keys in local `.env.local`
- Add `gitleaks` pre-commit hook

### 4.5 Verification block for Phase 4

1. Every workflow runs green in first scheduled window
2. `expend-exe-watchdog.yml` manual trigger confirms issue-creation path
3. Inject deliberate integrity failure → nightly smoke opens GitHub issue within 24h
4. Homepage "Updated X" label reflects latest successful quarterly run

---

## Execution order (hard dependencies)

1. **Phase 1.1** (frontend link fix) — 30-min deploy, closes visible FPL bug
2. **Phase 1.2 → 1.3 → 1.4** — donor model rebuild (careful data migration)
3. **Phase 1.5** — committees name-history (parallel with 1.2-1.4)
4. **Phase 2** — depends on Phase 1 (canonical model needed for confidence badges)
5. **Phase 3** — depends on Phase 1 + 2
6. **Phase 4** — depends on Phase 3 (schedule only after pipeline is deterministic)

Estimated: Phase 1 ~1-2 weeks, Phases 2-3 another 1-2 weeks, Phase 4 another week. Total ~4-5 weeks.

---

## Overall verification (end-to-end acceptance)

- `/`, `/donor/florida-power-light-company`, `/committee/70275`, `/influence`, `/candidates` show consistent numbers agreeing within $1
- Every soft-money edge has a clickable source URL
- `84_audit_data_integrity.py`: all 15 checks pass
- `99_smoke_test.py` green for 14 consecutive nights
- A new FL quarterly filing deadline passes → data updates automatically within 72 hours
- Any pipeline failure opens GitHub issue within 1 hour
- User can answer "where did this $X number come from?" by clicking ≤2 links to the FL DoE / FEC / IRS source

---

## Current Progress (2026-04-17)

### Stage A: Additive schema — COMPLETE
- Migration 015: donor_entities, donor_aliases, donor_merge_log ✓
- Migration 018: linkage source verification columns ✓
- Migration 019: pipeline_runs + external_anchors ✓
- Migration 020: linkage view rebuild ✓
- Migration 021: merge_log sentinel_route action ✓

### Stage B: Canonical dedup cutover — IN PROGRESS
- 09b seeded 9 canonical entities + aliases ✓
- Script 09 rewrite with Option B (sentinel) + Option D (cohesion guards) ✓
- 50K smoke test green ✓
- 1M endurance test green ✓
- 22M production run attempt #1: **failed** at `load_name_totals()` due to 8-min statement_timeout
- 22M attempt #2: **failed** at first upsert chunk with SSL SYSCALL timeout (3h fuzzy clustering lost)
- 22M attempt #3 (**PID 39123, currently running**): added close-conn-before-fuzzy + reopen-before-upsert + JSON cache of fuzzy results. Resume flag `--resume-from-cache` skips load+fuzzy if upsert phase fails again.

### What's next after 22M run succeeds
- Stage B cutover (Task #11): rewrite loaders 25/41/42 to JOIN against donor_aliases
- Phase 1.4: materialized view donors_mv
- Phase 1.5: committees name-history
- Phase 2-4 as above

### Key files
- `scripts/09_deduplicate_donors.py` — current version with reconnect+cache fix
- `scripts/09b_apply_manual_merges.py` — YAML → aliases
- `data/manual_donor_merges.yaml` — canonical entity seed
- `data/logs/09_full_run.log` — live log of PID 39123
- `data/logs/09_clusters.json` — cache (created after fuzzy phase completes)
