# Florida Donor Tracker — Launch-Ready UI/UX Audit Plan

**STATUS: COMPLETE — 2026-04-22**

All phases executed. Visual QA passed on all priority routes. No broken URLs, no stub tabs, no dead ends. See visual_audit/ for screenshots.

## Context
Goal: full UI/UX polish pass before public launch (target: 2026-04-26). Every linked page must look finished, no stubs visible to users, and every page must have real cross-links so users never hit a dead end. The site has 68 page routes. 6 are redirect-only shells that will be deleted. 30+ components were flagged with TODO/placeholder markers — we'll identify which ones are user-visible vs. code-only.

User preferences locked in:
- Bar = **full UI + UX polish** (not just "remove broken pages")
- Delete the 6 redirect shells; update all hrefs pointing to them
- Remove stub tabs/sections (show only what works)
- Homepage **included** in scope — user says it needs work

---

## Phase 1 — Surgical Cleanup (do first, unblocks everything)

### 1A. Delete 6 redirect-only page files
These render nothing — they just bounce users to another route. Delete the files and grep for any hrefs pointing to them, then update those links to the final destination:

| Delete | Redirect was → | Update hrefs to |
|--------|---------------|-----------------|
| `app/coverage/page.js` | `/methodology` | `/methodology` |
| `app/network/page.js` | `/flow` | `/flow` |
| `app/race/page.js` | `/candidates` | `/candidates` |
| `app/data/page.js` | `/methodology` | `/methodology` |
| `app/transfers/page.js` | `/flow` | `/flow` |
| `app/data-dictionary/page.js` | `/methodology` | `/methodology` |

After deleting, grep: `grep -r "/coverage\|/network\|/data-dictionary\|/data\"\|/transfers\|/race\"" app/ components/ --include="*.js"` and update each hit.

Also remove these from `sitemap.js` and `robots.js` if present.

### 1B. Remove stub tabs from /ie
- `app/ie/page.js` has 3 tabs; "By Candidate" and "For vs. Against" have no data — remove both
- Keep only "By Committee" tab; update the tab bar so it's a single-section page (no tab UI needed if only 1 section)
- Add a callout explaining what IE data IS available and why the rest isn't tracked

### 1C. Audit the 30 flagged TODO components
Quick grep to find which TODOs are user-visible vs. internal code comments:
```
grep -rn "TODO\|coming soon\|placeholder\|not yet" components/ --include="*.js" | grep -v "//.*TODO" | head -60
```
For each user-visible stub: either remove the section or replace with real content. Internal code TODOs can stay.

---

## Phase 2 — Homepage Redesign

**File:** `app/page.js`, `components/home/` (HeroReveal, EmailStrip, etc.)
**Also read:** `docs/home-page-audit-plan.md` before touching anything

Current state from audit: hero stats ($3.9B, $34.9B lobbying, 160 legislators, 431 shadow PACs) + 2026 race cards + contribution hub + analysis hub + email signup.

User says it needs work. Goals:
- Apply frontend-design skill aesthetic: visually striking, cohesive, not generic
- Ensure the 4 hero stats are accurate and linked (each should link to the relevant section)
- Race cards: verify live data is populating correctly
- Email signup: functional (email_signups table confirmed created 2026-04-19)
- Make sure every section cross-links somewhere meaningful
- Check typography: label sizes, description sizes per brand minimums (0.65rem labels, 0.76rem descriptions, 0.85rem tabs)

---

## Phase 3 — Page-by-Page UI/UX Pass

Work in priority order. For each page, apply the §16 brand guide checklist from `docs/BRAND_GUIDE.md`. Key checks per page:
- Typography at/above minimums
- No hardcoded hex (use CSS vars)
- Link colors: orange=donors/candidates, teal=committees/firms/legislators, blue=industries
- Money values in mono font in tables
- BackLinks breadcrumb present
- At least 2-3 meaningful cross-links out

### Tier 1 — User-called-out pages (start here)

**`/industries`** (`components/industries/IndustriesList.js`)
- Uses static JSON (`industry_summary.json`, `industry_trends.json`) — verify files exist and are populated
- Check stacked trend chart renders (dynamically imported — test it)
- Verify link colors on industry links (should be blue per convention)
- Add cross-links: → /lobbying/issues, → /influence, → /donors

**`/pulse`** (`components/home/PulsePage.js`)
- 3 tabs: Latest Filings / New Committees / This Cycle — verify all 3 load from `/api/pulse`
- Check loading states don't flash awkwardly
- Add cross-links from each tab: filings → /explorer, committees → /committees, cycle → /donors
- Empty state: if no data in a tab, show descriptive message not blank space

**`/races/2026`** (`components/home/Races2026Page.js`)
- Office tabs (Gov, AG, CFO, CoA, Senate, House, Other, All) — verify all tabs load
- Top candidate featured box — check data populates
- Cycle snapshot stats — verify numbers
- Cross-links: → /who-funds, → /candidates, → /cycles (already in component per audit)
- Typography pass on candidate names, money values, party labels

