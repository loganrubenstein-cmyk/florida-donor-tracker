# Shipping Plan — Florida Influence (this week)

Owner: T3 (execution terminal). Coordinating with T1 (vote/bill data) and T2 (front-end audit, unshipped).

## Definition of done
- Clearer nav
- No broken or empty experiences
- Every retained metric is backed by real data
- Preserve URLs unless a task explicitly requires a route change
- Delete thin placeholders rather than paper over them

## Working rules
1. One task at a time, in order
2. Before each task: check git branch/status/recent commits and whether files overlap T1/T2 territory
3. Classify each task: IMPLEMENT NOW / INSPECT AND RECOMMEND / BLOCKED — NEEDS DECISION
4. Report format per task: What I found · Recommended action · (optional questions) → implement → files changed · what changed · follow-up risk · verify in UI
5. No batching. No skipping.
6. If a metric cannot be made meaningful with current data, remove/relocate/reframe — say so plainly.
7. Append discoveries to `docs/shipping-lessons.md`.

## Task list

1. **Nav bar** — Candidates · Committees · Donors · Legislature · Lobbying · Explore · Tools · Analysis · About. Move Follow the Money under Analysis.
2. **Connections / Network tabs** — inspect; delete if broken/low-value.
3. **Sources → In The News** — rename tab site-wide.
4. **Average contribution size** — shared computation utility, wire consistently.
5. **Explore cleanup** — dedupe Lobbyists/Principals/Firms.
6. **Solicitations** — move from Lobbying to Explore in nav + hubs.
7. **/flow** — delete column view; keep diagram only.
8. **/industries** — replace bar graph with more readable viz.
9. **/elections** — split House/Senate; check data support.
10. **IE** — audit distinctiveness vs contributions; reframe or de-emphasize.
11. **State Contracts** — move under Explore (nav + hubs).
12. **/pulse** — audit backend; propose smallest truthful version.
13. **Investigations** — audit only, implement only if low-risk.
14. **/follow key votes** — fix, replace, or handoff.
15. **/map** — replace with real FL geographic map of donor origins.
16. **/who-funds** — fix district lookup UX. Verify Google Civic status before recommending.
17. **/expenditures** — new page under Explore, distinct from contributions and IE.

## Task 1 — done summary

**Changed**
- `components/shared/NavLinks.js` — DIRECT + GROUPS rewritten to new order: Candidates, Committees, Donors, Legislature, then dropdowns Lobbying, Explore, Tools, Analysis, About
- Follow the Money moved to Analysis (top of list); removed from DIRECT and Tools (deduped)
- Donors and Legislature promoted from Explore dropdown to top-level direct links
- Old "Sources" group → renamed "About", order swapped so About is first (top of dropdown)
- `app/follow/page.js` — breadcrumb updated from `Home › Tools › Follow the Money` to `Home › Analysis › Follow the Money` (Analysis rendered as plain text since no /analysis hub exists)

**Follow-up risk**
- Hub pages still reference old structure (non-blocking for Task 1):
  - `app/tools/page.js` ALL_TOOLS array still includes `/follow` entry — leave for Task 14 cleanup or a separate pass
  - `components/home/AnalysisHub.js` 5-group structure — will be revisited as tasks 11/17 restructure Analysis
- Task 5 will refine Explore further (Lobbyists/Principals/Firms dedupe)
- Task 6 moves Solicitations Lobbying → Explore
- Task 11 moves State Contracts Analysis → Explore
- Task 17 adds Expenditures to Explore

**Verify in UI**
- `npm run dev`
- Confirm order top-to-bottom: Candidates, Committees, Donors, Legislature, Lobbying▾, Explore▾, Tools▾, Analysis▾, About▾
- Confirm "Follow the Money" appears only once (under Analysis dropdown)
- Click Analysis → Follow the Money → `/follow` loads; breadcrumb reads `Home / Analysis / Follow the Money`
- Open mobile menu (hamburger) → same structure
- Sanity-click each dropdown item → no 404

## Task 2 — done summary

