-- Migration 029: FEC individual contributions (FL donors only)
-- Source: FEC bulk itcont.txt (pipe-delimited).
-- Filter: STATE = 'FL' at load time (script 105) so the table is bounded.
-- Cycles: 2016, 2018, 2020, 2022, 2024, 2026 (controlled by loader).

create extension if not exists pg_trgm;

create table if not exists fec_indiv (
  sub_id text primary key,              -- FEC-unique submission id
  cmte_id text not null,
  cycle integer not null,
  amndt_ind text,                       -- N=new, A=amend, T=terminated
  rpt_tp text,                          -- report type (Q1, M3, etc.)
  transaction_pgi text,                 -- primary/general indicator
  image_num text,
  transaction_tp text,                  -- transaction type code
  entity_tp text,                       -- IND, ORG, PAC, ...
  name text,
  city text,
  state text,                           -- always FL for this table
  zip text,
  employer text,
  occupation text,
  transaction_dt date,
  transaction_amt numeric(14,2),
  other_id text,
  tran_id text,
  file_num text,
  memo_cd text,
  memo_text text
);

create index if not exists fec_indiv_cmte_idx       on fec_indiv(cmte_id, cycle);
create index if not exists fec_indiv_cycle_idx      on fec_indiv(cycle);
create index if not exists fec_indiv_amt_idx        on fec_indiv(transaction_amt desc);
create index if not exists fec_indiv_name_trgm_idx  on fec_indiv using gin (name gin_trgm_ops);
create index if not exists fec_indiv_employer_idx   on fec_indiv using gin (employer gin_trgm_ops);

-- Rolled-up view: per-donor totals across cycles (FL only by construction).
create materialized view if not exists fec_indiv_donor_totals_mv as
select
  lower(trim(name))                         as donor_key,
  max(name)                                 as name,
  max(city)                                 as top_city,
  max(employer)                             as top_employer,
  count(*)                                  as num_contributions,
  sum(transaction_amt)                      as total_amount,
  min(transaction_dt)                       as first_dt,
  max(transaction_dt)                       as last_dt,
  array_agg(distinct cycle order by cycle)  as cycles
from fec_indiv
where name is not null and name <> ''
group by lower(trim(name));

create unique index if not exists fec_indiv_donor_totals_mv_key on fec_indiv_donor_totals_mv(donor_key);
create index        if not exists fec_indiv_donor_totals_mv_total_idx on fec_indiv_donor_totals_mv(total_amount desc);
