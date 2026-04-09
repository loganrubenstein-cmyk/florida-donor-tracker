create table if not exists committees (
  id bigint generated always as identity primary key,
  acct_num text not null unique,
  committee_name text,
  total_received numeric(15,2) default 0,
  num_contributions integer default 0,
  extra jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists committee_top_donors (
  id bigint generated always as identity primary key,
  acct_num text not null,
  donor_name text,
  donor_slug text,
  total_amount numeric(15,2),
  num_contributions integer,
  type text
);
