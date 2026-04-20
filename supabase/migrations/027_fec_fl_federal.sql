-- Migration 027: FEC data for Florida federal candidates
-- Scope: FL-only candidates (CAND_ST='FL'), their committees, linkages, and contributions.
-- Cycles: 2016, 2018, 2020, 2022, 2024, 2026

create table if not exists fec_candidates (
  cand_id text not null,
  cycle integer not null,
  name text not null,
  party text,
  election_year integer,
  office text,                -- H=House, S=Senate, P=President
  state text,                 -- CAND_ST
  district text,              -- CAND_OFFICE_DISTRICT
  ici text,                   -- I=incumbent, C=challenger, O=open
  status text,                -- CAND_STATUS
  principal_cmte_id text,
  street1 text, city text, st text, zip text,
  primary key (cand_id, cycle)
);
create index if not exists fec_candidates_state_idx on fec_candidates(state);
create index if not exists fec_candidates_name_idx on fec_candidates using gin (name gin_trgm_ops);

create table if not exists fec_committees (
  cmte_id text not null,
  cycle integer not null,
  name text not null,
  treasurer text,
  street1 text, city text, state text, zip text,
  designation text,           -- A=Authorized, P=Principal, etc.
  cmte_type text,             -- H=House, S=Senate, P=Presidential, Q=PAC-qualified, ...
  party text,
  filing_freq text,
  org_type text,
  connected_org text,
  cand_id text,               -- linked candidate (if committee is a candidate cmte)
  primary key (cmte_id, cycle)
);
create index if not exists fec_committees_cand_idx on fec_committees(cand_id);
create index if not exists fec_committees_name_idx on fec_committees using gin (name gin_trgm_ops);

create table if not exists fec_candidate_committees (
  cand_id text not null,
  cmte_id text not null,
  cycle integer not null,
  designation text,
  cmte_type text,
  cmte_party text,
  election_year integer,
  primary key (cand_id, cmte_id, cycle)
);

create table if not exists fec_pas2 (
  -- committee -> candidate contributions (PAC/party giving to candidates)
  id bigserial primary key,
  cycle integer not null,
  cmte_id text not null,          -- donor committee
  amndt_ind text,
  rpt_tp text,
  transaction_pgi text,
  image_num text,
  transaction_tp text,
  entity_tp text,
  donor_name text,
  donor_city text,
  donor_state text,
  donor_zip text,
  donor_employer text,
  donor_occupation text,
  transaction_dt date,
  transaction_amt numeric(12,2),
  other_id text,
  cand_id text,                   -- recipient candidate (FL-filtered)
  tran_id text,
  file_num text,
  memo_cd text,
  memo_text text,
  sub_id bigint
);
create index if not exists fec_pas2_cand_idx on fec_pas2(cand_id, cycle);
create index if not exists fec_pas2_cmte_idx on fec_pas2(cmte_id, cycle);

create table if not exists fec_individual_contribs (
  id bigserial primary key,
  cycle integer not null,
  cmte_id text not null,          -- recipient committee (FL-candidate committee)
  amndt_ind text,
  rpt_tp text,
  transaction_pgi text,
  image_num text,
  transaction_tp text,
  entity_tp text,
  donor_name text,
  donor_city text,
  donor_state text,
  donor_zip text,
  donor_employer text,
  donor_occupation text,
  transaction_dt date,
  transaction_amt numeric(12,2),
  other_id text,
  tran_id text,
  file_num text,
  memo_cd text,
  memo_text text,
  sub_id bigint
);
create index if not exists fec_indiv_cmte_idx on fec_individual_contribs(cmte_id, cycle);
create index if not exists fec_indiv_name_idx on fec_individual_contribs using gin (donor_name gin_trgm_ops);
create index if not exists fec_indiv_state_idx on fec_individual_contribs(donor_state);
