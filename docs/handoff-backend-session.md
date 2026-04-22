# Handoff: Backend Fixes Session

Consolidates every backend issue discovered during the 17-task front-end shipping sweep + the follow-up visual QA. Use this as the entry prompt for a new session focused entirely on backend.

---

## Context

The front-end was rebuilt/cleaned this week. Front-end work is merge-ready. A set of backend issues came up along the way — some are true data-pipeline gaps, some are missing Supabase schema/views, some are name-matching logic. T1 already closed one round (migrations 032–036 captured missing views). This session is for the remaining items.

The relevant docs:
- `docs/shipping-plan.md` — per-task front-end log
- `docs/shipping-lessons.md` — running lessons, including backend discoveries
- `docs/handoff-follow-dream-flow.md` — the big multi-phase plan for donor→principal→bill→vote chain (still the right plan for the dream flow)
- `docs/handoff-backend-session.md` — this file

---

## URGENT blockers (ship-blocking; fix first)

### 1. `committee_memberships` table is empty or sparsely populated ✅ DONE 2026-04-22

**Root cause was NOT an empty table.** `committee_memberships` had 811 rows, `legislative_committees` had 65, 57 chairs — all fully joinable in raw SQL. The bug: migration `012_legislature_foreign_keys.sql` was never applied to the live DB, so PostgREST returned `PGRST200 "Could not find a relationship between committee_memberships and legislators"` on every embed → UI saw empty member arrays.

**Fix applied**: migration `037_committee_memberships_fks.sql` re-adds `fk_cm_people_id` and `fk_cm_abbreviation` idempotently (via `DO $$ ... pg_constraint` guard), then `NOTIFY pgrst, 'reload schema'`. 0 orphan rows pre-check; constraints applied without truncation. Embedded query now returns 811/811 with legislators and 57 chairs.

**Follow-ups** (not done this session — T1 territory):
- Migration 012 also declared `legislator_votes.people_id` and `bill_sponsorships.people_id` FKs. These are still missing in the live DB. Adding them requires T1 coordination.
- Lesson: whenever PostgREST returns `PGRST200`, check `pg_constraint` before assuming a view/table is missing.

---

### 2. `candidates` table has no `filing_date` / `updated_at` timestamp ✅ DONE 2026-04-22

**Symptom**: `/pulse` can't honestly show "new candidate filings" because the table has no way to detect which rows are new. Filtered out from /pulse for this reason.

**Affected files**:
- `supabase/migrations/002_candidates.sql` — table definition
- `scripts/01_import_finance.py` (?) — ingest script
- `app/api/pulse/route.js` — the missing "candidate filings" tab

**Fix**: add `file_date DATE` and `updated_at TIMESTAMPTZ DEFAULT NOW()` columns. Backfill `file_date` from FL DoE source data if available. Add `updated_at` trigger so changed rows bubble up.

**Unlock**: /pulse can add a "New Candidate Filings" tab that genuinely shows non-quarterly changes.

**What was done 2026-04-22:** No migration needed — `candidates` already has `date_start DATE` and `date_end DATE` columns (populated for 4,868/7,304 rows, 67%; current-cycle coverage is effectively complete — 2026 entries filed March–April 2026). Handoff doc was stale.

Added the `/pulse` "New Candidates" tab:
- `app/api/pulse/route.js` new `type=candidates` handler queries `candidates.date_start >= now() - N days` (default 60).
- `components/home/PulsePage.js` adds a 4th context-strip card ("New Candidates") + `CandidatesTable` with Filed / Candidate / Office / Party / Cycle columns linked to `/candidate/[acct_num]`.
- Verified: API returns recent filings (Scott Wilkins 2026-04-08 etc.); UI renders the tab.

---

### 3. Donor ↔ Principal name-matching is thin ✅ PARTIAL 2026-04-22

**Symptom**: `/donor/the-geo-group-inc?tab=lobbying` shows no lobbying despite GEO Group being a registered FL lobbying principal. Many corporate donors fail to link to their principal record.