**Changed**
- `components/committee/CommitteeProfile.js` — removed EgoGraph + CommitteeConnections imports; removed the Connections and Network tabs from the tabs array; removed the `connectionsContent` block
- `components/candidate/CandidateProfile.js` — removed EgoGraph import; removed the Network tab (this also covers politician pages since they render `CandidateProfile`)

**Deleted**
- `components/shared/EgoGraph.js`
- `components/committee/CommitteeConnections.js`
- `components/committee/CommitteeNetwork.js` (was already orphaned — never imported anywhere)
- `app/api/ego/route.js` (+ empty parent dir)
- `app/api/committee-network/route.js` (+ empty parent dir)

**Kept**
- `app/connections/page.js` + `app/api/connections/route.js` — used by the standalone `/connections` page in the Analysis dropdown. **Flagged as also broken for the same root cause** — revisit when auditing Analysis items.
- `lib/loadCommittee.js:70` — still queries base `entity_connections` for the "shared with" sidebar badge (works fine).

**Follow-up risk**
- Standalone `/connections` page is in nav but still broken. Either fix or remove in a later pass.
- If a user has bookmarked `?tab=network` or `?tab=connections` on a committee URL, the TabbedProfile should fall back gracefully to the default tab. Verify in UI.

**Verify in UI**
- `npm run dev`
- Committee page (e.g. any committee profile): tabs = Overview, Donors, Candidates, Payees, Transactions, Sources. No Connections/Network.
- Candidate page: tabs no longer include Network.
- Politician page: same (it renders CandidateProfile).
- Legislator page: unchanged.

## Task 3 — done summary

**Changed** (label rename only; tab id kept as `sources` to preserve existing URLs/bookmarks like `?tab=sources`)
- `components/candidate/CandidateProfile.js`
- `components/committee/CommitteeProfile.js`
- `components/donors/DonorProfile.js`
- `components/lobbyists/LobbyistProfile.js`
- `components/principals/PrincipalProfile.js`
- `components/cycles/CycleProfile.js`
- `components/industries/IndustryProfile.js`

All seven now render `label: 'In The News'` with a description reading "Recent news coverage, research links, and data sources".

**Follow-up risk**
- Content inside the tab still includes Research Links + DataTrustBlock (not strictly news). Each tab already has an "In the News" section at the top, so the rename is accurate. If we want a news-only tab, that's a content reshape in a later pass.
- Tab ID unchanged intentionally — if someone wants `?tab=news` URLs, that's a separate migration (aliasing).

**Verify in UI**
- Visit any candidate / committee / donor / lobbyist / principal / cycle / industry page
- Tab now labeled "In The News" instead of "Sources"
- Existing URLs like `?tab=sources` still work

## Task 4 — done summary

**Decision: which pages get avg contribution size**

| Entity | Gets avg? | Rationale |
|---|---|---|
| Candidate | ✅ yes | Hard money total ÷ hard_num_contributions — meaningful for fundraising analysis |
| Committee | ✅ yes | total_received ÷ num_contributions |
| Donor | ✅ yes | Combined total ÷ num_contributions → "avg check size written" |
| Principal | ✅ yes | donation_total ÷ num_contributions — useful for lobbying-principal giving patterns |
| Industry | ❌ no | Too coarse — aggregate across donor base obscures individual behavior |
| Cycle | ❌ no | Cycles tell trend stories, not per-gift stories |
| Legislator | ❌ no | Pages focus on votes/bills, not fundraising metrics |
| Lobbyist | ❌ no | Compensation-based model, no donation data |

**Changed**
- `lib/fmt.js` — added two new helpers:
  - `avgContribution(total, count)` — returns number or null (null when count=0)
  - `fmtAvgContribution(total, count)` — formatted string; uses cents under $1k, whole dollars above; returns "—" if not computable
