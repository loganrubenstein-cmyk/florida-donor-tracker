# UX Audit Fix Plan — FL Donor Tracker
**Created:** 2026-04-13 | **Based on:** Puppeteer visual audit, T1 session

---

## Fix 1 — Committee Connections tab: blank instead of empty state
**Priority: High | Effort: 5 min**
**File:** `components/committee/CommitteeConnections.js:15`

Root cause: `if (!connections || connections.length === 0) return null;` renders nothing on empty.

```js
// Replace line 15 with:
if (!connections) return null;
if (connections.length === 0) return (
  <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', padding: '1.5rem 0' }}>
    No coordination signals found for this committee.
  </div>
);
```

---

## Fix 2 — Soft money "$0 with N PACs" misleading on candidate profiles
**Priority: High | Effort: 15 min**
**File:** `components/candidate/CandidateProfile.js:175`

Root cause: `hasLinkedPcsButNoSoft` only triggers on `!isLatestCycle`. Latest cycle DeSantis shows "$0 soft" + "1 candidate PAC + 58 affiliated" — looks like a data error to users.

```js
// Current line 175:
const hasLinkedPcsButNoSoft = data.soft_money_total === 0 && pcsWithData.length > 0 && !isLatestCycle;

// Fix — drop the isLatestCycle guard:
const hasLinkedPcsButNoSoft = data.soft_money_total === 0 && (pcsSpecific.length + pcsAffiliated.length) > 0;
```

Result: shows "Tracked on most recent cycle" sub-text for any $0-soft cycle with linked PACs.

---

## Fix 3 — Lobbyist profile: EST. COMPENSATION stat box shows "—"
**Priority: High | Effort: 20 min**
**Files:** `components/lobbyists/LobbyistProfile.js`, `lib/loadLobbyistProfile.js` (or page.js Supabase query)

Root cause: T2 added `total_comp` to `lobbyists` table (1,071 of 2,473 matched). Comp history table rows already use `c.total_comp` (line 159) but the top-level EST. COMPENSATION stat box isn't reading it.

Steps:
1. Confirm `total_comp` is included in the Supabase `select()` for the lobbyist page data load
2. In LobbyistProfile.js, find the EST. COMPENSATION stat element and replace the hardcoded "—" with `data.total_comp ? fmtMoney(data.total_comp) : '—'`

---

## Fix 4 — Industry page: duplicate candidate entries (same person, different cycles)
**Priority: Medium | Effort: 30 min**
**File:** `components/industries/IndustryProfile.js` (frontend dedup — Option B)

Root cause: `public/data/industry_donors/*.json` stores one row per `acct_num`. DeSantis appears twice (2018 Gov + 2022 Gov).

Frontend dedup in IndustryProfile.js, in the top recipients render:
```js
// Before mapping topDonors, dedupe by candidate_name keeping highest total:
const dedupedDonors = (topDonors || []).reduce((acc, r) => {
  const existing = acc.find(x => x.candidate_name === r.candidate_name);
  if (!existing) return [...acc, r];
  if (parseFloat(r.total) > parseFloat(existing.total)) {
    return acc.map(x => x.candidate_name === r.candidate_name ? r : x);
  }
  return acc;
}, []);
// Use dedupedDonors instead of topDonors in the render
```

Long-term (next quarterly): fix in the pipeline script that generates industry_donors JSON — group by politician_canonical.

---

## Fix 5 — Donor profile: FPL Lobbying tab shows no match despite principal existing
**Priority: Medium | Effort: 1–2 hrs (pipeline) — POST-DEPLOY**
**Files:** `scripts/17_export_lobbyists.py`, then re-run `scripts/25_export_donor_profiles.py`

Root cause: `principal_matches.csv` was generated before T2 added full 2007–2026 principal data (scripts 87–91). Many new principals now in Supabase weren't matched in the original run.

Steps (after Q1 deploy):
1. Re-run script 17 to regenerate `data/processed/principal_matches.csv` with updated principals
2. Verify FPL appears in the new CSV: `grep -i "florida power" data/processed/principal_matches.csv`
3. Re-run script 25 (`--force`) to regenerate all donor profiles with new principal matches (~4 hrs)
4. Verify `/donor/florida-power-light-company?tab=lobbying` now shows the cross-link

If FPL still doesn't match after script 17, check the normalization — both sides should be `.strip().upper()`. Look for "&" vs "AND" variants or "COMPANY" vs "CO." truncation.

---

## Fix 6 — Transaction Explorer: blank on load is uninviting
**Priority: Medium | Effort: 20 min**
**File:** `components/explorer/TransactionExplorer.js` (or equivalent client component)

Root cause: Explorer fetches only when a filter is applied. Empty table on load discourages exploration.

Fix: On initial mount (all filters empty/default), fire a default query:
- No name filter, no acct filter, sorted by `contribution_date DESC`, limit 50
- Show with header: "Recent Transactions — use filters above to search"
- Once any filter is set, switch to filtered mode and remove the "Recent" header

---

## Fix 7 — Connections page: all-caps committee names
**Priority: Low | Effort: 10 min**
**File:** `components/connections/ConnectionsView.js`

```js
// Add helper near top of file:
const ALL_CAPS_EXCEPTIONS = new Set(['PAC', 'LLC', 'ECO', 'NOP', 'DBA', 'INC', 'II', 'III']);
const toTitle = s => s.toLowerCase().replace(/\b\w+/g, w =>
  ALL_CAPS_EXCEPTIONS.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)
);

// Wrap all entity_a / entity_b display:
{toTitle(row.entity_a)}
{toTitle(row.entity_b)}
```

---

## Fix 8 — Add Cycles directory page
**Priority: Low | Effort: 30 min**
**New file:** `app/cycles/page.js`

Simple server component. Query `candidates` grouped by `election_year` for candidate counts. Pull totals from `cycle_donors` table. Render as grid of cards linking to `/cycle/YEAR`.

Also: add "← cycles" back-link to all `/cycle/[year]` pages (currently no way to navigate back to a cycle list).

---

## Recommended Implementation Order

| # | Fix | Effort | Do when |
|---|---|---|---|
| 1 | Fix 2 — soft money $0 label | 15 min | Before Q1 deploy |
| 2 | Fix 1 — connections empty state | 5 min | Before Q1 deploy |
| 3 | Fix 4 — industry page dedup | 30 min | Before Q1 deploy |
| 4 | Fix 3 — lobbyist EST. COMP stat box | 20 min | Before Q1 deploy (T2) |
| 5 | Fix 7 — title-case committee names | 10 min | After deploy |
| 6 | Fix 6 — explorer default load | 20 min | After deploy |
| 7 | Fix 8 — cycles directory page | 30 min | After deploy |
| 8 | Fix 5 — FPL name matching | ~4 hrs pipeline | Post-deploy (run script 17 + re-run script 25) |
