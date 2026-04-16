-- 017_committees_name_history.sql
-- Adds name-history, status, and successor tracking to the committees table.
-- Closes the "Friends of Ron DeSantis → Empower Parents PAC" class of bug
-- where a committee renames/closes and becomes effectively invisible.
--
-- former_names is an ordered JSONB array of:
--   { "name": "Friends of Ron DeSantis", "effective_date": "2022-11-08",
--     "source_url": "https://dos.elections.myflorida.com/committees/…&account=70275" }
--
-- status reflects the FL DoE registry state; 'closed' indicates the PAC
-- dissolved but kept its account_num (like 70275). 'terminated' is DoE-
-- enforced closure. 'revoked' is fraud/non-compliance closure.
--
-- successor_acct_num — when a dissolved PAC's money and/or operation moves
-- to a new committee, that new acct_num goes here. UI will render a "→
-- Successor:" breadcrumb.

alter table committees
  add column if not exists former_names       jsonb  default '[]'::jsonb,
  add column if not exists status             text
    check (status in ('active','closed','terminated','revoked','merged','unknown')),
  add column if not exists successor_acct_num text,
  add column if not exists closed_date        date,
  add column if not exists source_url         text;

-- Indexes to support "find by former name" and "children of a successor".
create index if not exists idx_committees_status
  on committees(status) where status is not null and status <> 'active';
create index if not exists idx_committees_successor
  on committees(successor_acct_num) where successor_acct_num is not null;

-- GIN index over former_names JSONB to support containment queries
-- (used by the search resolver to match old names to current acct_num).
create index if not exists idx_committees_former_names_gin
  on committees using gin (former_names jsonb_path_ops);


-- ── Convenience view: committees with their prior names flattened ───────────
-- Powers `/search?q=Friends+of+Ron+DeSantis` → resolves to 70275.
create or replace view committee_name_history as
select
  c.acct_num,
  c.committee_name                                              as current_name,
  (n->>'name')::text                                            as former_name,
  (n->>'effective_date')::date                                  as effective_date,
  (n->>'source_url')::text                                      as source_url
from committees c,
     lateral jsonb_array_elements(coalesce(c.former_names, '[]'::jsonb)) as n
where jsonb_typeof(c.former_names) = 'array'
  and jsonb_array_length(c.former_names) > 0;

create index if not exists idx_committee_hist_former_name_trgm
  on committees using gin ((committee_name) gin_trgm_ops);


-- ── Seed: committee 70275 name history ──────────────────────────────────────
-- Applied as data so the pipeline doesn't have to special-case this PAC any
-- longer. The new 02 + 02b unification (see Phase 1.5) will populate future
-- name-history automatically by diffing successive registry pulls.
update committees
set
  former_names = jsonb_build_array(
    jsonb_build_object(
      'name',           'Friends of Ron DeSantis',
      'effective_date', '2022-11-09',
      'source_url',     'https://dos.elections.myflorida.com/campaign-finance/contributions/?account=70275'
    )
  ),
  status      = coalesce(status, 'closed'),
  source_url  = coalesce(source_url, 'https://dos.elections.myflorida.com/campaign-finance/contributions/?account=70275')
where acct_num = '70275';