- `components/committee/CommitteeProfile.js` — Contributions tile now shows `avg $X` as a sub-line below the count
- `components/candidate/CandidateProfile.js` — Hard Money tile sub updated from "N contributions" to "N contributions · avg $X"
- `components/donors/DonorProfile.js` — Combined Total hero now shows "N gifts · avg $X" as sub-line
- `components/principals/PrincipalProfile.js` — Donation Match tile sub updated from "N contributions" to "N contributions · avg $X"

**Shared pattern**
Computation lives in `lib/fmt.js` — one function, used consistently. Display pattern: embed as a muted sub-line on the existing Contributions / Combined Total stat tile (no new tiles added → grid layouts preserved).

**Follow-up risk**
- If `num_contributions` is missing/zero on a record, the "avg $X" text is omitted cleanly (not rendered) — no ugly "$0" or "NaN" visible
- The donor-to-candidate table shows total per candidate but not count — would need a column add to show per-candidate avg. Skipped for now
- No DB migration needed; computation is client-side at render

**Verify in UI**
- Candidate profile → Hard Money tile: "N contributions · avg $X"
- Committee profile → Contributions tile shows count on top, "avg $X" muted mono below
- Donor profile → Combined Total hero shows gifts + avg check
- Principal page with donation data → Donation Match shows count + avg

## Task 5 — done summary

**Changed**
- `components/shared/NavLinks.js` — Explore dropdown trimmed to `Transactions, Legislators`. Lobbyists/Principals/Lobbying Firms **moved into Lobbying dropdown** (they belong there conceptually and were out-of-place under Explore).
- Updated `extra` highlight-prefixes: entity profile pages (`/lobbyist/`, `/principal/`, `/lobbying-firm/`) now highlight the Lobbying nav group when active.

**Net effect**
- Lobbying dropdown: Lobbying Hub · Bills · Lobbyists · Principals · Lobbying Firms · Solicitations
- Explore dropdown: Transactions · Legislators (Tasks 6/11/17 add Solicitations/Contracts/Expenditures)
- No same-link-in-two-dropdowns duplication. Lobbying Hub page still lists its sub-pages (expected hub landing behavior).

**Follow-up risk**
- Lobbying dropdown now 6 items; Task 6 shrinks back to 5 when Solicitations moves out
- Tools hub page still lists these; deliberate hub-level presence, not a nav duplicate

## Task 6 — done summary

**Changed**
- `components/shared/NavLinks.js` — Solicitations moved from Lobbying dropdown to Explore dropdown
- `app/lobbying/page.js` — removed Solicitations hub card from the Lobbying hub grid; updated metadata description to drop "solicitation records"

**Net nav state**
- **Explore** dropdown: Transactions · Legislators · Solicitations
- **Lobbying** dropdown: Lobbying Hub · Bills · Lobbyists · Principals · Lobbying Firms (back to 5 items)

**Follow-up risk**
- Other surfaces still link `/solicitations` as a flat link (home AnalysisHub, about page, candidate list chips, legislature hub). None categorize it under Lobbying, so no further edits needed.
- `/solicitations` URL unchanged.

**Verify in UI**
- Lobbying dropdown no longer shows Solicitations
- Explore dropdown now shows Solicitations (3rd item)
- `/lobbying` hub grid no longer shows a Solicitations card

## Task 7 — done summary

**Changed**
- `components/flow/FlowPageClient.js` — rewritten to render only the Sankey `FlowClient`. Toggle removed, column branch removed.

**Deleted**
- `components/flow/FlowExplorer.js` (only used by column view)
- `components/flow/ColumnPanel.js` (only used by FlowExplorer)
- `app/api/flow/drill/route.js` + empty parent dir (only consumer was FlowExplorer)

**Net effect**
`/flow` now renders the Sankey flow diagram directly. FlowClient already has its own breadcrumb/title/DataTrustBlock so nothing was lost from the chrome.

**Follow-up risk**
- `FlowPageClient` is now almost trivial; could be inlined into `app/flow/page.js` later, but keeping the indirection for now since `FlowClient` needs `dynamic({ ssr: false })`

**Verify in UI**
- Visit `/flow` → Sankey diagram loads immediately, no view toggle, no column mode

## Task 8 — done summary

