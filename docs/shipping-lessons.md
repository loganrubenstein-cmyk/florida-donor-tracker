# Shipping Lessons

Running log of backend realities, data limitations, product decisions, and blockers discovered during the ship-this-week execution. Append-only (oldest → newest).

---

## 2026-04-22 · Task 1 · Nav structure

- **Duplicate nav entry found**: `/follow` was wired both as a top-level DIRECT link ("Follow $") AND inside the Tools dropdown ("Follow the Money"). Moving it to Analysis deduplicates at the same time. Lesson: audit for duplicate hrefs whenever reshuffling nav.
- **No `/analysis` hub page exists.** The Analysis dropdown is a label-only grouping; home page has an `AnalysisHub` component but no `/analysis` route. For the `/follow` breadcrumb, "Analysis" is rendered as plain text (not a link) to avoid 404. If we want `Analysis` to be clickable everywhere, we'd need an `/analysis` hub page — flagged as potential follow-up.
- **No `/explore` hub page either.** Same situation. Worth considering whether an Explore landing page is shippable (would help with tasks 5/6/11/17 which all add/move things to Explore).
- **Hub pages mirror nav imperfectly**: `app/tools/page.js` has its own ALL_TOOLS list, and `components/home/AnalysisHub.js` has a 5-group structure that doesn't match the nav groups. These will drift during tasks 11/17; plan to audit after the nav settles.
- **Product decision**: About kept as a dropdown `{ About, Methodology }` so Methodology isn't orphaned from nav.

## 2026-04-22 · Task 2 · Connections/Network tabs

- **Root cause of empty tabs**: `/api/ego`, `/api/connections`, `/api/committee-network` all query a Supabase view `connections_enriched` that does not exist in any migration (grep `supabase/` returns zero hits). Base table `entity_connections` (migration 007) does exist and is queried successfully by `lib/loadCommittee.js:70` for the "shared with" sidebar badge — that still works.
- **Evidence this was already known**: commit `dde33c7` added an empty-state for Connections. The tabs have been broken-but-gracefully-empty for a while.
- **Decision**: deleted the Network tab (Candidate/Politician) + Connections & Network tabs (Committee) rather than try to build the enriched view this week. Kept the base `entity_connections` table + the sidebar badge untouched.
- **Kept (out of Task 2 scope, flagged)**: `/app/connections/page.js` and `/app/api/connections/route.js` still exist — the standalone `/connections` page is under Analysis dropdown and is also broken for the same reason (queries `connections_enriched`). Do NOT forget this when auditing Analysis items. Options later: build the view, switch API to `entity_connections`, or delete the page.
- **Lesson**: before building UI around a DB view, confirm the view exists in migrations. Don't trust code that names an enriched view — grep the migrations.

## 2026-04-22 · Task 4 · Avg contribution size

- **No pre-computed avg exists anywhere** in Supabase tables or views. Every candidate/committee/donor/principal row has `total_*` and `num_contributions` — the math is done client-side at render. Kept it that way (no DB change) — one division is cheap, adding a materialized column would be overkill for this.
- **Only existing reference implementation**: `components/compare/DiffBars.js` computed `avg_donation = hard_money_total / hard_num_contributions` ad-hoc. Now replaced by shared `lib/fmt.js#fmtAvgContribution` — one source of truth.
- **Display pattern chosen**: embed as muted sub-line on the existing count tile (not a new stat tile). Keeps the existing grid layouts intact across 4 different profile components that each defined their own StatBox.
- **Formatter rule**: cents under $1k, whole dollars above. Returns "—" when count is 0/missing. The render sites omit the "avg $X" phrase entirely when not computable (so the UI never shows "avg —").
- **Skipped entities and why** — see shipping-plan.md Task 4 table. Main rationale: industries/cycles are aggregate views where a global avg would smear individual behavior; legislator/lobbyist don't have contribution-giver models.

## 2026-04-22 · Task 9 · Elections House/Senate split

- **Data is clean for chamber split**: `contest_name` is deterministic (`"State Representative"` or `"State Senator"`). No parsing needed. No orphan races. Chamber info also available on Supabase `legislators.chamber` but not needed here since the JSON already has it.
- **Brittleness flag**: the chamber filter uses exact-match on `contest_name`. If the FL DOE scraper (`scripts/55_fetch_election_results.py`) ever changes those strings (e.g. "State Rep." abbreviation), the filter silently drops rows. Add a test or normalize at ingest.
- **IA decision**: chose three top-level tabs over nested sub-tabs. Flatter = clearer. If we ever add "Federal" or "County Judges" to this page, we'd rethink.

## 2026-04-22 · Task 8 · Industries viz

