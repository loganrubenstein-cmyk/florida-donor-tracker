create table if not exists industry_buckets (
  id bigint generated always as identity primary key,
  industry text not null unique,
  total numeric(15,2) default 0,
  count integer default 0,
  pct numeric(6,3) default 0,
  updated_at timestamptz default now()
);

create table if not exists industry_by_committee (
  id bigint generated always as identity primary key,
  acct_num text not null,
  industry text not null,
  total numeric(15,2) default 0
);

create table if not exists industry_trends (
  id bigint generated always as identity primary key,
  year integer not null,
  industry text not null,
  total numeric(15,2) default 0
);
