# Subagent 5: Weak-Boundary Input Tightening — Assessment

## Summary
- JS boundaries needing guards: 8 critical (5 API routes with untrusted sort/limit params, 3 page routes with slugs)
- Python signatures to tighten: 4 (public entry points lacking return-type hints)

## HIGH — JS boundaries

### `app/api/donors/route.js:12-14` — unwhitelisted `sort`
Current: `sort = searchParams.get('sort') || 'total_combined'` passed directly to `.order(sort, ...)`.
Risk: malformed sort triggers Supabase 500s; invalid column names leak schema.
Guard:
```js
const validSorts = ['name', 'total_combined', 'total_soft', 'total_hard', 'num_contributions'];
const sortRaw = searchParams.get('sort');
const sort = validSorts.includes(sortRaw) ? sortRaw : 'total_combined';
```

### `app/api/politicians/route.js:26` — same pattern
Whitelist `year`, `total_combined_all`, `display_name` before sortMap lookup.

### `app/api/transparency/route.js:7` — `limit` lacks lower bound
Current: `limit = Math.min(parseInt(...) || '50', 100)` — negatives/zero slip through.
Guard:
```js
const limit = Math.max(1, Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 100));
```

### `app/principal/[slug]/page.js:22-27` — no slug shape check
Guard:
```js
if (!slug || typeof slug !== 'string' || slug.length > 200) notFound();
```

### `app/candidate/[acct_num]/page.js:51,71` — no format check on acct_num
Guard:
```js
if (!acct_num || !/^\d{1,10}$/.test(String(acct_num))) notFound();
```

### `app/cycle/[year]/page.js:54-56` — year not numerically validated
Guard:
```js
const yearNum = parseInt(year, 10);
if (!yearNum || yearNum < 2000 || yearNum > 2100) notFound();
```

### `lib/loadCandidate.js:65-68` — unchecked row-map build
Guard with null-safe iteration:
```js
const _pcCommitteeMap = {};
for (const c of pcCommitteeRows || []) {
  if (c && c.acct_num) _pcCommitteeMap[c.acct_num] = c;
}
```

### `lib/loadLobbyist.js:18-27` — Promise.all silently swallows errors
Guard:
```js
const [{ data: principalRows, error: e1 }, { data: compRows, error: e2 }] = await Promise.all([...]);
if (e1 || e2) throw new Error(`loadLobbyist: ${e1?.message || e2?.message}`);
```
**Note:** `throw` here reaches Next.js error boundary; confirm with implementation agent this is preferred over null-return.

## MEDIUM
- `app/api/influence/route.js` — dynamic sortMap → whitelist
- `app/api/committees/route.js` — client-side heuristic party filter; consider moving to SQL
- `app/api/search/donors/route.js` — no pagination input validation
- `lib/loadCandidate.js:82` — `.ilike('matched_candidates', candidateName)` may need `%`/`_` escaping

## Python — function signatures to tighten

| File:line | Current | Proposed |
|---|---|---|
| `scripts/40_load_supabase.py:45` | `def flush(cur, sql, rows):` | `def flush(cur, sql: str, rows: list[tuple]) -> int:` |
| `scripts/40_load_supabase.py:52` | `def load_json(path):` | `def load_json(path: Path) -> dict \| list:` |
| `scripts/42_load_candidate_contributions.py:147` | has partial hint | add return: `-> tuple[str, int, dict]` |
| `scripts/74_fetch_bill_sponsors.py:39` | `def legiscan_get(session, op, **kwargs):` | `def legiscan_get(session: requests.Session, op: str, **kwargs) -> dict:` |

## Skip / leave
- Generic dataframe helpers (intentional dynamic shapes)
- Shell orchestration in scripts (06, .command files)

## Implementation order
1. API route whitelists (5 files) — lowest risk, high value.
2. Page route slug/year/acct_num guards (3 files) — also low risk.
3. `lib/loadCandidate.js` row-map guard — straightforward.
4. `lib/loadLobbyist.js` Promise.all error surfacing — **decide `throw` vs null-return with user** before implementing. If we throw, we need an error boundary path.
5. Python hints — mechanical.

## Warnings
- The existing Next.js pages likely already call `notFound()` in some cases; confirm we're adding, not duplicating.
- Do NOT install `zod` / `yup` — per project rules, use plain JS guards only.