**Options considered**
- A. Horizontal labeled bar ranking — picked (simplest strong option; every row labeled; mobile-perfect; reuses site pattern)
- B. Small multiples of 15 mini-sparklines — too dense, legend-mapping problem persists
- C. Keep stacked, add interactivity — doesn't fix mobile readability

**Changed**
- `components/industries/IndustriesList.js`:
  - Removed the stacked Recharts trend chart and the `industry_trends.json` load
  - Added a labeled horizontal bar ranking in its place — one row per industry with: rank, name, proportional colored bar, total $, percentage. Each row is a link to the industry profile.
  - Kept the existing 8px proportional composition strip as a lightweight glance
  - Kept the existing 6-column table (already readable)
  - Updated the lede to reflect ranking (removed "how spending has shifted over 30 years" claim)

**Deleted**
- `components/industries/AllIndustriesTrendChart.js`

**Follow-up risk**
- Time-series visualization moved off this page; still available on each individual industry profile via `IndustryTrendChart`
- New viz is pure server-rendered HTML+CSS (no Recharts, no dynamic import) — faster load, no legend-mapping burden
- Mobile: three-column grid collapses by virtue of the widened `minmax(160px, 1.1fr)` + 2.5fr bar + auto $ amount. On very narrow screens the bar shrinks but name and $ remain visible.

**Verify in UI**
- Visit `/industries` → labeled horizontal bars replace the stacked trend chart
- Each bar clickable → navigates to `/industry/{slug}`
- Mobile: each row stacks cleanly; no horizontal overflow

## Task 9 — done summary

**Data check**: chamber is clean via `contest_name` string — deterministic "State Representative" vs "State Senator". No parsing ambiguity, no orphan races. 2024 sample: 220 House + 39 Senate. Clean split fully supported.

**IA decision**: top-level sibling tabs `Statewide · House · Senate` (replacing `Statewide · Legislature`). Flatter than nesting sub-tabs under Legislature.

**Changed**
- `components/elections/ElectionsView.js`:
  - Split `legRaces` into `houseRaces` and `senateRaces` (filter by prefix HD/SD)
  - Replaced `filteredLegRaces` with `applyLegSearch(races)` helper + `filteredHouseRaces` + `filteredSenateRaces`
  - `activeTab` now accepts `'statewide' | 'house' | 'senate'` (default still `'statewide'`)
  - Three top-level tab buttons with per-chamber counts
  - Chamber view uses new `chamberRaces`/`chamberLabel`/`chamberAllCount` vars; context sentence and empty-state copy reflect the active chamber

**Follow-up risk**
- Search in chamber tabs works per chamber. Cross-chamber search (e.g. "HD 11" while on Senate tab) returns empty — intentional, user can switch tabs.
- No query-param deep links to `activeTab=legislature` existed, so no URL compat to maintain.
- Data source `contest_name` is exact-match — if FL DOE changes labeling (e.g. "State Rep." vs "State Representative"), filter would silently drop. Flagging this in lessons.

**Verify in UI**
- Visit `/elections` → three tabs `Statewide · House · Senate` with counts
- Click House → only HD rows render; counter reads "NN of MM districts"
- Click Senate → only SD rows render
- Search still works per tab

## Task 10 — done summary (audit + minimal wiring)

**Audit verdict**: IE **is** conceptually distinct from contributions — it's non-coordinated outside spending with a for/against stance. The /ie page already surfaces the stance signal (For/Against stat cell + per-committee chips added 2026-04-22). What was missing: the "which candidates benefit" cut the user called out. Data for that already exists in `public/data/ie/by_candidate/*.json` (24 matched candidates) — it just wasn't wired into the UI.

**Chose**: lightweight wiring over reframing/moving. Keeping /ie under Analysis (correct home). Low-risk addition this week; no backend migration needed.

**Changed**
- `app/ie/page.js` — added `loadTargetedCandidates()` helper that reads every JSON file in `public/data/ie/by_candidate/` at render time and sorts by total IE amount. Added a new "Top Targeted Candidates" section between the two-column block and the DataTrustBlock — 12 cards showing matched candidate name (linked to politician/candidate profile), total IE amount, # committees, # expenditures, year range.

