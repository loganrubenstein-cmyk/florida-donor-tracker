create table if not exists lobbyists (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  firm text,
  city text,
  state text,
  phone text,
  num_principals integer default 0,
  num_active integer default 0,
  total_donation_influence numeric(15,2) default 0,
  has_donation_match boolean default false,
  top_principal text,
  extra jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists lobbyist_principals (
  id bigint generated always as identity primary key,
  lobbyist_slug text not null,
  principal_name text,
  is_active boolean default false,
  branch text,
  firm text,
  since text,
  until text,
  donation_total numeric(15,2) default 0,
  num_contributions integer default 0
);
