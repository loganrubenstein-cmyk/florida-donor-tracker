-- 024_vendor_canonical_model.sql
-- Canonical vendor entity model. Mirrors donor_entities/donor_aliases
-- (migration 015) in structure, adapted for vendor-name canonicalization.
--
-- Read path: expenditures.vendor_canonical_slug + candidate_expenditures.vendor_canonical_slug
-- join to vendor_entities.canonical_slug. Raw vendor_name is preserved.

create extension if not exists pg_trgm;


-- ── vendor_entities: one row per canonical vendor ──────────────────────────
create table if not exists vendor_entities (
  canonical_slug  text primary key,
  canonical_name  text not null,
  is_government   boolean default false,
  is_franchise    boolean default false,
  corp_ein        text,
  corp_number     text,
  notes           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_vendor_entities_name_trgm
  on vendor_entities using gin (canonical_name gin_trgm_ops);


-- ── vendor_aliases: every observed vendor_name variant ─────────────────────
create table if not exists vendor_aliases (
  alias_text              text primary key,                -- normalized form
  alias_text_display      text,                            -- pretty-cased original
  canonical_slug          text not null references vendor_entities(canonical_slug) on update cascade,
  source                  text not null check (source in (
    'self',                 -- alias IS the canonical (identity row)
    'dedup_pipeline',       -- auto: exact/compact/fuzzy match
    'manual_merge',         -- hand-curated YAML seed
    'corp_match'            -- EIN / Sunbiz number match (future)
  )),
  match_score             numeric(5,2),
  review_status           text default 'auto' check (review_status in ('auto','pending_review','approved','rejected')),
  verified_by             text,
  verified_at             timestamptz,
  created_at              timestamptz default now()
);

create index if not exists idx_vendor_aliases_canonical on vendor_aliases(canonical_slug);
create index if not exists idx_vendor_aliases_source on vendor_aliases(source);


-- ── FK columns on expenditure tables (non-destructive; raw vendor_name preserved) ──
alter table expenditures
  add column if not exists vendor_canonical_slug text;

alter table candidate_expenditures
  add column if not exists vendor_canonical_slug text;

create index if not exists expenditures_vendor_canonical_idx
  on expenditures(vendor_canonical_slug);

create index if not exists cand_exp_vendor_canonical_idx
  on candidate_expenditures(vendor_canonical_slug);


-- ── vendor_merge_log: audit trail ──────────────────────────────────────────
create table if not exists vendor_merge_log (
  id              bigint generated always as identity primary key,
  action          text not null check (action in ('create_entity','merge','split','reassign_alias','note')),
  from_slug       text,
  to_slug         text,
  alias_text      text,
  rows_affected   bigint,
  actor           text default 'pipeline',
  rationale       text,
  metadata        jsonb,
  created_at      timestamptz default now()
);

create index if not exists idx_vendor_merge_log_to on vendor_merge_log(to_slug);
create index if not exists idx_vendor_merge_log_created on vendor_merge_log(created_at desc);
