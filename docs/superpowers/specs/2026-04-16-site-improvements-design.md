# Florida Donor Tracker — Site Improvements Design
**Date:** 2026-04-16  
**Status:** Approved

---

## Overview

Comprehensive set of improvements across three categories: new tools, page-level upgrades, and site-wide enhancements. Prioritized by impact-to-effort ratio. All data needed for these features already exists in Supabase.

---

## Priority Tiers

### Tier 1 — Quick Wins (data exists, minimal new UI)

**1. CSV Export on all directory pages**
- Add `?export=1` handler to: `/api/donors`, `/api/candidates`, `/api/committees`, `/api/transactions`, `/api/lobbyists`, `/api/principals`, `/api/lobbying-firms`
- Return `Content-Disposition: attachment; filename=...csv` with proper CSV headers
- Add "Export CSV" button to each directory page toolbar
- Cap at 5,000 rows per export

**2. Data freshness badges on profile pages**
- Add "Data as of Q1 2026" badge to committee, candidate, donor, and lobbyist profile pages
- Use existing `DATA_LAST_UPDATED` constant + a `PIPELINE_QUARTER` constant
- Render as a small inline badge near the DataTrustBlock

**3. Committee expenditure surfacing**
- `committee_meta` table has `top_vendors` JSON — expose this in the committee profile Expenditures tab
- Show: vendor name, total paid, vendor category (if available)
- Already partially implemented in the DB; just needs a UI section

**4. IE page — candidate-level view**
- Add a second tab to `/ie`: "By Candidate" alongside "By Committee"
- Query `ie_totals` grouped by candidate (target_name), sum for/against separately
- Show net IE (for minus against) as the headline figure

**5. Lobbyist profiles — bill activity section**
- The `lobbyist_disclosures` JSON data has per-lobbyist bill filings
- Add a "Lobbied Bills" section to `/lobbyist/[slug]` profile pages
- Show top 10 bills by filing count, linked to `/lobbying/bill/[slug]`

---

### Tier 2 — New Pages (new routes, moderate complexity)

**6. Race Tracker — `/race/[office]/[year]`**
- List all candidates for a given office + election year
- Side-by-side: total raised, total spent, hard vs. soft money split, top donor
- Sort by total raised by default; toggle to alphabetical
- Entry point: add "All candidates for this race" link on candidate profile pages
- Data source: `candidates` table filtered by `office_desc` + `election_year`

**7. Donor Cross-Reference Tool — `/tools/bipartisan`**
- Input: search for a donor name
- Output: their giving broken down by recipient party (R / D / NPA / other)
- Show side-by-side bar: total to R vs. total to D, with recipient list under each
- Also expose a directory mode: top donors sorted by "most bipartisan" (closest 50/50 split above $50K total)
- Data source: `contributions` joined to `candidates.party_code` + committee party inference

**8. Committee Family Tree — `/committee/[acct_num]?tab=network`**
- New tab on committee profiles (not a standalone page)
- Render the committee's connection cluster using Sigma.js (already used on `/network/graph`)
- Nodes: connected committees, sized by connection_score
- Edges: colored by connection type (treasurer=orange, address=blue, donor=teal, money=green)
- Limit to depth-1 connections (direct only), capped at 30 nodes for performance

---

### Tier 3 — Complex / Cross-Dataset Features

**9. Bill Money Map — `/lobbying/bill/[slug]?tab=money`**
- New tab on bill detail pages
- Show: principals who lobbied the bill + their donation totals to legislators who voted on it
- Requires joining: `lobbying_bill_filings` → `principals` → `principal_donation_matches` → `legislators` → `legislator_votes`
- Present as a table: principal name | lobbying side | total donated to yes-voters | total donated to no-voters

**10. Search ranking improvements**
- Current: `ilike` search returns unranked results
- New: add a `prominence_score` to search results (total_combined for donors, total_raised for candidates/committees)
- Sort results by prominence_score DESC within each entity type
- Show entity type icon (Individual, PAC, Candidate, Lobbyist) next to each result

**11. Mobile layout pass**
- Audit the 8 highest-traffic pages (homepage, /donors, /candidates, /committees, /search, /flow, candidate profile, committee profile)
- Fix overflow issues on data tables: horizontal scroll container with sticky first column
- Reduce font sizes and padding on mobile breakpoints (below 640px)
- Navigation: collapse tool cards into a scrollable horizontal strip on mobile

---

### Tier 4 — Deferred (requires auth infrastructure)

**12. Watchlist / Alerts** — Requires user accounts. Defer until auth is added.

---

## Implementation Order

```
Week 1:  Tier 1 items (1–5) — all data exists, fast to ship
Week 2:  Tier 2 items (6–8) — new pages, self-contained
Week 3:  Tier 3 items (9–11) — complex joins and cross-cutting
Week 4:  Polish, mobile pass, QA
```

## Non-Goals

- User authentication / accounts
- Real-time contribution alerts
- Federal campaign finance data (separate pipeline)
- Comment or annotation features

---

## Data Dependencies

All Tier 1–2 features use data already in Supabase. Tier 3 features depend on:
- `legislator_votes` table (exists, populated via LegiScan)
- `lobbying_bill_filings` table (exists, populated via script 85)
- Party inference for committees (heuristic, already in `committees/route.js`)
