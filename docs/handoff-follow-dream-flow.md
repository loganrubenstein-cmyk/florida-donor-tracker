# Handoff: /follow "Dream Use Case" — donor → principal → bill → vote

## Context

The user wants a user following a corporation (e.g. FPL) on `/follow` to see:
1. Where FPL donates (committees funded) ✅ already works
2. Which candidates those committees fund ✅ already works
3. Votes tied to bills FPL **lobbied on** ❌ not possible today

Today's /follow "Key Votes" column shows votes by the candidate-as-legislator — not votes on bills the **donor** lobbied on. That's the core gap. This week we fixed the API column mismatch so the existing feature at least renders truthfully, but the dream flow needs new plumbing.

## Starting state (as of 2026-04-22)

**What works**
- `contributions` → `donor_committees` view → `candidate_pc_links_v` → `candidates` — money chain end-to-end
- `politicians.candidate_acct_num` → `legislator_votes` (by `people_id`) — candidate-to-votes hop; now using correct columns (`vote_text`, `session_id`)
- `/legislator/{people_id}` profile has vote + bill-sponsorship + lobbyist-count tabs (T1 wired these today, commit `7ac86d3`)

**What doesn't exist**
1. **Donor → Principal link**. `principal_donation_matches` table exists (migration 005) but isn't wired into `donors` or queryable from `/follow`. Many FL corporate donors don't have a 1:1 principal row even if the same entity lobbies — name variants.
2. **Principal → Bill link**. Lobbying disclosures identify which bills a principal lobbied on; this data is in `public/data/lobbyist_disclosures/` as static JSON per principal, not in a queryable table.
3. **Bill identifier bridging**. `legislator_votes.bill_number` is strings like `HB 1019`; `bill_sponsorships` and lobby disclosures use different identifiers. There is a `billNumberToSlug()` helper in `lib/fmt.js` but no canonical bills table.

## What "done" looks like

User searches "Florida Power & Light" on /follow. They see:
- Committees FPL funds (existing)
- Candidates those committees fund (existing)
- **NEW: Bills FPL lobbied on** in the same session(s) the candidates voted
- **NEW: Those candidates' votes on those specific bills**, with a "voted with FPL's position" indicator where inferable

## Plan

### Phase 1 — Donor-to-Principal bridge (~2 days)

1. Create a view `donor_principal_links_v`:
   ```sql
   SELECT
     d.slug AS donor_slug,
     d.name AS donor_name,
     p.slug AS principal_slug,
     p.name AS principal_name,
     similarity(upper(d.name), upper(p.name)) AS match_score
   FROM donors d
   JOIN principals p ON upper(d.name) = upper(p.name)
                    OR similarity(upper(d.name), upper(p.name)) > 0.85
   WHERE d.name IS NOT NULL AND p.name IS NOT NULL;
   ```
   Requires `pg_trgm` extension; project already uses it (see NAICS lesson in memory).

2. Validate coverage: target ≥60% match rate on the top 500 corporate donors. Manually review and add overrides table for known aliases (FPL ↔ Florida Power & Light, NextEra ↔ NextEra Energy, etc.).

3. Expose in API: `/api/follow?step=principals&donor_slug=...` returns matched principals.

### Phase 2 — Principal-to-Bill table (~2 days)

1. Load `public/data/lobbyist_disclosures/by_principal/*.json` into a new Supabase table:
   ```sql
   CREATE TABLE principal_lobbied_bills (
     principal_slug TEXT,
     bill_slug TEXT,       -- normalized via billNumberToSlug()
     bill_number TEXT,
     session_year INT,
     position TEXT,        -- 'support' | 'oppose' | null (partially derivable)
     filing_count INT,
     PRIMARY KEY (principal_slug, bill_slug, session_year)
   );
   ```

2. Script: `scripts/NN_load_principal_lobbied_bills.py` — read static JSON, insert into Supabase.

3. Expose in API: `/api/follow?step=principal_bills&principal_slug=...&session=2024-2026` returns bills.

### Phase 3 — Candidate votes on those specific bills (~1 day)

1. Given candidate `people_id` + bill list, query `legislator_votes` filtered by `bill_number IN (...)` and join session.

2. Classify: vote = "aligned with donor" vs "against donor" when principal position is known.

3. Render a new column on /follow replacing or supplementing "Key Votes":
   ```
   Candidate voted YES on HB 1019 (FPL supported) ✅ aligned
   Candidate voted NO on HB 2201 (FPL opposed)     ✅ aligned
   Candidate voted YES on HB 7053 (FPL position unknown)
   ```

### Phase 4 — Confidence framing (~half day)

- Show match-score chip on the principal hop: "Donor ↔ Principal match: high/medium/low"
- Show "position inferred from filing text" caveat where stance is derived
- Empty-state: "FPL lobbied 42 bills this session; candidate X voted on 3 of them" is honest even with thin coverage

## Gotchas

- **T1 is active on `legislator_votes` and `bill_sponsorships`** — do not alter those schemas. Build bridging tables alongside, don't rewrite existing ones.
- **Bill identifier normalization** matters. `HB 1019` in one table might be `H1019` or `hb-1019` elsewhere. Use `billNumberToSlug()` + `getBienniumStart()` consistently (already in `lib/fmt.js`).
- **pgbouncer autocommit** — see memory `data_integrity_lessons.md` for known gotchas with multi-statement DDL.
- **Principal name fuzziness** is the single biggest risk. Without an override table, popular donors like "FPL" and "Florida Power & Light Company" won't match automatically. Plan for a curated alias table from day one.

## Files to touch

**New:**
- `supabase/migrations/NN_donor_principal_link.sql`
- `supabase/migrations/NN_principal_lobbied_bills.sql`
- `scripts/NN_load_principal_lobbied_bills.py`
- `app/api/follow/route.js` (new `step=principals` and `step=principal_bills`)

**Modified:**
- `components/follow/FollowExplorer.js` — add two new columns OR replace "Key Votes" with "Votes on lobbied bills"
- `app/follow/page.js` — update chain diagram at top (currently Donor → Committee → Candidate → Vote; should become Donor → Committee → Candidate → Bill → Vote OR Donor → Principal → Bill → Votes)

## Why not this week

- Phase 1 alone is 2 days of data work + validation; Phase 2 is another 2. Total 5–6 days for Phase 1–3.
- Needs Supabase migrations + schema review.
- Bill identifier normalization is trickier than it looks; easy to ship a broken join that silently returns empty.
- Better to hand off clean than to rush a half-built chain that the user can't trust.
