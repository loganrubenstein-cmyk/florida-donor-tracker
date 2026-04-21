# Launch Readiness Audit & Fix Plan — floridainfluence.com
**Context:** Public launch is end of this week (week of Apr 21, 2026). Full audit of the live site was conducted via WebFetch across 20+ pages, cross-referenced against the source codebase. This plan documents all issues found and a day-by-day implementation sequence.

---

## EXECUTIVE SUMMARY

The site is impressively deep — 45+ routes, 30 API endpoints, real data throughout. Most pages are substantive. However, there are **3 launch blockers** (one a significant factual error), **several high-priority content and UX issues**, and a pattern of pages that may show blank loading states to users. These need to be resolved before the site goes public. The core platform is solid; these are fixable in 3–4 days.

---

## LAUNCH BLOCKERS

### B1 — Senate Race Card Is Factually Wrong + Should Be Dynamic
- **Page:** Home page (`app/page.js`, `RACES_2026` array, line 64)
- **Problem:** Card says "U.S. Senate — Rubio up for re-election 2028 · Lead: Marco Rubio · $5.8M." Rubio resigned from the Senate in January 2025 to become Secretary of State. FL Gov. DeSantis appointed Ashley Moody (former FL AG) to the seat. The site's own `/federal` page correctly shows Ashley Moody as the top Senate fundraiser at $3.25M. The home page is factually contradicting itself.
- **Why it matters:** This is the most visible race on the home page. Journalists and politically knowledgeable users will catch this immediately and it will torpedo credibility.
- **Decision:** Make it dynamic — pull the leading fundraiser and raised total from Supabase so it auto-updates with each data run. No more stale hardcoded values.
- **Fix:** Convert `RACES_2026` from a static array to a server-side fetch. Query the federal candidates table for U.S. Senate 2026, find the top fundraiser by PAC contributions, and render dynamically. Same pattern as the existing `getHomeData()` function. Also update the note text to "Special election — Moody appointed after Rubio named Sec. of State."
- **Priority:** BLOCKER
- **Files:** `app/page.js` (RACES_2026 array → move into `getHomeData()`)

---

### B2 — Contact Email Uses Wrong Domain
- **Page:** `/about`, `/methodology`, footer
- **Problem:** Contact email is `florida@donortracker.org`. The site is `floridainfluence.com`. For a new site with no brand recognition, having a contact email at a completely different domain looks like a phishing link — this kills trust on first contact.
- **Why it matters:** Any journalist or user who wants to reach out sees a mismatched domain and either doesn't email, or emails and finds it bounces (if not forwarded).
- **Decision:** Set up `press@floridainfluence.com` (user action — register/forward the email). Once set up, update all references in code.
- **Fix:** After email is created, replace all instances of `florida@donortracker.org` with `press@floridainfluence.com` (or whichever address is registered). Search codebase for the old address before deploying.
- **User action required first:** Register the floridainfluence.com email and confirm address before this change is deployed.
- **Priority:** BLOCKER
- **Files:** `app/about/page.js`, anywhere else the email appears

---

### B3 — Trulieve & FPL Investigation Spotlight Amounts Are Wrong / Identical
- **Page:** Home page, `components/home/InvestigationSpotlight.js`
- **Problem:** Florida Power & Light and Trulieve Inc. both show **"$72M+"** — identical hardcoded amounts for completely different entities. Trulieve's `/investigations` page shows $210.1M total donated — nearly 3x what the spotlight claims. FPL has no dollar amount on the investigations page (lobbying + campaign combined is likely much higher). These values are stale hardcoded strings.
- **Why it matters:** A political finance site with wrong numbers on its own homepage is a serious credibility problem. Anyone who clicks through from the spotlight will immediately see inconsistent numbers.
- **Fix:**
  - Pull amounts dynamically from Supabase using the existing donor profiles OR update to accurate hardcoded values with a consistent measurement definition.
  - Ensure the labels are parallel: either all say "in campaign contributions" or all say "in FL political giving" — not a mix.
  - Suggested static update while dynamic loading is added later:
    - FPL: "$72M+ in campaign contributions" (verify via `/donor/florida-power-light-company`)
    - US Sugar: "$38.8M+ in campaign contributions" (matches investigations page)
    - Trulieve: "$210M+ in FL political giving" (matches investigations page) or clarify what "$72M" is measuring
