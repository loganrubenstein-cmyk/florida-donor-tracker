# Subagent 1: Deduplicate / DRY — Assessment

## Summary
- HIGH extractions recommended: 2
- MEDIUM: 1 (skip per CLAUDE.md)
- LOW/SKIP: 2

## HIGH confidence (extract)

### 1. Compact money formatter — 6+ inline copies
**Duplicated in:**
- `components/flow/FlowClient.js:9-15`
- `components/committees/CommitteesList.js:17-23`
- `components/elections/ElectionsView.js:22-28`
- `components/legislators/LegislatorsList.js:14-17`
- `components/lobbyists/LobbyingFirmsList.js:14-17`
- `components/influence/InfluenceIndex.js:8-14`
- `components/connections/ConnectionsView.js:31-35`

**Canonical pattern:**
```js
function fmtMoney(n) {
  if (!n) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
```

**Proposal:** Reconcile with existing `fmtMoneyCompact` in `lib/fmt.js` — the existing helper differs slightly on zero-handling. Standardize on one signature + replace all inline copies with import.

**LOC saved:** ~60+
**Risk:** Low — verify zero/null return values (some callers expect `'—'`, others `'$0'`).

### 2. Compact count formatter — 4+ inline copies
**Duplicated in:**
- `components/committees/CommitteesList.js:25-29` (as `fmtCount`)
- `components/elections/ElectionsView.js:30-35` (as `fmtNum`)
- `components/legislators/LegislatorsList.js:52-56`
- Plus inline `.toLocaleString()` in `components/solicitations/SolicitationsList.js` (×4) and `components/lobbyists/LobbyingFirmsList.js:90-92`

**Canonical pattern:**
```js
function fmtCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
```

**Proposal:** Add `fmtCountCompact(n)` to `lib/fmt.js` alongside existing plain `fmtCount`. Replace local copies with import. Note: the previous subagent 3 removed `fmtCountCompact` as "unused" — it was actually re-implemented locally in multiple components. Restoring it is the correct fix.

**LOC saved:** ~45+
**Risk:** Low.

## MEDIUM (skip per CLAUDE.md)

### `parseFloat(x) || 0` pattern — 30+ occurrences in lib/load*.js
Appears in loadCandidate (10+), loadCommittee (7+), loadDonor (4+), loadLobbyist (8+), loadLegislativeCommittee (4+). Could extract to `toFloat(x)` helper but it's idiomatic JS and CLAUDE.md says "three similar lines is better than a premature abstraction." **Skip.**

## LOW / SKIP

### Mixed money formatting styles (plain locale vs compact)
`LegislatorsList.js:17` and `LobbyingFirmsList.js:17` use `.toLocaleString()` for full-number display — intentionally different from compact B/M/K. Not duplication.

### `ElectionsView.js:6-7` PARTY_COLOR / PARTY_LABEL inline
A single file re-implementing what `lib/partyUtils.js` already owns. This is a LOW-impact fix (one file) but worth doing — import from partyUtils instead.

## Notes for implementation

**Order:**
1. Restore / expand `fmtMoneyCompact` and add `fmtCountCompact` to `lib/fmt.js` with agreed signatures.
2. Replace inline copies file-by-file (~8 files touched).
3. Small fix: swap ElectionsView.js party lookup to import from `partyUtils.js`.

**Standardize:** return `'—'` for null/undefined/0 in both new helpers. If a caller truly wants `'$0'`, they can pass a sentinel or handle it externally — do not ship two variants.

**Test after:** `npm run build` and visual check on Committees / Elections / Legislators / Lobbyists list pages.

**Warnings:**
- `lib/fmt.js` had `fmtMoneyCompact` and `fmtCountCompact` exports; subagent 3 removed `fmtCountCompact` as unused. Reinstate it — the "unused" signal was misleading because consumers had local copies.
