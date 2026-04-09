create table if not exists entity_connections (
  id bigint generated always as identity primary key,
  entity_a text not null,
  entity_b text not null,
  connection_score integer default 0,
  shared_treasurer boolean default false,
  shared_address boolean default false,
  shared_phone boolean default false,
  shared_chair boolean default false,
  donor_overlap_pct numeric(6,3) default 0,
  money_between numeric(15,2) default 0
);

create table if not exists candidate_pc_links (
  id bigint generated always as identity primary key,
  candidate_acct_num text not null,
  pc_acct_num text not null,
  pc_name text,
  pc_type text,
  link_type text,
  confidence numeric(4,2)
);

create table if not exists cycle_donors (
  id bigint generated always as identity primary key,
  year integer not null,
  name text,
  slug text,
  total numeric(15,2) default 0,
  num_contributions integer default 0,
  is_corporate boolean default false
);