- **Priority:** BLOCKER
- **Files:** `components/home/InvestigationSpotlight.js`

---

## HIGH PRIORITY ISSUES

### H1 — Federal Page Has Explicit Incomplete Data Warning
- **Page:** `/federal`
- **Problem:** The page itself states: "Individual contributions, Schedule B expenditures, and committee disbursements are not yet loaded." This is a public admission of incomplete data with no timeline given.
- **Why it matters:** Users who find this page via search will see an empty promise. Journalists will screenshot this.
- **Decision:** Data is coming before launch — run the FEC pipeline, then update the status message to reflect "processing / recently updated" rather than "not loaded."
- **Fix:** (1) Run the FEC individual contributions pipeline. (2) After data loads, update the status message to: "PAC contribution data is live and updated through [date]. Individual contributions are being processed." Remove the raw "not yet loaded" string entirely.
- **Priority:** HIGH
- **Files:** `app/federal/page.js` or the data-loading component; also update `/coverage` to reflect current data status

---

### H2 — 2024 Elections Page Has Only 22% Finance Match
- **Page:** `/elections`
- **Problem:** 2024 General shows 88 matches out of 401 contests (22%). Statewide and legislative race detail shows zero. The page currently says "No detailed results available for 2024 general." This is the most recent election cycle — the one users care most about.
- **Why it matters:** A site launching in 2026 showing essentially no 2024 election data will look outdated or broken. This undermines the credibility of the election results section.
- **Fix:** Add explicit scope framing on the elections page: "Finance data is matched to election outcomes where DOE candidate records align. 2024 statewide and legislative finance detail is available in the Candidates and Cycles directories." Link those directories. Add a note explaining why match rate is lower (name mismatches between filing records and election results). Don't leave users staring at "No detailed results available."
- **Priority:** HIGH
- **Files:** `app/elections/page.js`

---

