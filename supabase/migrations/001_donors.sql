create table if not exists donors (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  is_corporate boolean default false,
  total_soft numeric(15,2) default 0,
  total_hard numeric(15,2) default 0,
  total_combined numeric(15,2) default 0,
  num_contributions integer default 0,
  top_occupation text,
  top_location text,
  num_committees integer default 0,
  num_candidates integer default 0,
  has_lobbyist_link boolean default false,
  industry text,
  extra jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists donor_committees (
  id bigint generated always as identity primary key,
  donor_slug text not null,
  acct_num text not null,
  committee_name text,
  total numeric(15,2),
  num_contributions integer
);

create table if not exists donor_candidates (
  id bigint generated always as identity primary key,
  donor_slug text not null,
  acct_num text not null,
  candidate_name text,
  total numeric(15,2),
  num_contributions integer
);

create table if not exists donor_by_year (
  id bigint generated always as identity primary key,
  donor_slug text not null,
  year integer not null,
  soft numeric(15,2) default 0,
  hard numeric(15,2) default 0,
  total numeric(15,2) default 0
);