**Affected files**:
- `lib/loadDonor.js` — three fallback paths now: (a) `has_lobbyist_link` flag + `principal_donation_matches`, (b) exact slug match, (c) name-normalized `ilike` match (added in visual QA pass #2).
- `principal_donation_matches` table — migration 005; population logic unclear
- `principals` table — authoritative list of registered FL principals

**Investigation needed**:
- How is `donors.has_lobbyist_link` set? Probably a flag script that matches donor names to principal names. Likely thresholded too high, missing common prefix/suffix variants.
- `principal_donation_matches.contributor_name` vs `donors.name` — is the matching done at ingest time, or inferred at query time?

**Fix (small)**: lower the match threshold OR add a prefix/suffix normalization step to the population script so "THE GEO GROUP, INC." and "GEO Group" both resolve.

**Fix (proper)**: create a `donor_principal_links_v` materialized view (outlined in `docs/handoff-follow-dream-flow.md` Phase 1) — uses `pg_trgm` similarity + manual override table. Target ≥60% match rate on top 500 corporate donors.

**What was done 2026-04-22 (small fix, query-side only):** Rewrote Fallback B in `lib/loadDonor.js` — shared `normalizeCorpName()` helper that upper-cases, strips periods, drops comma-separated suffix segments (THE, INC, LLC, LTD, CORP, CO, COMPANY, PA, PLLC, PC, NA, USA, etc.), then strips head/tail suffix words. Both donor and principal candidates run through it; pick is exact-normalized match, falling back to substring containment. Verified: GEO Group, Publix, FPL, Lockheed, Walt Disney Company all resolve. Disney Worldwide Services correctly rejects (no matching principal).

**Still outstanding (proper fix):**
- `scripts/16_match_principals.py` has `_MIN_TOKEN_LEN = 4` which filters short brand names from the blocking index entirely; GEO/CVS/UPS/IBM-style names never enter candidate pool. Lower to 3 and re-run 16→25→26→40 to widen `principal_donation_matches` table. Not done this session (pipeline re-run scope).
- Materialized view with `pg_trgm` + manual override is the dream-flow Phase 1 target — still queued.

---

### 4. Bills have no dedicated profile page — just `/lobbying/bill/[slug]` ✅ DONE 2026-04-22

**Symptom**: User asked for bill profile pages with the bill **title** (not just bill number). Today's site shows `HB 1019` as a label but no landing page that aggregates: title, sponsors, votes, lobbied-by, status, full text link.

**Affected files**:
- `supabase/migrations/033_*.sql` — T1 just added bill tables
- `bill_sponsorships`, `legislator_votes` — already exist
- `lobby_bill_filings` or similar — not sure if this exists (see `docs/handoff-follow-dream-flow.md`)
- `/lobbying/bill/[slug]/page.js` — exists but is scoped to lobbying angle, not full profile

**Fix**:
- Confirm schema of bills table (T1 migration 033). Should have: `bill_id`, `bill_slug`, `bill_number`, `session_year`, `title`, `summary`, `status`, `full_text_url`, `last_action_date`
- Create a new route `/bill/[slug]/page.js` that shows: hero (title + status), sponsors, votes by chamber, lobbied-by principals, any news coverage
- Add a loader `lib/loadBill.js`
- Backfill `bill_title` everywhere `bill_number` is shown — `legislator_votes.bill_title` is already populated for 2025–2026 data; extend to historical years

**Note**: memory `bill_number_backfill.md` says all 30,880 `legislator_votes` rows now have `bill_number` filled in (done 2026-04-19). So the data is there. Just needs the UI.

**What was done 2026-04-22:**
- `lib/loadBill.js` joins `bill_info` (title/status/sponsor/last_action) + `bill_sponsorships` + `legislator_votes` (roll-call tally aggregated by chamber) + `bill_disclosures` (lobbied-by principals), keyed by `bill_slug` ↔ zero-padded `bill_number` (e.g. `hb-1019` ↔ `H1019`).
- `app/bill/[slug]/page.js` renders hero (bill #, session year, title, status, sponsor, last action), session selector when multiple years exist, House/Senate floor-vote cards (Yea/Nay/NV + date), sponsors list (linked to `/politician/...`), top-30 lobbied-by principals with "View all" link, FL Senate external link, and DataTrustBlock.
- Verified: `/bill/hb-1019` → Perfluoroalkyl bill, Enrolled, 130 sponsors, 15 principals, 10s first-compile. `/bill/hb-1` → shows 2018–2024 session selector. Nonexistent slugs 404.
- Did NOT alter `legislator_votes` / `bill_sponsorships` schema (T1 territory). No `bill_title` backfill attempted this item — legislator_votes.bill_title is already populated for current sessions per `bill_number_backfill.md`; historical gaps fall into item #7 (bill_slug normalization).

---

## MEDIUM priority (should-have, not ship-blocking)

### 5. `/map` needs UI/UX work + better data wiring

**Known gaps**:
- Cities not in the hardcoded `FL_CITY_COORDS` table are invisible (counted in footer, not plotted)
- Projection is a 3-anchor affine fit — accurate for Tallahassee/Jacksonville/Miami but looser for cities between. FL's tilt is non-uniform.
- No zoom, no county overlay, no click-through ("show donors from Miami" → /donors?city=MIAMI)
- No out-of-state view (except the existing Cities/States/In-Out tab bar)
- Bubble overlap in Miami/Fort Lauderdale/Broward area — hard to click small bubbles

**Fix options**:
- **Small**: expand `FL_CITY_COORDS` lookup table (currently ~45 cities); add a fine-tune pass per major city
- **Medium**: swap inline SVG outline for `react-simple-maps` + FL TopoJSON for precise projection
- **Medium**: add click-through to `/donors?city=X&state=FL`
- **Large**: add county choropleth or ZIP-level aggregation

### 6. `connections_enriched` view doesn't exist; `/connections` page is broken ✅ DONE 2026-04-22

**Symptom**: Standalone `/connections` page (under Analysis dropdown) queries `connections_enriched` — a view not defined in any migration (still, as of last check). Page may render empty or error.

**Affected files**:
- `app/connections/page.js`
- `app/api/connections/route.js`
- Base table `entity_connections` (migration 007) exists and has data

**Fix**: either create the `connections_enriched` view (joining `entity_connections` with `committees`/`donors` to resolve names + types), OR rewrite the API to query `entity_connections` directly and enrich in JS.

**What was done 2026-04-22:** The view _already exists_ on the live DB (was created ad-hoc at some point and never committed as a migration). Columns match exactly what `app/api/connections/route.js` queries, and `/api/connections?limit=3` returns enriched rows. The problem was drift risk: if the DB got rebuilt from migrations the view would vanish, which matches the "missing-view pattern" lesson.

Migration `038_connections_enriched_view.sql` captures the live definition via `CREATE OR REPLACE VIEW`. It joins `entity_connections` to `committee_meta` twice (once per side) to resolve treasurer/chair/address names and type_code for both entities. Applied; 56,107 rows.

---

### 7. Bill number normalization across tables ✅ DONE 2026-04-22

**Symptom**: `legislator_votes.bill_number` is strings like `HB 1019`; `bill_sponsorships` and lobby disclosures use different identifiers. Helper `billNumberToSlug()` in `lib/fmt.js` exists but isn't used consistently.

**Fix**: normalize at ingest time — every table that refers to a bill should include `bill_slug` (canonical `hb-1019` form) + `session_year` (biennium start). Update any script that writes bill_number to also write bill_slug.

**What was done 2026-04-22:**
- Migration `039_bill_slug_normalization.sql` adds `bill_slug TEXT` to `legislator_votes` and `bill_sponsorships` (ADD COLUMN IF NOT EXISTS), plus a SQL helper `fl_bill_number_to_slug(text)` mirroring the JS `billNumberToSlug`. Backfilled 100% of rows (30,880 votes + 3,744 sponsorships). Created `lv_bill_slug_idx` and `bs_bill_slug_idx`.
- Updated `scripts/73_load_legislator_votes.py` and `scripts/74_fetch_bill_sponsors.py` to include `bill_slug` in CREATE TABLE, compute it via `_bill_number_to_slug()` at row build time, and write it via COPY. Future re-ingests preserve the column.
- `session_year` intentionally NOT added — can always be derived from `bill_info (bill_slug, year)` via `bill_info_bill_slug_year_key` unique index. Revisit if a direct column is needed.
- `lib/loadBill.js` still uses `slugToBillNumber()` at query time because it joins on `bill_number` (which was already populated). Now that `bill_slug` is populated, downstream code can join directly on it.

---

### 8. No automated ingestion pipeline

**Symptom**: Data is 6–14 days stale at any given moment. Every refresh is a manual double-click on `run_pipeline.command`, `scrape_new_committees.command`, etc.

**Fix**: GitHub Actions workflow that runs the pipeline nightly or weekly. T1 explicitly volunteered to review when someone builds it (knows which scripts are idempotent vs. destructive). See `docs/shipping-lessons.md` for context.

**Honest framing**: `/pulse` now shows "Data current through: {date}" + a weekly-cadence caveat, so users aren't misled. But eventually this should be daily-automated.

---

## LOWER priority (polish)

### 9. `vendor_canonical_slug` columns are NULL for most expenditure rows

Vendor canonicalization schema exists (migrations 024, 028). The dedup pipeline (scripts 46a/46b) creates canonical rows, but `expenditures.vendor_canonical_slug` and `candidate_expenditures.vendor_canonical_slug` may still be NULL for rows processed before the dedup ran. VendorBar + /vendors rely on this being populated.

**Fix**: backfill `vendor_canonical_slug` after dedup pipeline runs. Add a one-shot UPDATE script or a trigger.

### 10. `get_vendor_profile(p_slug)` RPC missing from migrations

Referenced in `lib/loadVendor.js` but not in `supabase/migrations/`. T1 added the `vendor_totals_mv` view; the RPC may still be live-only.

**Fix**: capture the function definition as a migration.

### 11. Investigations page — content refresh cadence

`public/data/research/annotations.json` was generated 2026-04-08 with 11 entities. No automated refresh. Not a backend bug, just content drift.

**Fix later**: editorial process for adding entities. Out of scope for backend session.

---

## Execution order for the backend session

1. **Committee memberships ingest** (#1) — highest user-visible value; page is broken without it
2. **Donor-principal fuzzy match** (#3) — small-scope data-layer improvement that unblocks multiple donor/principal cross-links
3. **Bills profile page + title backfill** (#4) — needs schema confirmation from T1, then new route + loader
4. **`candidates.file_date` column** (#2) — unlocks "new candidate filings" on /pulse
5. **`connections_enriched` view** (#6) — either build it or retire the /connections page
6. **Bill slug normalization** (#7) — cross-cutting cleanup
7. **Vendor canonical backfill** (#9) + **get_vendor_profile RPC migration** (#10)
8. **GitHub Actions cron** (#8) — owner: T1 for review, anyone for build
9. **/map improvements** (#5) — low urgency, large scope; pick small wins first (expand coords table, add click-through)

---

## Critical not-to-do list

- **Do NOT touch `legislator_votes` schema** — T1 is active on it. Use it, don't modify it.
- **Do NOT alter `bill_sponsorships` schema** — same.
- **Do NOT skip `IF NOT EXISTS`** on any new migration. T1 established this pattern for idempotency against the live DB.
- **Do NOT assume a view exists just because code queries it.** Three instances this week of missing views (`connections_enriched`, `ie_*_totals`, `vendor_totals_mv`). Always `grep supabase/migrations/` first.
- **Do NOT commit to `main` without coordinating with T1** — their pipeline commits and ours share too much territory.

---

## Quick-fire context the next session needs

- Project: `~/Claude Projects/florida-donor-tracker`, Next.js App Router, plain JS (no TS), Supabase backend
- Branch: `main` (clean after this session's work)
- `CLAUDE.md` at project root has the front-end conventions
- Supabase schema lives in `supabase/migrations/`
- Pipeline scripts in `scripts/` — numbered by approximate execution order
- T1 is on vote/bill territory; T2 was on front-end audit (merged); T3 (this session) just finished the sweep

Good luck.
