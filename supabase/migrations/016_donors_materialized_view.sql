-- 016_donors_materialized_view.sql
-- Converts `donors` / `donor_committees` / `donor_candidates` / `donor_by_year`
-- into derived views rebuilt from contributions + donor_entities. Eliminates
-- the drift class (Florida Realtors $136M, FPL $330M/$30M split) at its
-- source: there is no writable totals field anymore; every number is a SUM()
-- over contributions.
--
-- Dependencies:
--   - 010_contributions.sql (contributions.donor_slug)
--   - 015_donor_canonical_model.sql (donor_entities, donor_aliases)
--
-- Cutover plan:
--   1. Apply this migration. Old tables are renamed to `_legacy`; any script
--      that still writes to `donors`/`donor_committees`/etc. will error on
--      insert (view not updatable) — that failure tells us which loader needs
--      updating next.
--   2. Rewritten loaders (scripts 09, 41, 42 — see Phase 1.3) populate only
--      `contributions` + `donor_aliases`; aggregates auto-derive.
--   3. Script 85 becomes `REFRESH MATERIALIZED VIEW CONCURRENTLY donors_mv`
--      with hard validation (see scripts/85_reconcile_donor_aggregates.py).
--   4. After two consecutive clean reconciles, drop the `_legacy` tables.
--
-- Rollback: `begin; drop view donors cascade; alter table donors_legacy
--            rename to donors; alter table donor_committees_legacy rename to
--            donor_committees; …; commit;`

-- Step 1: retire old tables under _legacy names (keep data for cutover period).
alter table if exists donors                 rename to donors_legacy;
alter table if exists donor_committees       rename to donor_committees_legacy;
alter table if exists donor_candidates       rename to donor_candidates_legacy;
alter table if exists donor_by_year          rename to donor_by_year_legacy;

-- Step 2: materialized view — the only place aggregates live.
create materialized view if not exists donors_mv as
with base as (
  select
    c.donor_slug,
    c.recipient_type,
    c.amount,
    c.contributor_occupation,
    c.contributor_city_state_zip,
    c.recipient_acct
  from contributions c
  where c.donor_slug is not null
),
rollup as (
  select
    donor_slug,
    sum(amount) filter (where recipient_type = 'committee')  as total_soft,
    sum(amount) filter (where recipient_type = 'candidate')  as total_hard,
    sum(amount)                                              as total_combined,
    count(*)                                                 as num_contributions,
    count(distinct recipient_acct) filter (where recipient_type = 'committee') as num_committees,
    count(distinct recipient_acct) filter (where recipient_type = 'candidate') as num_candidates,
    mode() within group (order by contributor_occupation)
      filter (where contributor_occupation is not null and contributor_occupation <> '') as top_occupation,
    mode() within group (order by contributor_city_state_zip)
      filter (where contributor_city_state_zip is not null and contributor_city_state_zip <> '') as top_location
  from base
  group by donor_slug
)
select
  e.canonical_slug                 as slug,
  e.canonical_name                 as name,
  coalesce(e.is_corporate, false)  as is_corporate,
  coalesce(r.total_soft, 0)        as total_soft,
  coalesce(r.total_hard, 0)        as total_hard,
  coalesce(r.total_combined, 0)    as total_combined,
  coalesce(r.num_contributions, 0) as num_contributions,
  r.top_occupation,
  r.top_location,
  coalesce(r.num_committees, 0)    as num_committees,
  coalesce(r.num_candidates, 0)    as num_candidates,
  exists (
    select 1 from principals p where p.slug = e.canonical_slug
  )                                as has_lobbyist_link,
  e.industry                       as industry,
  e.corp_number                    as corp_number,
  e.corp_ein                       as corp_ein,
  null::text                       as corp_status,
  null::numeric                    as corp_match_score,
  e.updated_at                     as updated_at
from donor_entities e
left join rollup r on r.donor_slug = e.canonical_slug;

-- Unique index is required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
create unique index if not exists donors_mv_slug_idx          on donors_mv(slug);
create index        if not exists donors_mv_total_combined_idx on donors_mv(total_combined desc);
create index        if not exists donors_mv_total_hard_idx     on donors_mv(total_hard desc);
create index        if not exists donors_mv_total_soft_idx     on donors_mv(total_soft desc);
create index        if not exists donors_mv_name_trgm_idx      on donors_mv using gin (name gin_trgm_ops);
create index        if not exists donors_mv_has_lobbyist_idx   on donors_mv(has_lobbyist_link) where has_lobbyist_link = true;

-- Step 3: drop any lingering views that share the names we need.
drop view if exists donors                cascade;
drop view if exists donor_committees      cascade;
drop view if exists donor_candidates      cascade;
drop view if exists donor_by_year         cascade;

-- Step 4: compatibility views at the old table names.
create view donors as
select
  row_number() over (order by slug) as id,
  slug,
  name,
  is_corporate,
  total_soft,
  total_hard,
  total_combined,
  num_contributions,
  top_occupation,
  top_location,
  num_committees,
  num_candidates,
  has_lobbyist_link,
  industry,
  corp_number,
  corp_ein,
  corp_status,
  corp_match_score,
  null::jsonb  as extra,
  updated_at   as created_at,
  updated_at
from donors_mv;

create view donor_committees as
select
  c.donor_slug                as donor_slug,
  c.recipient_acct            as acct_num,
  max(cm.committee_name)      as committee_name,
  sum(c.amount)               as total,
  count(*)                    as num_contributions
from contributions c
left join committees cm on cm.acct_num = c.recipient_acct
where c.donor_slug is not null
  and c.recipient_type = 'committee'
group by c.donor_slug, c.recipient_acct;

create view donor_candidates as
select
  c.donor_slug                as donor_slug,
  c.recipient_acct            as acct_num,
  max(cand.candidate_name)    as candidate_name,
  sum(c.amount)               as total,
  count(*)                    as num_contributions
from contributions c
left join candidates cand on cand.acct_num = c.recipient_acct
where c.donor_slug is not null
  and c.recipient_type = 'candidate'
group by c.donor_slug, c.recipient_acct;

create view donor_by_year as
select
  c.donor_slug,
  extract(year from c.contribution_date)::int as year,
  sum(c.amount) filter (where c.recipient_type = 'committee') as soft,
  sum(c.amount) filter (where c.recipient_type = 'candidate') as hard,
  sum(c.amount)                                                as total
from contributions c
where c.donor_slug is not null
  and c.contribution_date is not null
group by c.donor_slug, year;

-- Step 5: initial population. Safe to re-run; data refreshes atomically.
refresh materialized view donors_mv;