**Not done (deliberately deferred)**
- Wiring the pre-existing unused `components/ie/IECandidatesTable.js` component — the JSON-file data shape doesn't match its expected contract (no `by_year` in aggregated form, field names differ). Reshaping or modifying the component would be 1–2 hours of work; the 12-card grid covers the same user need with today's data shape.
- Stance-per-target breakdown (support vs oppose per candidate) — not in the JSON; would need re-aggregation. Flag for later.
- Integrating IE into candidate profile pages ("this candidate was opposed by $X") — bigger change, out of scope this week.
- Missing `ie_committee_totals` / `ie_year_totals` Supabase migrations — they aren't in `supabase/migrations/` but the page is rendering, so they exist as views in the live DB. **Flagged in lessons** — should be committed as a migration before next data reset.

**Follow-up risk**
- Only 24 candidates have matched IE data. Many hints ("DIGITAL", "GOVERNOR", "MIAMI MAYOR") never matched. The section shows the matched subset honestly — copy reads "{N} of the ~{estimate} unique targets parsed"
- If nobody refreshes `public/data/ie/by_candidate/` periodically, the section goes stale
- `ie_committee_totals` / `ie_year_totals` schema not in migrations — brittle if DB is ever re-initialized

**Verify in UI**
- Visit `/ie` → new "Top Targeted Candidates" section appears below Top Committees + year chart
- Click any candidate card → goes to the politician or candidate profile
- Mobile: cards wrap via auto-fill 320px grid

## Task 11 — done summary

**Changed**
- `components/shared/NavLinks.js` — moved `State Contracts` from Analysis dropdown to Explore (inserted after Legislators, before Solicitations); added `/contracts` to Explore's `extra` prefix list

**Not changed (deliberately)**
- `components/home/AnalysisHub.js` — Contracts remains in the "Influence in motion" thematic group with Lobbying/Solicitations/IE. The home hub groups are thematic, not a nav mirror.
- Breadcrumbs on /contracts — BackLinks already just shows `home`, nothing to update

**Net nav state**
- **Explore**: Transactions · Legislators · State Contracts · Solicitations
- **Analysis**: Follow the Money, Influence Index, Industries, Elections, Cycles, Party Finance, Indep. Expenditures, Connections, Pulse, Investigations

**Verify**
- Nav → Analysis no longer lists State Contracts
- Nav → Explore now shows State Contracts
- `/contracts` URL unchanged

## Task 12 — done summary

**Audit finding**: `/pulse` had no automated ingestion, data 6–14 days stale, AND two UI cards claimed time-bound coverage ("past 30 days", "current cycle") that the API did not enforce. Third card ("This Cycle") was already truthful.

**Chose**: Make claims true by adding the missing API filters + add an honest freshness footer. Skip the "new candidate filings" feed — `candidates` table has no `filing_date`/`updated_at` column so it can't be truthful this week.

**Changed**
- `app/api/pulse/route.js`:
  - **filings**: added `.gte('contribution_date', cutoff)` with a 90-day window (was: no time filter). Returns `latest_date` in payload.
  - **committees**: added `.gte('date_start', '{currentYear}-01-01')` — cycle filter is now enforced. Returns `latest_date`.
  - cycle branch unchanged (already truthful).
