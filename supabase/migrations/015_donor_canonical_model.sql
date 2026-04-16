-- 015_donor_canonical_model.sql
-- Canonical donor entity model. Replaces the opaque dedup pipeline with a
-- first-class alias layer that is auditable, versioned, and deterministic.
--
-- Read path remains `donors` (currently a plain table). Phase 1.4 (migration
-- 016) converts `donors` into a materialized view rebuilt from contributions
-- JOINed against donor_aliases, making `donors` a derived rollup and
-- contributions the single source of truth.

create extension if not exists pg_trgm;

-- ── donor_entities: one row per real-world donor (canonical) ────────────────
create table if not exists donor_entities (
  canonical_slug  text primary key,
  canonical_name  text not null,
  is_corporate    boolean default false,
  corp_ein        text,
  corp_number     text,
  industry        text,
  notes           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_donor_entities_ein
  on donor_entities(corp_ein) where corp_ein is not null;
create index if not exists idx_donor_entities_name_trgm
  on donor_entities using gin (canonical_name gin_trgm_ops);


-- ── donor_aliases: every contributor-name variant ───────────────────────────
-- Every contribution row's contributor_name_normalized joins to this table
-- to resolve the canonical_slug.
create table if not exists donor_aliases (
  alias_text              text primary key,           -- normalized form, uppercase
  alias_text_display      text,                       -- pretty-cased original
  canonical_slug          text not null references donor_entities(canonical_slug) on update cascade,
  source                  text not null check (source in (
    'dedup_pipeline',       -- auto: fuzzy match
    'manual_merge',         -- hand-curated YAML
    'corp_match',           -- EIN / Sunbiz number match
    'lobbyist_match',       -- principal table match
    'self'                  -- alias IS the canonical (identity row)
  )),
  match_score             numeric(5,2),               -- 0-100 for fuzzy; null for exact/manual
  review_status           text default 'auto' check (review_status in ('auto','pending_review','approved','rejected')),
  verified_by             text,
  verified_at             timestamptz,
  created_at              timestamptz default now()
);

create index if not exists idx_donor_aliases_canonical on donor_aliases(canonical_slug);
create index if not exists idx_donor_aliases_source on donor_aliases(source);
create index if not exists idx_donor_aliases_review on donor_aliases(review_status)
  where review_status <> 'auto';


-- ── donor_merge_log: append-only audit trail ────────────────────────────────
-- Every split/merge/reassignment decision is recorded here forever.
create table if not exists donor_merge_log (
  id              bigint generated always as identity primary key,
  action          text not null check (action in ('create_entity','merge','split','reassign_alias','delete_alias','note')),
  from_slug       text,                    -- slug absorbed (for merge) or previously-canonical (for split)
  to_slug         text,                    -- new canonical slug
  alias_text      text,                    -- affected alias, when relevant
  rows_affected   bigint,                  -- count of contributions moved
  actor           text default 'pipeline', -- 'pipeline', 'manual:<user>', 'corp_match', etc.
  rationale       text,
  metadata        jsonb,
  created_at      timestamptz default now()
);

create index if not exists idx_merge_log_from on donor_merge_log(from_slug);
create index if not exists idx_merge_log_to on donor_merge_log(to_slug);
create index if not exists idx_merge_log_created on donor_merge_log(created_at desc);


-- ── donor_review_queue: ambiguous dedup decisions pending human review ──────
-- Written by the rewritten script 09 when score is in the gray zone
-- (0.85 <= score < threshold). Cleared when an operator resolves.
create table if not exists donor_review_queue (
  id              bigint generated always as identity primary key,
  candidate_slug  text not null,           -- the alias being reviewed
  candidate_name  text not null,
  proposed_canonical_slug text not null,
  proposed_canonical_name text not null,
  match_score     numeric(5,2),
  method          text,                    -- which rule produced the suggestion
  total_amount    numeric(15,2),           -- dollars this alias would move if accepted
  resolved        boolean default false,
  resolution      text,                    -- 'accept' | 'reject' | 'create_new_entity'
  resolved_by     text,
  resolved_at     timestamptz,
  created_at      timestamptz default now()
);

create index if not exists idx_review_queue_open on donor_review_queue(resolved) where resolved = false;


-- ── Backfill: seed donor_entities from the existing donors table ────────────
-- Every existing donor slug becomes a canonical entity. This is idempotent so
-- we can re-run without duplicates.
insert into donor_entities (canonical_slug, canonical_name, is_corporate, industry)
select slug, name, coalesce(is_corporate, false), industry
from donors
on conflict (canonical_slug) do nothing;

-- Normalization function: uppercase, replace non-alphanumeric with space, collapse,
-- trim. This is the canonical form used by every dedup + join path. Kept in SQL
-- so the frontend can call donor_normalize() in search queries without drifting
-- from Python's scripts/09*.py normalization.
create or replace function donor_normalize(s text)
returns text language sql immutable as $$
  select trim(
    regexp_replace(
      regexp_replace(upper(coalesce(s,'')), '[^A-Z0-9 ]', ' ', 'g'),
      '\s+', ' ', 'g'
    )
  )
$$;

-- Seed identity aliases (every canonical is trivially its own alias).
insert into donor_aliases (alias_text, alias_text_display, canonical_slug, source, match_score)
select
  donor_normalize(name),
  name,
  slug,
  'self',
  100.00
from donors
where donor_normalize(name) <> ''
on conflict (alias_text) do nothing;