- **Stacked Recharts trend chart with 15-industry legend is hard to read at any height**. On mobile (130px) segments blur into a single color band. Labeled horizontal bars solve this — every row carries its own label, no legend lookup needed.
- **Trend data doesn't have to live on every page**. We had `industry_trends.json` loaded on the /industries index AND on each industry profile page. The aggregate page rarely needs time-series — individual profile pages do. Pushed the trend responsibility to profiles, simplified the index.

## 2026-04-22 · Task 10 · IE distinctiveness

- **IE data coverage is honest but thin**. 509,961 total expenditures, but only ~3.1% have stance parsed, and only 26% of candidate hints match an actual FL DOE finance account. Enough to tell a story for ~24 candidates; not enough for a comprehensive coverage claim.
- **`ie_committee_totals` and `ie_year_totals` Supabase views exist in prod but not in `supabase/migrations/`**. The /ie page renders correctly, so they're in the DB, but they'd disappear on a fresh init. Must be captured as migration before next data reset.
- **Pre-built-but-unwired component trap**: `components/ie/IECandidatesTable.js` exists and looks polished, but expects a data shape that doesn't match what `public/data/ie/by_candidate_targeted.json` ships. Don't assume an unused component is "almost ready" — verify the contract before quoting it as a quick win.
- **Product call**: IE stays under Analysis, not moved to Explore. The new "Top Targeted Candidates" section answers the "who benefits" question with today's data. Reframing/removing not needed.

## 2026-04-22 · Task 12 · Pulse freshness

- **No automated ingestion exists**. `/run_pipeline.command`, `scrape_new_committees.command`, etc. are all manually double-clicked. Data is consistently 6–14 days stale. This is a real backend gap — flag for Post-ship: set up GitHub Actions cron for daily or weekly pipeline runs.
- **The `candidates` table has no `filing_date`/`updated_at`**. We cannot honestly show "new candidate filings" on /pulse this week. Two paths forward for later: (a) add a timestamp column + backfill; (b) diff snapshots at ingest and emit an append-only `candidate_filings` event log. Option (b) is cleaner long-term.
- **Freshness-claim honesty matters**. /pulse previously claimed "past 30 days" on contributions and "current cycle" on committees without backing filters. Users comparing to FL DoE would spot it in 10 seconds. Now the filters match the claims (90d filter for contributions; `YYYY-01-01` cutoff for committees) AND we surface a "Data current through: {latest_date}" footer so stale data is visible, not hidden.
- **Wider window + honest footer beats narrower window + stale data**. Chose 90 days over 30 to compensate for the manual-refresh lag. If we ever set up daily ingest, we can tighten the window safely.

## 2026-04-22 · Task 14 · /follow key votes silent failure

- **Supabase PostgREST does NOT error on missing columns the way I expected**. `/api/follow/route.js` was selecting `vote, session_year, bill_url` — none of those exist on `legislator_votes`. The query returned with the real columns only; the missing columns silently became `undefined`. Render path then displayed nothing or `undefined` because my JS mapped `v.vote` (undefined) to the output. No error anywhere.
- **Lesson**: when a section "rarely populates", always re-verify the schema vs. the SELECT before investigating data coverage. Two minutes saves a day.
- **T1 ownership**: legislator_votes + bill_sponsorships are T1's territory this week (commit `7ac86d3` wired lobbyist counts). Fixed only the consuming API, not the table. Handoff doc `docs/handoff-follow-dream-flow.md` respects this by proposing ADDITIVE bridging tables (donor_principal_links_v, principal_lobbied_bills) rather than modifying T1's tables.
- **Dream-flow gap is real and substantial**. Donor↔Principal name match has no table; Principal→Bill data is in static JSON not Supabase. Full chain needs ~5–6 days. Not negotiable to ship this week. Handoff doc is the honest answer.

## 2026-04-22 · Task 16 · Google Civic retirement verified

- **Google Civic Representatives API was turned down April 30, 2025** — already offline, not pending. Verified via Google's official Civic Information API group announcement. User's "goes offline April 2026" recollection was a year off.
- **Google's migration path is `divisionByAddress`**: returns Open Civic Data IDs (OCD-IDs) only, not officeholder data. Google points users at Ballotpedia/BallotReady/Cicero for the representatives layer. So replacing our lookup with Google alone is impossible.
- **Canonical alternatives**: FL House and FL Senate both publish official "Find Your Representative/Senator" tools. Link-out is the smallest, safest, most accurate solution for this week. Deferred in-page address-to-district (OpenStates / Geocod.io) as later polish.
- **Marketing-copy honesty**: three surfaces claimed "zip code" entry (`app/tools`, home AnalysisHub, ToolHubTabs). None of them ever actually worked that way. Always audit tool-hub prose when you change a tool's entry UX — copy rots when it doesn't match the form.

## 2026-04-22 · Task 17 · New /expenditures page

