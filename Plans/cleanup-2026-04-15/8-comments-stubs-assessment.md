# Subagent 8: AI Slop / Stubs / Comments — Assessment

## Summary
- Files scanned: 166 JS + ~40 Python scripts in scope
- Comment-removal candidates: ~10–15 operational-narration comments in JS
- Stub functions: 0 (none found; scaffolding in script 98 is intentional)
- Unhelpful docstrings: 0
- JSDoc `@param {any}`: 0 (pattern not used)

## HIGH confidence removals (patterns)

### Pattern A: Operational narration above obvious code
Redundant "what-the-next-line-does" comments above well-named variables/await calls.

**Files with heaviest occurrence:**
- `app/politician/[slug]/page.js:66-99` — ~6–8 comments (`// Sort cycles newest first`, `// Determine active cycle`, `// Load full candidate data`, `// Check if any cycle acct_num`, `// Build acct → financials map`, `// Election results for all accounts`)
- `app/api/transparency/route.js` — ~3–4 step comments
- `app/api/timeline/route.js` — ~3 step comments
- `app/api/overlap/route.js` — ~3 step comments

**Rationale:** Variable names already say what's happening (`sortedCycles`, `activeCycle`, `acctFinancialsMap`). Comments don't add information.

**Proposal:** remove only the pure-narration ones; leave any comment that explains *why* a choice was made.

## Comments to KEEP (hidden-constraint value)

- `lib/loadLobbyist.js:40-41` — "Prefer `lobbyists.total_comp`... over summing `lobby_lobbyist_annual` rows — the latter uses a different name format and misses many lobbyists." Documents a real upstream quirk. KEEP.
- `app/politician/[slug]/page.js:81-82` — "We pass all cycles from the politician index instead, which is richer." Explains a non-obvious data choice. KEEP.
- `scripts/98_scrape_ethics_disclosures.py:29-34` — SITE TECH NOTEs documenting ASP.NET SPA + anti-forgery tokens. KEEP.

## Scaffolding — KEEP

`scripts/98_scrape_ethics_disclosures.py` has actionable TODO markers (lines 290, 351, 373, 795, 819, 835, 851, 861) paired with "inspect what the page actually renders" / column-mapping hints. The top-of-file docstring says "The parsers below are scaffolded with clear TODO markers for each section." These are the implementation roadmap for a Phase 2 scraper finish — **NOT noise**. KEEP.

`scripts/21_import_candidate_contributions.py:16` — future-work TODO pointing at the industry classifier in memory. Legitimate planning note. KEEP (or defer to backlog).

## Stubs
None found. No empty-body JS arrows, no Python functions with only `pass` and no callers. All placeholder functions in script 98 are guarded scaffolding with docstrings.

## Notes for implementation

**Priority files (most noise per file):**
1. `app/politician/[slug]/page.js` — 6–8 narration comments
2. `app/api/transparency/route.js`
3. `app/api/timeline/route.js`
4. `app/api/overlap/route.js`

**Rules of thumb for the implementation agent:**
- KEEP comments that answer "why" (source quirk, ordering constraint, non-obvious data choice).
- REMOVE comments that only say "what" when the identifiers already say it.
- NEVER touch script 98 TODO markers.
- Do not touch auto-generated headers (license, copyright — none found, but be vigilant).

**Estimated scope of actual edits:** ~15 lines deleted across 4 files. Very small change. Low risk.
