create table if not exists candidates (
  id bigint generated always as identity primary key,
  acct_num text not null unique,
  candidate_name text,
  election_id text,
  election_year integer,
  office_code text,
  office_desc text,
  party_code text,
  district text,
  status_desc text,
  hard_money_total numeric(15,2) default 0,
  hard_corporate_total numeric(15,2) default 0,
  hard_individual_total numeric(15,2) default 0,
  hard_num_contributions integer default 0,
  soft_money_total numeric(15,2) default 0,
  total_combined numeric(15,2) default 0,
  num_linked_pcs integer default 0,
  extra jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists candidate_quarterly (
  id bigint generated always as identity primary key,
  acct_num text not null,
  quarter text not null,
  amount numeric(15,2) default 0
);

create table if not exists candidate_top_donors (
  id bigint generated always as identity primary key,
  acct_num text not null,
  donor_name text,
  donor_slug text,
  total_amount numeric(15,2),
  num_contributions integer,
  type text,
  occupation text
);

-- Added by script 60 (2026-04-09): candidate expenditure tables
create table if not exists candidate_expenditure_summary (
  id               bigint generated always as identity primary key,
  acct_num         text not null unique,
  total_spent      numeric(15,2) default 0,
  num_expenditures integer default 0,
  date_start       date,
  date_end         date
);

create table if not exists candidate_top_vendors (
  id                     bigint generated always as identity primary key,
  acct_num               text not null,
  vendor_name            text,
  vendor_name_normalized text,
  total_amount           numeric(15,2),
  num_payments           integer,
  pct                    numeric(6,2)
);