**`/map`** (`app/map/page.js` + `components/map/DonationMap.js`)
- This is `ssr: false` dynamic — must actually run and test it in browser
- Verify map renders, tooltips work, data loads from `/api/map`
- Cross-links in footer: /follow, /donors, /explorer (already there — verify they're visible)
- Breadcrumb: Home > Tools > Geographic Map (already there — verify styling)

### Tier 2 — Core directory pages

**`/candidates`** (`components/candidate/CandidatesList.js`) — flagged TODO
**`/committees`** (`components/committees/CommitteesList.js`) — flagged TODO  
**`/donors`** (`components/donors/DonorsList.js`) — flagged TODO
**`/lobbyists`** (`components/lobbyists/LobbyistsList.js`) — flagged TODO
**`/lobbying-firms`** (`components/lobbyists/LobbyingFirmsList.js`) — flagged TODO
**`/principals`** (`components/principals/PrincipalsList.js`) — flagged TODO
**`/legislators`** (`components/legislators/LegislatorsList.js`) — flagged TODO

For each: read the component, identify what the TODO actually is, fix or remove it. These are high-traffic entry points — they must feel complete.

### Tier 3 — Tool pages

**`/follow`** (`components/follow/FollowExplorer.js`) — flagged TODO
**`/flow`** (`components/flow/FlowExplorer.js`, `FlowClient.js`) — flagged TODO
**`/influence`** (`components/influence/InfluenceTerminal.js`, `InfluenceIndex.js`) — flagged TODO
**`/connections`** (`components/connections/ConnectionsView.js`) — flagged TODO
**`/compare`** (`components/compare/ComparePicker.js`) — flagged TODO
**`/decode`** (`components/tools/CommitteeDecoder.js`) — flagged TODO
**`/who-funds`** (`components/who-funds/WhoFundsPage.js`) — flagged TODO
**`/explorer`** (`components/explorer/TransactionExplorer.js`) — flagged TODO
**`/timeline`** (`components/tools/InfluenceTimeline.js`) — flagged TODO

For each: read, identify user-visible TODOs, fix or remove. Check cross-links and empty states.

### Tier 4 — Content/reference pages (likely already good)

- `/lobbying` — audit said very complete. Quick typography + cross-link pass only.
- `/elections` — check ElectionsView component
- `/party-finance` — audit said highly complete. Spot-check.
- `/federal` — audit said complete. Spot-check.
- `/about` — audit said exhaustive. Verify all 60+ directory links still resolve after phase 1 deletions.
- `/methodology` — check MethodologyTabs component
- `/solicitations` — check SolicitationsList component
- `/contracts` — check ContractsList component
- `/vendors` — check VendorsList component

### Tier 5 — Profile pages (dynamic routes)

These are the most-linked pages — every entity links here:
- `/politician/[slug]` (`components/candidate/CandidateProfile.js`) — flagged TODO
- `/donor/[slug]` 
- `/committee/[acct_num]`
- `/lobbyist/[slug]`
- `/lobbying-firm/[slug]`
- `/legislator/[people_id]`
- `/industry/[slug]`
- `/principal/[slug]`
- `/vendor/[slug]`

For each: verify the TabbedProfile tab structure is complete, all tabs have data, cross-links to related entities are present. Test with a known-good entity from memory (e.g., DeSantis, RPOF).

---

## Phase 4 — Cross-Link & Dead-End Audit

After all page work is done, walk every page and verify:
1. Every page has a BackLinks breadcrumb (or clear nav context)
2. Every directory page links to its profile pages
3. Every profile page links back to its directory + at least 2 sibling entity types
4. Search results are never a dead end — every result links to a profile

Specific cross-links to add if missing:
- `/industries` → `/lobbying/issues` (same topical area)
- `/pulse` → `/explorer` (deeper dive)
- `/map` → `/follow` (same money-trail theme)
- All profile pages → `/search` (find more like this)

---

## Phase 5 — Visual QA

Run puppeteer smoke tests for all main routes. Use inline `node -e` per feedback memory pattern:

```js
// Test pattern: visit route, wait 5-10s, screenshot
const puppeteer = require('puppeteer');
const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.goto('http://localhost:3000/[route]');
await new Promise(r => setTimeout(r, 5000));
await page.screenshot({ path: 'visual_audit/[route].png', fullPage: true });
await browser.close();
```

Priority routes for screenshots:
- `/` (homepage)
- `/industries`, `/pulse`, `/races/2026`, `/map`
- `/candidates`, `/committees`, `/donors`
- `/lobbying`, `/follow`, `/flow`
- `/about`, `/methodology`
- Profile pages: one politician, one donor, one committee, one legislator

---

## Critical Files

- `app/layout.js` — global nav (NavLinks), footer — update after phase 1 deletions
- `app/sitemap.js` — remove deleted routes
- `components/shared/NavLinks.js` — verify no links to deleted routes
- `app/ie/page.js` — remove 2 stub tabs
- `docs/BRAND_GUIDE.md` — §16 checklist, run before marking any page done
- `docs/home-page-audit-plan.md` — read before touching homepage

---

## Execution Order (4-day sprint)

| Day | Work |
|-----|------|
| Day 1 (Wed) | Phase 1 (cleanup + deletes) + Read BRAND_GUIDE + homepage audit plan |
| Day 2 (Thu) | Phase 2 (homepage) + Tier 1 pages (industries, pulse, races/2026, map) |
| Day 3 (Fri) | Tier 2 directories + Tier 3 tools + Tier 5 profiles (spot-check key profiles) |
| Day 4 (Sat) | Tier 4 content pages + Phase 4 cross-link audit + Phase 5 visual QA |

---

## Verification

- `grep -r "/coverage\|/data-dictionary\|/network\b\|/transfers\b" app/ components/` → 0 results after phase 1
- Visit `/ie` — should show only "By Committee" with no empty tab UI
- Puppeteer screenshots of all priority routes — every page renders real content
- `docs/BRAND_GUIDE.md §16` checklist passes on each modified page
- No `<Link href="">` or links to deleted routes in `/about` directory section
