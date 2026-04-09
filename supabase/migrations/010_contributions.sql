-- 010_contributions.sql
-- Row-level contributions table for the transaction explorer.
-- Single table holds both committee-side and candidate-side contributions,
-- discriminated by `recipient_type`.

create extension if not exists pg_trgm;

create table if not exists contributions (
  id bigint generated always as identity primary key,

  -- Who received it
  recipient_type text not null check (recipient_type in ('committee','candidate')),
  recipient_acct text not null,

  -- Who gave it
  contributor_name text,
  contributor_name_normalized text,
  donor_slug text,                       -- joins to donors.slug when matched

  -- What / when / how much
  amount numeric(15,2),
  contribution_date date,
  report_year integer,
  report_type text,
  type_code text,
  in_kind_description text,

  -- Contributor metadata
  contributor_address text,
  contributor_city_state_zip text,
  contributor_occupation text,

  -- Provenance
  source_file text,
  loaded_at timestamptz default now()
);

-- Primary access patterns: by recipient, by donor, by date, by year, by amount
create index if not exists contributions_recipient_idx
  on contributions (recipient_type, recipient_acct);

create index if not exists contributions_donor_slug_idx
  on contributions (donor_slug)
  where donor_slug is not null;

create index if not exists contributions_date_idx
  on contributions (contribution_date);

create index if not exists contributions_report_year_idx
  on contributions (report_year);

create index if not exists contributions_amount_idx
  on contributions (amount);

-- Trigram index for fast ILIKE search on contributor names
create index if not exists contributions_name_trgm_idx
  on contributions using gin (contributor_name_normalized gin_trgm_ops);

-- Manifest table so the loader can resume after interruption
create table if not exists contributions_load_manifest (
  id bigint generated always as identity primary key,
  source_file text not null unique,
  recipient_type text not null,
  rows_loaded bigint default 0,
  status text default 'complete',        -- 'complete' | 'partial' | 'error'
  error text,
  loaded_at timestamptz default now()
);
