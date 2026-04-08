# Supabase Migration Design
**Date:** 2026-04-08  
**Project:** Florida Donor Tracker  
**Status:** Approved — ready for implementation planning

---

## Overview

Migrate the Florida Donor Tracker from 777MB of static JSON files to a hosted Postgres database (Supabase). The website visitors see no change. The developer gains a queryable database, faster builds, and a foundation for new analysis tools.

---

## Architecture

**Before:**
```
Python scripts → JSON files in public/data/ → Next.js reads files at build time → Vercel serves 59K+ static pages
```

**After:**
```
Python scripts → Supabase (Postgres) → Next.js queries DB via API routes → Vercel serves pages on demand
```

The Python pipeline continues to run manually when new FL DoE data drops (a few times per year). Instead of writing thousands of JSON files, it loads rows into Supabase tables. Next.js queries Supabase instead of reading files. Vercel hosts the app code only — no more data files bundled in the deploy.

---

## Database Schema

### Core Tables

| Table | Est. Rows | Source |
|---|---|---|
| `donors` | 44K | `donors/index.json` + `donors/{slug}.json` |
| `candidates` | 6,940 | `candidates/{acct}.json` + `candidate_stats.json` |
| `committees` | 4,440 | `committees/{acct}.json` + `committees/index.json` |
| `lobbyists` | 2,474 | `lobbyists/index.json` + `lobbyists/{slug}.json` |
| `principals` | 4,035 | `principals/index.json` + `principals/{slug}.json` |
| `contributions` | 3.18M | `candidate_contributions.csv` (raw hard money rows) |
| `industry_buckets` | 15 | `industry_summary.json` |
| `industry_by_committee` | 4,440 | `industries/{acct}.json` |
| `industry_trends` | ~150 | `industry_trends.json` (15 industries × 10 cycles) |
| `entity_connections` | 500 | `entity_connections.json` |
| `candidate_pc_links` | 636 | `candidate_pc_links.json` |
| `cycle_donors` | ~200 | `cycle_donors.json` |

### Column Design Principles

- Every table gets a standard `id` (bigint, auto-increment) primary key
- Every table gets `created_at` and `updated_at` timestamps
- Key profile tables (`donors`, `candidates`, `committees`, `lobbyists`, `principals`) get an `extra JSONB` column for freeform fields not yet formally modeled
- Lookup keys follow existing patterns: `slug` for donors/lobbyists/principals, `acct_num` for candidates/committees

### Key Column Definitions

**`donors`**
```sql
id, slug, name, is_corporate, total_soft, total_hard, total_combined,
num_contributions, top_occupation, top_location, num_committees,
num_candidates, has_lobbyist_link, industry, extra JSONB
```

**`candidates`**
```sql
id, acct_num, candidate_name, election_year, office_desc, party_code,
district, hard_money_total, soft_money_total, total_combined,
num_hard_contributions, num_linked_pcs, extra JSONB
```

**`committees`**
```sql
id, acct_num, committee_name, total_received, num_contributions, extra JSONB
```

**`contributions`** (raw hard money rows)
```sql
id, candidate_acct_num, contributor_name, contributor_slug,
amount, date, occupation, employer, city, state, zip,
is_corporate, cycle_year
```

**`lobbyists`**
```sql
id, slug, name, firm, city, state, num_principals, num_active,
total_donation_influence, has_donation_match, top_principal, extra JSONB
```

**`principals`**
```sql
id, slug, name, num_lobbyists, num_active, extra JSONB
```

---

## Evolvability Rules

1. **All schema changes via migration files** — saved as `supabase/migrations/YYYYMMDDHHMMSS_description.sql` and committed to git. The database can always be recreated from scratch by replaying migrations.

2. **`extra JSONB` on profile tables** — new fields go here first. Once confirmed permanent, promote to a real column via a new migration.

3. **New data sources = new tables** — Independent Expenditures, lobbyist compensation reports, Accountability Project historical data, etc. each get their own table and migration. No existing tables are modified.

