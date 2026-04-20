-- Migration 026: IRS Exempt Organizations Business Master File (EO BMF)
-- Source: https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract
-- Feeds scripts/21b_enrich_donor_naics.py as a 4th NAICS source for non-profit donors
-- (TIDES, SIXTEEN THIRTY FUND, NEW VENTURE FUND, etc.)

create table if not exists irs_exempt_orgs (
  ein text primary key,
  name text not null,
  name_normalized text,
  state text,
  city text,
  zip text,
  subsection text,        -- 501(c)(x) subsection: '03' = charitable, '04' = social welfare, etc.
  classification text,
  ntee_code text,         -- 3-char NTEE code (A01, W30, etc.)
  asset_amt bigint,
  income_amt bigint,
  ruling_date date,
  updated_at timestamptz default now()
);

create index if not exists irs_exempt_orgs_name_norm_idx on irs_exempt_orgs(name_normalized);
create index if not exists irs_exempt_orgs_name_trgm_idx on irs_exempt_orgs using gin (name_normalized gin_trgm_ops);
create index if not exists irs_exempt_orgs_state_idx on irs_exempt_orgs(state);
create index if not exists irs_exempt_orgs_ntee_idx on irs_exempt_orgs(ntee_code);