- `components/home/PulsePage.js`:
  - Breadcrumb fixed: `Home / Tools / Pulse` → `Home / Analysis / Pulse` (since /pulse lives under Analysis per Task 1). Analysis rendered as plain text (no /analysis hub exists).
  - Intro copy rewritten to drop "right now" marketing and tell users about weekly manual refresh cadence.
  - Card body copy updated: "past 30 days" → "past 90 days" (matches API); "current cycle" → "registered since Jan 1 of the current cycle"; "since January 1, 2026" → "since January 1 of the current cycle year" (time-agnostic — won't age).
  - New footer block: "Data current through: {latest_date}" + explanation that ingestion is weekly, not live.
  - Contribution threshold copy aligned to the actual API filter: "$25K+" (API is `.gte('amount', 25000)`; copy previously said "$10K+").

**Deliberately not done**
- No "new candidate filings" tab — table lacks a filing date field. Flagged as backend work in lessons.
- No cron/GitHub Actions setup — requires repo-level config decisions; out of scope for this nav-sweep.
- /solicitations not added to /pulse — freshness there is worse (14+ days), and it's already reachable via Explore.

**Follow-up risk**
- 90-day window is still wider than "live"; if the data snapshot is more than 90 days old (unlikely, but possible after a long gap), the filings table goes empty. The empty-state message still says "No recent large filings found" — honest enough.
- Cycle-year boundary (`YYYY-01-01`) rolls over at Jan 1; committee filter resets cleanly.

**Verify in UI**
- Visit `/pulse`
- Filings tab → shows rows with dates within ~90 days of latest DB contribution_date, NOT older rows
- Committees tab → only rows registered in current calendar year
- Footer reads "Data current through: {date}" with a weekly-cadence note
- Breadcrumb reads `Home / Analysis / Pulse`

## Task 13 — done summary (INSPECT ONLY)

**Audit verdict**: `/investigations` works today. Not broken, not empty, not dishonest. 11 curated entities in `public/data/research/annotations.json` (generated 2026-04-08) with sourced articles, matched live to Supabase committee/donor records for $ stats. `InvestigationsList.js` renders theme pills + article citations + profile links.

**What can ship now**: the page as-is.

**Additional stories feasible (content, not code)**: add entities to `annotations.json`. Candidates to consider:
- Associated Industries of Florida, Florida Chamber, GEO Group, CoreCivic, Florida Realtors PAC, Florida Power & Light (separate from NextEra parent)
- Each needs canonical_name + themes[] + 2–3 sourced articles

**What's missing (deliberately not built this week)**:
- Per-entity "last updated" timestamp (freshness signal)
- Theme filter / search within the page
- "Featured in Investigations" badge cross-linked from committee/donor profile pages
- Article link-rot checker

**Why not implemented**: expanding the entity list is editorial work (needs your approval per entry); adding filters/search/cross-links is real engineering scope, not "clear and low-risk this week" per your own task-13 guardrail. No files changed.

**Verify**: `/investigations` → 11 entities render cleanly with theme pills and article links.

## Task 14 — done summary

**Audit finding**: the "Key Votes" column was silently broken. `/api/follow/route.js` was selecting columns that don't exist on `legislator_votes` (`vote`, `session_year`, `bill_url`) — actual columns are `vote_text`, `session_id`, no `bill_url`. Even when a candidate-legislator link existed, the render path chose null columns.

**T1 collision risk acknowledged**: T1 shipped vote/bill improvements on legislator profile pages today (commit `7ac86d3`). I explicitly did NOT touch `legislator_votes` or `bill_sponsorships` schemas. Only fixed the broken SELECT on the existing table.

**Chose**: hybrid of (b) honest + (c) handoff. Fix the silent bug, make the empty state honest, write a real handoff doc for the dream flow.

**Changed**
- `app/api/follow/route.js` — corrected `legislator_votes` column list to `vote_text`, `session_id` (no more silent-null); enriched the "no linked legislator" note to explain that local/judicial/non-legislative candidates won't have a roll-call record
- `components/follow/FollowExplorer.js` — empty-state now reads "No FL roll-call votes on record for this candidate" with a link to the legislator profile when a link exists (but no votes); removed dependence on the fake `bill_url` field

**Created**
- `docs/handoff-follow-dream-flow.md` — 4-phase plan (donor→principal bridge, principal→bill table, vote alignment, confidence framing) with gotchas, pgbouncer notes, T1 collision warning. ~5–6 days of work; not realistic this week.

**Follow-up risk**
- The column fix is live-immediate — candidates with actual legislator votes will start showing vote data that was previously invisible. Good. But if there are quality issues (miscoded `vote_text` values), they're now visible where they were hidden. Worth a visual QA pass on a known legislator candidate.
- T1 may later add a `bill_url` column or rename `vote_text` — if they do, the fix here needs a quick re-align. Flag in lessons.

**Verify in UI**
- Visit `/follow` → search a known FL legislator-turned-candidate (e.g. a state senator) → Key Votes column should now render bill number + vote (where previously empty)
- Search a non-legislator (e.g. a local county commissioner) → empty state reads "No FL state legislator record linked to this candidate — local, judicial, and non-legislative candidates have no roll-call record"
- `docs/handoff-follow-dream-flow.md` readable and ready for next terminal

## Task 15 — done summary

**Problem**: `/map` had no map — three Recharts bar/slice views only. User asked for a real FL map with donor-origin bubbles.

**Chose**: Build a minimum-viable real map, keep the existing three charts as secondary tabs. No new dependencies (inline SVG path + hardcoded coordinate lookup for ~45 most common FL donor cities). Simple equirectangular projection over FL bounding box.

**Changed**
- `components/map/DonationMap.js`:
  - New `FloridaMap` component renders an SVG of the FL outline + bubbles at city coordinates, sized by `sqrt(total/maxTotal)` so big cities don't dominate. Hover tooltip shows city + total + donor count.
  - Tab bar gains `Florida Map` tab as first item and new default
  - Coordinate lookup covers ~45 cities (Tallahassee, Miami, Orlando, Tampa, Jacksonville, plus common PAC-donor hubs like Naples, Palm Beach, Boca Raton, Coral Gables, etc.). Cities not in the lookup are counted in a footer note ("N additional cities aren't placed on this map").
  - Tab cache keyed by API view (not tab key) so the FL map and Cities tab share one fetch.

**Follow-up risk**
- FL outline SVG path is hand-simplified. Recognizable as Florida but not geographically precise (panhandle + peninsula shape is right, coastline detail is smoothed). Acceptable for a donor-origin bubble map; if you need cartographic accuracy later, swap to a TopoJSON + react-simple-maps.
- Cities not in `FL_CITY_COORDS` are invisible on the map. The footer discloses this. A static GeoJSON of FL city centroids (public domain) could extend coverage later.
- Mobile: SVG scales via `viewBox` + `preserveAspectRatio`; tooltip is absolute-positioned top-right. Should behave reasonably on narrow screens but verify.

**Verify in UI**
- Visit `/map` → default view is "Florida Map" with outline + orange bubbles
- Hover any bubble → tooltip in top-right shows city, total, donor count
- Switch to old tabs (Top FL Cities, By State, In-State vs. Out) → still work
- Footer shows how many cities weren't plotted

## Task 16 — done summary

**Google Civic verification (user-asked)**: Google Civic's `Representatives API` was retired **April 30, 2025** — already offline. Google now offers only `divisionByAddress` (returns OCD-IDs, not actual representatives; requires cross-referencing with third-party officeholder data). **Not viable** as a drop-in solution. User's "goes offline in April 2026" recollection is off by one year — it already happened in April 2025.

**Chose**: link-out to the **official FL House** and **FL Senate** lookup tools. Zero infrastructure, zero API keys, 100% accurate (canonical source). Fix misleading marketing copy in three places so users aren't misled into expecting zip-code entry.

**Changed**
- `components/who-funds/WhoFundsPage.js` — added "Don't know your district?" card between quick-picks and trust ribbon, with two link buttons: "FL House → Find My Rep" (`myfloridahouse.gov/FindYourRepresentative`) and "FL Senate → Find My Senator" (`flsenate.gov/Senators/Find`)
- `app/tools/page.js` — `/who-funds` description: "Zip code → rep" → "FL House/Senate district → your legislator"
- `components/home/AnalysisHub.js` — `/who-funds` desc: "Zip → reps → donors" → "District → rep → donors"
- `components/tools/ToolHubTabs.js` — desc rewritten to say "Enter your FL House or Senate district number (or use the official lookup)"

**Alternatives flagged for later (not built this week)**
- OpenStates API (free, generous rate limit, covers state legislators by address)
- Geocod.io (paid; returns state legislative district from address; generous free tier)
- Google `divisionByAddress` (OCD-ID only; still needs officeholder lookup via Ballotpedia/BallotReady/Cicero)

**Follow-up risk**
- FL House and Senate URLs are well-known canonical tools; if either restructures their URL, the button goes stale. Verify annually.
- In-page address lookup would be a real UX upgrade; deferred as real engineering scope.

**Verify in UI**
- Visit `/who-funds` → new "Don't know your district?" card with two link buttons opening in new tabs
- Hover/tab through the copy on `/tools`, home AnalysisHub, ToolHubTabs — no "zip code" claim remaining

## Task 17 — done summary

**Decision on scope**: `/vendors` directory already exists (vendor-centric "who gets paid"). Built `/expenditures` as a complementary cut: "who spends the most" — top spending committees + top spending campaigns, linked to their per-entity Payees/Expenditures tabs. Distinct framing from /vendors (per-vendor), /ie (outside spending), /explorer (contributions in).

**Data confidence check**: avoided querying tables I couldn't verify. Used only:
- `committee_expenditure_summary` ✅ (script 64, confirmed populated; ~1,673 committees, $2.82B)
- `candidate_expenditure_summary` ✅ (confirmed populated; ~$1.07B)
- `committees` + `candidates` for name lookups ✅
- Did NOT rely on `vendor_totals_mv` (referenced but not in migrations — same missing-view pattern we caught on Tasks 2 and 10)

**Created**
- `app/expenditures/page.js` — new server component (force-dynamic). Loads global totals + top-25 spending committees + top-25 spending candidates in 4 parallel queries, then resolves names/parties in 2 more. Renders:
  - Header with section badge + explanatory lede
  - 4-stat hero: Combined Spend (hero), Committee Spend, Candidate Spend, Top Spending Entities — each with transaction counts as sub-line
  - Two-column "Top Spending Committees" / "Top Spending Campaigns" lists, linked to `/committee/{acct}?tab=payees` and `/candidate/{acct}?tab=expenditures` (those tabs already exist)
  - Cross-link chips to Vendors directory, IE, contributions explorer, flow diagram
  - DataTrustBlock with honest caveats (vendor canonicalization ongoing, not every committee has expenditures loaded, combined totals sum two independent source tables)

**Changed**
- `components/shared/NavLinks.js` — added `/expenditures` to Explore dropdown (between Transactions and Legislators); added `/expenditures` and `/vendor/` to Explore's `extra` highlight-prefixes

**Deliberately not done**
- No new top-vendors-statewide aggregation — would require either a new materialized view (schema migration, T1 coordination) or client-side aggregation of 1.3M rows. Cross-linked to `/vendors` which already handles this cut if its underlying view exists.
- No purpose/category breakdown — `purpose` field is free-text noise; `type_code` aggregation would need a GROUP BY RPC. Flagged for later.

**Follow-up risk**
- If `/vendors` is broken (same missing-view pattern), the cross-link chip goes somewhere empty. Not tested live. **Flag**: verify /vendors works; if not, either hide the chip or replace with a lobby/contract cross-link.
- Combined total adds committee + candidate side totals. There's potential double-counting when a candidate's PAC also shows the same expenditure. Caveat noted in DataTrustBlock.
- The hero `num_expenditures` count sums per-entity summary-row counts — not row count of transactions. If a committee's summary shows `num_expenditures=5000`, that's 5000 rows on the transaction side; combined = rough count of entries, not unique payments.

**Verify in UI**
- Nav → Explore dropdown now lists: Transactions · Expenditures · Legislators · State Contracts · Solicitations
- Visit `/expenditures` → hero stats load; top-committees list on the left, top-candidates on the right
- Click a committee in the list → lands on `/committee/{acct}?tab=payees`
- Click a candidate → lands on `/candidate/{acct}?tab=expenditures`
- Cross-link chips present at the bottom