- **Missing-view pattern continues**: `vendor_totals_mv` is referenced in `/api/vendors/route.js` but not defined in migrations (third instance this week — see `connections_enriched`, `ie_committee_totals`). Do not assume MVs exist just because code queries them.
- **Built around verified tables**: `committee_expenditure_summary` (script 64) and `candidate_expenditure_summary` (migration 002) are definitely populated. Stayed away from RPCs (`get_vendor_profile`) and MVs that can't be confirmed.
- **Product framing**: /vendors is vendor-centric ("who gets paid"); /expenditures is entity-centric ("who spends the most"). Complementary, not competing. Future work could merge or add a category cut, but this week's version tells its own clean story.
- **Cross-linking honesty**: added a chip to /vendors but flagged in follow-up risk that if /vendors relies on the missing MV, the chip may land on a broken page. Cheap to verify post-ship.

## 2026-04-22 · RESOLVED · Missing-view migrations captured by T1

- T1 committed migrations capturing every view/table we flagged as "referenced in code but missing from migrations":
  - `032` — `ie_committee_totals`, `ie_year_totals`
  - `033` — bill tables
  - `034` — lobbying comp tables
  - `035` — `shadow_orgs`, `official_disclosures`, `email_signups`
  - `036` — `vendor_totals_mv`
- All use `IF NOT EXISTS` so they're idempotent against the live DB.
- T1 also confirmed `legislator_votes` columns are `vote_text` and `session_id` (matching the /follow API fix). No pending rename.
- Action: the /vendors cross-link chip on /expenditures is now safe; /ie continues to work as expected and is reproducible from a fresh init.
- Future GitHub Actions auto-ingest: T1 owns review when someone builds it (knows which pipeline scripts are idempotent vs destructive).

## 2026-04-22 · Visual QA pass #1 (post-T1 migrations)

- **/follow votes had a SECOND silent bug**. The earlier fix corrected column names on `legislator_votes`. But the lookup was still querying a nonexistent table called `politicians` — the real table is `legislators` with `acct_num` (not `candidate_acct_num`). Corrected. For any FL state legislator-turned-candidate (e.g. Keith Truenow, acct 83638), votes should now populate.
  - **Lesson**: the silent-failure pattern bites harder when both the table name AND the column names are wrong. The previous audit caught column errors; a full schema-vs-query grep before declaring a fix complete would have caught this earlier.
- **/map FL outline was hand-simplified; real outline existed at `components/shared/FloridaOutline.js`**. Swapped in. ViewBox changed from 800×700 to 520×430; projection recalibrated with Tallahassee + Miami anchor points.
- **Marketing link typo**: FL House URL is `flhouse.gov` not `myfloridahouse.gov`. Fixed.
- **Legislature nav was a direct link**, not a dropdown. Rebuilt as a proper dropdown with Legislators, Elections, Cycles, Party Finance, Bills (moved out of Analysis). Top-level `/legislature` hub still reachable as the first item in the dropdown.
- **Industries year filter**: `industry_trends.json` already had by-year aggregates; just needed client interactivity. Extracted the ranking bars into a client component with a year selector (2014, 2016, 2018, 2020, 2022, 2024, 2026, plus "All years" default).

## 2026-04-22 · Visual QA pass #2 (post-user-feedback)

- **/map still needs more UI/UX work**. Current state: real FL outline in place, 3-anchor affine projection for city placement, Keys compression, hover-synced legend of top 24 cities below the map. Known open items: some cities may still misalign (FL's tilt is non-uniform; linear fit can't perfectly match a hand-drawn outline), no zoom, no county layer, no click-through to donor list by city. Parking for later.
- **/follow votes** has a second fallback now: if `legislators.acct_num` doesn't match the clicked candidate acct (legislator's row only holds LATEST cycle), look up candidate's name + district + chamber in `candidates` and match legislators by last_name/district/chamber. Honest empty state if both paths fail.
- **/committees showing 0 members** → confirmed upstream data gap. `committee_memberships` table is empty or missing most rows. Already flagged in `fl_data_pipeline_gaps.md`. Backend task.
- **Geo Group donor→principal mismatch**: added third fallback in `lib/loadDonor.js` — strips THE/A/AN + corp suffixes and does an `ilike` name match against `principals` table when slug-based match fails. Should catch "the-geo-group-inc" donor → "geo-group-inc" principal type mismatches. Broader fix (donor_principal_links_v view) is in `docs/handoff-follow-dream-flow.md`.
- **"What is / What are" dropdowns** removed on /candidates and /committees directory pages. Content now inline + always visible. `explainerOpen` state cleaned up.
- **Bill profile pages** don't exist yet — only `/lobbying/bill/[slug]` and `/lobbying/bills` directory; no dedicated bill detail page with title/summary/sponsors/votes/lobbied-by. Backend task: need bills table with metadata.