4. **Pipeline pattern unchanged** — new data source = new numbered Python script that loads into its new table.

---

## Migration Strategy

Phases run sequentially. JSON files are never deleted until the corresponding pages are confirmed working.

**Phase 1 — Infrastructure**
- Install Supabase JS client in Next.js (`@supabase/supabase-js`)
- Add env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Install Supabase Python client (`supabase`) in the pipeline venv
- Initialize Supabase CLI and migrations folder

**Phase 2 — Schema**
- Write migration files for all 12 tables
- Run migrations against the Supabase project
- Add indexes: `slug`, `acct_num`, `contributor_slug`, `election_year`, `party_code`

**Phase 3 — Data Load**
- Write `scripts/40_load_supabase.py` — reads existing processed CSVs/JSONs and bulk-loads all tables
- Verify row counts match expected values

**Phase 4 — API Routes**
- Add `app/api/` Next.js route handlers:
  - `GET /api/donors` — paginated, searchable donor list
  - `GET /api/donors/[slug]` — single donor profile
  - `GET /api/candidates` — paginated candidate list
  - `GET /api/candidates/[acct_num]` — single candidate profile
  - `GET /api/committees` — paginated committee list
  - `GET /api/committees/[acct_num]` — single committee profile
  - `GET /api/lobbyists` — paginated lobbyist list
  - `GET /api/lobbyists/[slug]` — single lobbyist profile
  - `GET /api/principals/[slug]` — single principal profile
  - `GET /api/search` — cross-entity search

**Phase 5 — Frontend Migration (page by page)**
Migrate in this order (most impactful first):
1. `/donors` directory — swap client-side index.json load → server-side paginated API query
2. `/candidates` directory
3. `/committees` directory
4. `/lobbyists` + `/principals` directories
5. `/donor/[slug]` profile pages
6. `/candidate/[acct_num]` profile pages
7. `/committee/[acct_num]` profile pages
8. `/lobbyist/[slug]` + `/principal/[slug]` profile pages
9. Remaining pages: `/industries`, `/industry/[slug]`, `/cycles`, `/cycle/[year]`, `/connections`, `/flow`

**Phase 6 — Cleanup**
- Delete `public/data/` JSON files
- Delete `lib/loadDonor.js`, `lib/loadCandidate.js` etc. (replaced by API routes)
- Remove static generation (`generateStaticParams`) from profile pages
- Update Vercel env vars

---

## Next.js Page Strategy

**Directory pages** (`/donors`, `/candidates`, etc.):
- Currently: browser downloads full index JSON, filters client-side
- After: server-side pagination + search via API routes, 20 results per page, fast

**Profile pages** (`/donor/[slug]`, `/candidate/[acct_num]`, etc.):
- Currently: `generateStaticParams` pre-builds 59K+ pages at deploy time
- After: dynamic route, queries Supabase on first visit, cached by Vercel's CDN
- Result: deploys go from minutes → seconds; pages always show latest data

---

## Error Handling

- API routes return structured JSON errors with HTTP status codes
- If Supabase is unreachable, pages show a "data temporarily unavailable" message rather than crashing
- During migration, JSON fallback stays in place until each page is confirmed

---

## Testing

- After Phase 3 (data load): verify row counts in Supabase dashboard match expected values
- After each Phase 5 page migration: spot-check 5 random profiles against the old JSON files to confirm data fidelity
- After Phase 6 (cleanup): full site smoke test — every page type loads correctly

---

## Supabase Project Details

- **Project URL:** https://epljkcqdfvmfngsdijci.supabase.co
- **Region:** East US (Ohio)
- **Plan:** Free (Nano) — upgrade to Pro ($25/mo) if database exceeds 500MB

---

## Out of Scope (Future Phases)

- Accountability Project 27M-row historical data import
- Independent Expenditures (script 23)
- Lobbyist compensation reports
- User accounts / saved searches
- Public API for external developers
- Live/automated scraping schedule
