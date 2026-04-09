create table if not exists principals (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  naics text,
  city text,
  state text,
  total_lobbyists integer default 0,
  num_active integer default 0,
  donation_total numeric(15,2) default 0,
  num_contributions integer default 0,
  industry text,
  extra jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists principal_lobbyists (
  id bigint generated always as identity primary key,
  principal_slug text not null,
  lobbyist_name text,
  lobbyist_slug text,
  firm text,
  branch text,
  is_active boolean default false,
  since text
);

create table if not exists principal_donation_matches (
  id bigint generated always as identity primary key,
  principal_slug text not null,
  contributor_name text,
  match_score numeric(5,2),
  total_donated numeric(15,2),
  num_contributions integer
);
