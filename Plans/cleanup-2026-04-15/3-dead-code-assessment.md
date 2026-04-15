# Cleanup Subagent 3 — Dead Code Removal Assessment

## Summary

Baseline findings across tools: 85 "unused files" + 145 "unresolved imports" + 3 unused exports (knip), 5 unused deps + 4 unused devDeps (depcheck), 18 unused imports + 8 unused locals + ~50 f-string warnings (pyflakes), 0 actionable items at confidence 80 (vulture).

**Fixes implemented: 21 items across 17 files, 1 dep removed.** `npm run build` ✓ Compiled successfully. `python -m py_compile scripts/*.py` clean.

## HIGH confidence — REMOVED

### JavaScript
- `lib/fmt.js:52` — removed `fmtCountCompact` (grep-verified: 0 real callers).
- `lib/fmt.js:76` — removed `fmtYearRange` (grep-verified: 0 real callers).
- `package.json:17` — removed `graphology-layout-forceatlas2` dep (grep-verified: only doc/plan refs, no source imports).

### Python — unused imports (auto-applied via pycln)
- `scripts/02b_discover_closed_committees.py` — `io.StringIO`
- `scripts/14_download_lobbyists.py` — `datetime`
- `scripts/15_import_lobbyists.py` — `datetime`
- `scripts/28_export_industry_trends.py` — `os`
- `scripts/29_export_cycle_donors.py` — `datetime`
- `scripts/32_add_industry_to_donor_index.py` — `os`
- `scripts/37_export_candidate_expenditures.py` — `collections.defaultdict`
- `scripts/39_parse_solicitations.py` — `os`, `defaultdict`
- `scripts/53_backfill_top_donor_details.py` — `defaultdict`
- `scripts/66_backfill_date_ranges.py` — `sys`
- `scripts/67_load_ie_supabase.py` — `time`
- `scripts/71_import_legislators.py` — `sys`
- `scripts/72_scrape_committees.py` — `json`, `sys`
- `scripts/92_resolve_solicitation_stubs.py` — `csv`, `defaultdict`
- `scripts/94_import_fl_contracts.py:44` — `PROJECT_ROOT` from `from config import ...` (manually edited; pycln skips partial-from imports)
- `scripts/96b_match_527s_bulk.py` — `io`

## MEDIUM — FLAGGED, NOT REMOVED

- **devDeps `eslint`, `eslint-config-next`, `jest`, `jest-environment-node`** (depcheck flagged). `next build` runs ESLint implicitly; removing eslint-config-next can break future lint steps. `jest`/`jest-environment-node` are required by `npm test` and jest.config.mjs (`testEnvironment: 'node'`). 0 current JS test files but config exists for future tests.
- **Python unused locals** (pyflakes, 7 occurrences: `counts`, `treasurer`, `donor_party_totals`, `canonical_set`, `downloaded`, `http`, redundant `os` redefinition in `35_export_search_index.py`). Low-risk but some may be debug-intent assignments worth preserving. Defer.
- **`except Exception as e`** unused-`e` patterns (4 occurrences in 42/51/55/98). Idiomatic Python; skip.
- **knip's remaining 1 "unused export"** in post-fix run — configuration-driven false positive (see below).

## LOW — SKIPPED (tooling unreliable)

- **knip 85 "unused files" and 145 "unresolved imports"** — every single one is a false positive. Knip is not resolving the `@/` path alias declared in `jsconfig.json`. Verified by spot-checking: `lib/db.js` is imported by 20+ API routes, `components/shared/*` is used across app pages. Knip's own output includes "Create knip.json configuration file" — it literally asks for config.
- **pyflakes f-string warnings (~50)** — these are style bugs (authors wrote `f"literal"` with no placeholder), not dead code. Out of scope — flag for subagent 8.
- **vulture (min-confidence 80)** — no actionable findings, only 2 syntax warnings for `\ ` escape in docstring shell snippets in `scripts/40_load_supabase.py` and `scripts/53_backfill_top_donor_details.py`. Cosmetic; defer.

## False-positive patterns for future subagents

1. **KNIP IS MISCONFIGURED in this repo.** It does not resolve `@/*` → `./*` from jsconfig.json. Treat every knip "unused file" and "unresolved import" as suspect. Only trust `Unused exports` findings, and still grep-verify (knip reported `fmtDate` was unused — it's used in 5 files). Recommend a follow-up task: add `knip.json` with `paths: { "@/*": ["./*"] }`.
2. **Next.js App Router convention files** (`page.js`, `layout.js`, `sitemap.js`, `robots.*`, `opengraph-image.*`, dynamic `[slug]` routes) are referenced by filesystem routing, not imports. Never mark unused.
3. **`jest-environment-node`** depends on jest.config.mjs `testEnvironment: 'node'` — not a direct import, but required at runtime. Depcheck misses this.
4. **ESLint / eslint-config-next** — `next build` auto-runs ESLint even without a lint script or .eslintrc. Do not remove.
5. **`florida-donor-tracker-review/`** — out-of-scope snapshot directory; knip scans it but any finding there is meaningless.
6. **Pycln handles most unused Python imports in one command** — use `.cleanup-venv/bin/pycln scripts/` not `--check`. It won't remove partially-used `from X import A, B` lines; handle those manually.