### H3 — Multiple Key Pages Have Unverified Loading States (Manual Browser Test Required)
- **Pages:** `/connections`, `/transparency`, `/contracts`, `/races/2026`
- **Problem:** WebFetch captured "Loading..." with no content on all four of these pages. These are client-rendered so WebFetch (which doesn't run JS) sees blank content — but this also means search engines see blank pages, and slow connections get a prolonged spinner.
- **Decision:** Not verified recently — add manual browser testing as a required pre-launch task.
- **Why it matters:** These are featured destinations. A broken analysis page at launch is a trust killer.
- **Fix:**
  1. **Manually open each page in a real browser** and confirm data renders. Document pass/fail.
  2. For each page that renders correctly but slowly: add `.skeleton-row` skeleton states (already in `globals.css`) so users see structure while loading.
  3. For `/races/2026`: if data isn't populating, remove the "New" nav badge and redirect to `/cycles` until functional.
  4. For `/connections`: this blank-state was flagged in a prior audit (ux_audit_notes.md) — confirm the fix landed.
  5. For any page that is genuinely broken: triage immediately — these are Day 2 priority.
- **Priority:** HIGH
- **Files:** `app/connections/page.js`, `app/transparency/page.js`, `app/contracts/page.js`, `app/races/2026/page.js`

---

### H4 — Home Page Quick Links Have Misleading Labels
- **Page:** Home page, 2026 Cycle section (lines 137–148 in `app/page.js`)
- **Problem:**
  - "→ out-of-state donors" links to `/candidates` — candidates is not an out-of-state donor page
  - "→ hard vs. soft money" links to `/follow` — the Follow the Money tool traces committee flows, not a hard/soft comparison
- **Why it matters:** Users click these expecting the destination described. Landing somewhere irrelevant trains users not to trust the navigation.
- **Fix:**
  - "→ out-of-state donors" → change to "→ browse all candidates" or point to `/donors` with an out-of-state filter param if one exists
  - "→ hard vs. soft money" → change to "→ follow the money trail" or link to `/party-finance` which actually shows hard vs. soft comparison
- **Priority:** HIGH
- **Files:** `app/page.js` (lines 137–148)

---

### H5 — Governor Race Card Data Needs Verification
- **Page:** Home page (`RACES_2026[0]`)
- **Problem:** Shows "Byron Donalds · $2.1M" as race leader. This is a hardcoded value as of whenever the page was last updated. Byron Donalds is a plausible candidate but needs to be verified against current filings.
- **Why it matters:** Getting a high-profile race leader wrong on the home page is the same class of error as the Rubio issue.
- **Fix:** Pull current fundraising totals from the 2026 governor race in Supabase and update the hardcoded value. Consider making these cards dynamic like the top donors table.
- **Priority:** HIGH
- **Files:** `app/page.js` (RACES_2026 array)

---

## MEDIUM PRIORITY ISSUES

### M1 — US Sugar Spotlight Amount Discrepancy
- **Page:** Home page InvestigationSpotlight
- **Problem:** Spotlight says "$32M+ in campaign contributions." Investigations page says $38.8M total donated. Small discrepancy but present.
- **Fix:** Update to $38.8M+ and verify what "total donated" covers. If spotlight is hard money only, label it "in direct contributions."
- **Priority:** MEDIUM
- **Files:** `components/home/InvestigationSpotlight.js`

---

### M2 — Pulse Page May Have No Real-Time Content
- **Page:** `/pulse`
- **Problem:** WebFetch returned navigation structure but no actual contribution activity, new committees, or top donor data — only the ticker rail stats. The page description promises "recent large contributions, newly registered committees, and top donors of current cycle."
- **Fix:** Manually verify the page renders real-time data in a browser. If the Pulse section is thin or stale, add a "Last updated: [date]" timestamp so users know the data is live.
- **Priority:** MEDIUM
- **Files:** `app/pulse/page.js` and related components

---

### M3 — /district and /who-funds Appear to Be the Same Tool
- **Page:** Footer links to `/district`; nav links to `/who-funds`; the tool page is at `/who-funds`
- **Problem:** Two different links for the same tool. Footer "Who funds your district" → `/district` may 404 or redirect.
- **Fix:** Confirm `/district` redirects to `/who-funds`. If not, add redirect in `next.config.mjs`. Update footer to use `/who-funds` consistently.
- **Priority:** MEDIUM
- **Files:** `app/layout.js` (footer), `next.config.mjs`

---

### M4 — Meta Description Has Hard End Date
- **Page:** Global (`app/layout.js` line 14)
- **Problem:** Meta description says "tracked from 1996 to 2026." As data is updated quarterly, this reads as a closed dataset rather than an ongoing one.
- **Fix:** Change to "tracked from 1996 to present" or "updated quarterly through 2026 and beyond."
- **Priority:** MEDIUM
- **Files:** `app/layout.js`

---

### M5 — Data Freshness Inconsistency Across Pages
- **Problem:** Ticker rail shows "UPDATED APR 14 2026." Influence Index page says "updated April 18, 2026." Different datasets update at different times — fine — but there's no explanation of this, which looks like data inconsistency.
- **Fix:** Change ticker to "DATA: APR 2026" (drop the specific date) OR add a tooltip/footnote explaining that different datasets update on different schedules. The `/coverage` page is the right place for this explanation — add a link from the ticker.
- **Priority:** MEDIUM
- **Files:** `components/shared/TickerRail.js`

---

### M6 — Tagline "A sunny place for shady people" Appears Too Broadly
- **Pages:** Footer, donors page, tools page, lobbyists page, legislators page, and more
- **Problem:** The tagline is witty but editorializing on data directory pages — it frames the site as having an agenda rather than being neutral public record.
- **Decision:** Keep on footer and homepage only. Remove from all other page headers. Replace with the mission statement or no subtitle at all.
- **Fix:** Search for all instances of "a sunny place for shady people" across `app/` (case-insensitive). Remove from any page that isn't the home page or the layout footer. On directory page headers, either use no subtitle or substitute "Florida's political money should be public knowledge."
- **Priority:** MEDIUM
- **Files:** `app/donors/page.js`, `app/lobbyists/page.js`, `app/legislators/page.js`, `app/tools/page.js`, any other directory pages using it as a page-level tagline

---

## LOW PRIORITY ISSUES

### L1 — Methodology Page Is Vague About Industry Buckets
- **Page:** `/methodology`
- **Problem:** Says "~15 buckets" for industry classification with no list. Users can't verify what bucket their occupation falls into.
- **Fix:** Add the full list of 15 industry bucket names to the methodology page. Already exists in the codebase.
- **Priority:** LOW

---

### L2 — No robots.txt
- **Problem:** Next.js defaults allow indexing, but an explicit robots.txt is better practice and expected by crawlers.
- **Fix:** Add `app/robots.ts` (or `robots.js`) with explicit allow rules and a sitemap reference.
- **Priority:** LOW

---

### L3 — Footer "Back to Top" Links to "#"
- **Page:** Global footer (`app/layout.js` line 137)
- **Problem:** The back-to-top link is an `<a href="#">` which works but is not a smooth scroll and doesn't scroll all the way in some browsers.
- **Fix:** Change to a `<button onClick={() => window.scrollTo({top:0, behavior:'smooth'})}` or use `href="#top"` with `id="top"` on the body.
- **Priority:** LOW

---

### L4 — "27 tools" Claim Needs Verification
- **Page:** `/tools` (tagline area)
- **Problem:** Page describes "27 tools, directories, analyses, reports" but there are 46+ routes and potentially more or fewer interactive tools depending on definition.
- **Fix:** Count the actual tools on the `/tools` page cards and make the number accurate.
- **Priority:** LOW

---

## DESIGN CONSISTENCY ISSUES

### D1 — Investigation Spotlight Cards Are Visually Identical in Dollar Amount
- All three cards (FPL, US Sugar, Trulieve) currently render with "$72M+" for two of them. Even after fixing the amounts (B3), ensure the design differentiates the three entities clearly with distinct, accurate numbers.

### D2 — Race Cards All Link to /races/2026 Instead of Race-Specific Pages
- Governor, Senate, and AG cards all share `href: '/races/2026'`. If individual race pages exist (`/race/governor`, `/race/senate`), link to them. If not, this is fine but add race-specific anchors.

### D3 — Ticker Shows "22M CONTRIBUTIONS" in Some Spots vs "2M CONTRIBUTIONS" in Others
- Contracts page ticker showed "2M CONTRIBUTIONS" (likely truncated rendering in WebFetch, but worth verifying it renders correctly at all viewport sizes).

### D4 — Investigation Spotlight Label Inconsistency
- FPL: "in FL political giving" | US Sugar: "in campaign contributions" | Trulieve: "in FL political giving"
- Standardize these labels. All three should use the same measurement definition.

---

## CONTENT ACCURACY ISSUES

### CA1 — Rubio Senate Note (Blocker B1 above)

### CA2 — Trulieve/FPL Amounts (Blocker B3 above)

### CA3 — Investigation Spotlight Dollar Amounts Are Hardcoded
- All three amounts in `InvestigationSpotlight.js` are static strings, not pulled from Supabase. They will silently go stale as data updates quarterly. Post-launch, consider fetching these from donor profiles dynamically.

### CA4 — "2026 Cycle Open" Badge May Need Updating
- Once any 2026 filing deadline passes and data is processed, this badge should update to reflect the most recent filing date. Currently this is hardcoded in TickerRail.

---

## RECOMMENDED IMPLEMENTATION PLAN

### Day 1 (Mon Apr 21) — Blockers
- [ ] Fix B1: Update Marco Rubio → Ashley Moody in RACES_2026; verify exact numbers from Supabase
- [ ] Fix B3: Correct Trulieve amount ($210M+), standardize label wording, fix FPL amount
- [ ] Fix H4: Fix misleading home page quick link labels
- [ ] Fix M3: Verify /district → /who-funds redirect works; fix footer link if not

### Day 2 (Tue Apr 22) — Blockers + High
- [ ] Fix B2: Set up press@floridainfluence.com email forwarding; update all references to contact email
- [ ] Fix H5: Verify and update Governor race card (Byron Donalds number)
- [ ] Fix H3: Manually test all 4 loading-state pages in a real browser; document which are functional
  - If broken: triage and fix
  - If functional but slow: add skeleton loading states
  - For /races/2026 specifically: if data isn't loading, remove "New" badge from nav

### Day 3 (Wed Apr 23) — High + Medium
- [ ] Fix H1: Handle federal page incomplete data — either load the data or rewrite the status message to be informative, not alarming
- [ ] Fix H2: Add proper scope framing to 2024 elections page; link to candidate/cycle directories
- [ ] Fix M1: Update US Sugar spotlight amount to $38.8M+
- [ ] Fix M4: Update meta description end-date language
- [ ] Fix M5: Update ticker freshness display

### Day 4 (Thu Apr 24) — Medium + Polish
- [ ] Fix M6: Remove "sunny place for shady people" tagline from directory page headers (keep in footer)
- [ ] Fix M2: Verify Pulse page renders real data in browser; add timestamp if not
- [ ] Fix L1: Add industry bucket list to methodology page
- [ ] Fix L2: Add robots.ts
- [ ] Fix D4: Standardize InvestigationSpotlight label text across all three cards
- [ ] Fix D2: Update race card hrefs to race-specific pages if they exist

### Day 5 (Fri Apr 25) — Final Review
- [ ] Full walkthrough of all pages in browser at desktop + mobile width
- [ ] Verify all numbers on home page race cards match what Supabase reports
- [ ] Verify investigations spotlight numbers match donor profile totals
- [ ] Spot-check 3–5 entity profile pages (politician, lobbyist, committee) for layout/data integrity
- [ ] Test email forwarding from press@floridainfluence.com
- [ ] Review search bar on mobile — confirm usable
- [ ] Check sitemap.xml loads correctly at /sitemap.xml

---

## CRITICAL FILES TO MODIFY

| File | Issues |
|------|--------|
| `app/page.js` | B1 (Rubio), H4 (quick links), H5 (Governor number) |
| `components/home/InvestigationSpotlight.js` | B3, M1, D4 |
| `app/layout.js` | B2 (email refs), M4 (meta desc), L3 (back to top) |
| `app/about/page.js` | B2 (contact email) |
| `app/federal/page.js` | H1 (incomplete data message) |
| `app/elections/page.js` | H2 (2024 gap framing) |
| `app/connections/page.js` | H3 (verify/fix loading state) |
| `app/transparency/page.js` | H3 (verify/fix loading state) |
| `app/contracts/page.js` | H3 (verify/fix loading state) |
| `app/races/2026/page.js` | H3 (verify/fix loading state) |
| `components/shared/TickerRail.js` | M5 (data freshness) |
| `next.config.mjs` | M3 (/district redirect) |
| `app/robots.ts` | L2 (new file) |

---

## POST-DEPLOY AUDIT — 2026-04-21 (after Day 1–4 fixes shipped)

A second pass audit ran after the launch-readiness commit deployed. New findings below.

### A. TRUE DUPLICATES — same tool, different URLs

1. **`/district` and `/who-funds`** hit the same API (`/api/district`) with the same chamber+district form. `/district` now redirects to `/who-funds`, but is still listed in **NavLinks** ("District Lookup") AND on `/tools` ("District Money Map" with different description). Users see both in nav/tools → click either → land on same page, confused.
2. **"Follow $" top-level nav** + **"Follow the Money" in Tools dropdown** = same `/follow` destination, listed twice in nav.
3. **`/research`** page has a page-level `redirect('/influence')` AND a config redirect in `next.config.mjs` — two redirects on the same route. Harmless but messy.
4. **`/network/graph`** — retired "gravestone" page still renders a "retired" message and is in the sitemap. Dead page indexed by search engines.
5. **`/network`** redirects to `/flow`, **`/race`** redirects to `/candidates`, **`/district`** redirects to `/who-funds` — but all three still have page files AND sitemap entries.

### B. CONFUSING NAMING — distinct tools with overlapping names

| Pair | Actual difference |
|------|-------------------|
| `/flow` vs `/follow` | `/flow` = industry→donor→committee Sankey; `/follow` = donor→committee→candidate→vote chain |
| `/timeline` vs `/cycles` | `/timeline` = per-candidate quarterly chart; `/cycles` = multi-cycle comparison table |
| `/compare` vs `/explorer` | `/compare` = donor overlap; `/explorer` = 22M-row transaction filter |
| `/races` vs `/races/2026` vs `/race/[office]/[year]` | Index → leaderboard → race detail (works, but heavy) |

### C. DOCUMENTATION OVER-FRAGMENTATION

Five separate pages cover closely related content:
- `/about` · `/methodology` · `/data` · `/data-dictionary` · `/coverage`

**Recommendation:** merge `/data` + `/data-dictionary` + `/coverage` into `/methodology` with tabs. Nav "Sources" dropdown shrinks from 5 → 2.

### D. BROKEN ON PRODUCTION

- **Pulse "This Cycle" tab returns 500** — `{"error":"canceling statement due to statement timeout"}`. `donor_by_year` view is too slow for an unfiltered year sort. Needs a DB-side index or materialized view. Not a code bug.
- `/network` redirect reportedly returned "Redirect missing Location header" via WebFetch; verify in real browser.

### E. TOOLS PAGE BLOAT

- `/tools` has 34 cards; about page claims "27 tools" — off.
- Includes raw directories (Donors, Committees, Candidates, Vendors) which aren't really tools.
- Every tool on `/tools` is also in NavLinks — effectively a second nav copy.

### F. NAV LOAD

- 3 direct links + 5 dropdowns + search = 9 top-level elements. Tools dropdown alone has 12 items.
- Mobile overlay scrolls through 30+ items.

### G. MINOR UX POLISH

1. Footer "↑ BACK TO TOP" uses `href="#"` — not smooth-scroll
2. About page depth stat "27 tools" → actual count is 34
3. Ticker says "DATA: APR 2026" but Influence page shows "updated April 18" — inconsistent freshness display across datasets
4. `/pulse` fully client-rendered — WebFetch sees empty shell; bad for SEO

### H. QUICK-WIN FIXES (executing now)

1. Delete `app/district/page.js`; delete `components/tools/DistrictLookup.js` if unused elsewhere
2. Delete `app/network/graph/page.js`; add redirect `/network/graph` → `/connections`
3. Remove `/network`, `/research`, `/district`, `/network/graph` from `app/sitemap.js` STATIC_PAGES
4. Remove "District Lookup" entry from `components/shared/NavLinks.js` Tools dropdown
5. Remove "District Money Map" entry from `app/tools/page.js` ALL_TOOLS
6. Remove `/research` page-level redirect (redundant with config)
7. Add try/catch around `/api/pulse?type=cycle` so it returns `{ items: [] }` instead of 500 on timeout
8. (Backend, deferred) Create `top_donors_by_year_mv` materialized view
