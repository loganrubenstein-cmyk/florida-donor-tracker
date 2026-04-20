-- Migration 025: donor NAICS enrichment columns
-- Adds non-destructive NAICS columns to donor_entities (the base table)
-- and refreshes donors_mv + the donors view so the frontend can read them.

alter table donor_entities add column if not exists naics_code text;
alter table donor_entities add column if not exists naics_source text;
  -- 'lobbyist_registrations' | 'principals' | 'federal_contracts'
  -- | 'pac_pattern' | 'occupation_heuristic' | null
alter table donor_entities add column if not exists naics_confidence text;
  -- 'exact' | 'fuzzy' | 'pattern' | 'inferred' | null
alter table donor_entities add column if not exists naics_match_score numeric(5,2);

create index if not exists donor_entities_naics_code_idx on donor_entities(naics_code);
create index if not exists donor_entities_naics_source_idx on donor_entities(naics_source);

-- Rebuild donors_mv to surface new columns
drop materialized view if exists donors_mv cascade;

create materialized view donors_mv as
with base as (
  select c.donor_slug, c.recipient_type, c.amount,
         c.contributor_occupation, c.contributor_city_state_zip, c.recipient_acct
    from contributions c
   where c.donor_slug is not null
),
rollup as (
  select base.donor_slug,
         sum(base.amount) filter (where base.recipient_type = 'committee') as total_soft,
         sum(base.amount) filter (where base.recipient_type = 'candidate') as total_hard,
         sum(base.amount) as total_combined,
         count(*) as num_contributions,
         count(distinct base.recipient_acct) filter (where base.recipient_type = 'committee') as num_committees,
         count(distinct base.recipient_acct) filter (where base.recipient_type = 'candidate') as num_candidates,
         mode() within group (order by base.contributor_occupation)
           filter (where base.contributor_occupation is not null and base.contributor_occupation <> '') as top_occupation,
         mode() within group (order by base.contributor_city_state_zip)
           filter (where base.contributor_city_state_zip is not null and base.contributor_city_state_zip <> '') as top_location
    from base
   group by base.donor_slug
)
select e.canonical_slug as slug,
       e.canonical_name as name,
       coalesce(e.is_corporate, false) as is_corporate,
       coalesce(r.total_soft, 0::numeric) as total_soft,
       coalesce(r.total_hard, 0::numeric) as total_hard,
       coalesce(r.total_combined, 0::numeric) as total_combined,
       coalesce(r.num_contributions, 0::bigint) as num_contributions,
       r.top_occupation,
       r.top_location,
       coalesce(r.num_committees, 0::bigint) as num_committees,
       coalesce(r.num_candidates, 0::bigint) as num_candidates,
       (exists (select 1 from principals p where p.slug = e.canonical_slug)) as has_lobbyist_link,
       e.industry,
       e.corp_number,
       e.corp_ein,
       null::text as corp_status,
       null::numeric as corp_match_score,
       e.naics_code,
       e.naics_source,
       e.naics_confidence,
       e.naics_match_score,
       e.updated_at
  from donor_entities e
  left join rollup r on r.donor_slug = e.canonical_slug;

create unique index if not exists donors_mv_slug_idx on donors_mv(slug);
create index if not exists donors_mv_total_combined_idx on donors_mv(total_combined desc);
create index if not exists donors_mv_industry_idx on donors_mv(industry);
create index if not exists donors_mv_naics_source_idx on donors_mv(naics_source);

-- Recreate the public `donors` view (row_number id for UI)
create or replace view donors as
select row_number() over (order by slug) as id,
       slug, name, is_corporate,
       total_soft, total_hard, total_combined, num_contributions,
       top_occupation, top_location, num_committees, num_candidates,
       has_lobbyist_link, industry, corp_number, corp_ein,
       corp_status, corp_match_score,
       naics_code, naics_source, naics_confidence, naics_match_score,
       null::jsonb as extra,
       updated_at as created_at,
       updated_at
  from donors_mv;
