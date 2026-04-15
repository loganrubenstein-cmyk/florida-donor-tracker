# Subagent 7: Legacy/Fallback/Deprecated Removal — Assessment

## Summary
- Total findings: 7
- HIGH confidence removals: 1
- MEDIUM confidence: 4
- LOW/KEEP: 2

## HIGH confidence (safe to remove)

### 1. scripts/80_load_linkage_edges_supabase.py:112-144 — `candidate_pc_links` backfill
The backfill of the legacy `candidate_pc_links` table is explicitly documented in a comment (line 113) as transitional: "Keep the old table in sync until loadCandidate.js is updated to use the view candidate_pc_links_v." `lib/loadCandidate.js:61` already queries `candidate_pc_links_v` (the new view). The backfill is therefore orphaned.

**Removal blocker:** implementation agent must grep for any other reader of `candidate_pc_links` (no `_v` suffix) in `app/`, `components/`, `lib/`, and other `scripts/` before deleting. If clean, safe to remove the backfill block.

## MEDIUM confidence (needs human review)

### 2. components/candidate/CandidateProfile.js:28-38 — legacy link_type labels
Enum of labels (chair, treasurer, solicitation, historical, direct_contribution, iec, ecc, statement_of_org, distribution) marked "Legacy labels (candidate_pc_links table fallback)". Unclear if these are still rendered — should be confirmed dead after #1 above.

### 3. components/donors/DonorTable.js:14-22 — dual-shape `normalizeDonor()`
Accepts either legacy static-JSON shape `{total_amount, type}` OR new Supabase shape `{total_combined, total_hard, total_soft, is_corporate}`. Static-JSON path should be dead per `CLAUDE.md` ("All data comes from Supabase"). Confirm, then collapse to single shape.

### 4. scripts/98_scrape_ethics_disclosures.py:33-47 — `--requests-only` fallback
Documented as "likely to fail on JS-rendered site" and "exists for CI/CD fallback." Unclear if this flag is ever used. Review with user before removing — script is actively in-flight.

### 5. components/elections/ElectionsView.js:276 — non-2024 year fallback UI
"For non-2024 years: show top50 races as fallback." Legitimate conditional — not legacy, but flagged in case the user wants to extend 2024 path to other cycles. Likely KEEP.

## LOW / KEEP

### 6. React `<Suspense fallback>` across app/
These are async-boundary fallbacks, not deprecated code. KEEP.

### 7. Backfill scripts (53, 66, 83)
Data-integrity operations. Script 83 handles committee 70275 reconciliation per memory. Operational tools, not legacy. KEEP.

## Notes for implementation

- **Dependency order:** Audit `grep -rn "candidate_pc_links[^_]" app/ components/ lib/ scripts/` (note: `[^_]` excludes the `_v` suffix) before touching script 80.
- **No dead feature flags found** — no `if (true)` / `if (false)` branches, no always-on/off env-var switches.
- **No polyfills or shims** — modern browser target only.
- **Scripts 92–99 are active features** (shadow PACs, contracts, FEC 527s, Sunbiz, ethics, USAspending). DO NOT flag as legacy.
- **Action plan for implementation:** resolve #1 + #2 together as a pair (they reference the same table). Ask user about #3 (dual shape) and #4 (ethics requests-only flag). Skip #5–#7.
