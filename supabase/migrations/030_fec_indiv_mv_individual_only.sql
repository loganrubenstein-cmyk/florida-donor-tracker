-- Migration 030: restrict fec_indiv_donor_totals_mv to genuine individual contributions.
-- Prior MV (migration 029) included entity_tp='ORG'/'PAC'/'COM' and transaction_tp='24T'
-- (committee-to-committee transfers), which surfaced PAC names like
-- "EMPOWER PARENTS PAC" and "SECURING AMERICAN GREATNESS" at the top of the
-- /federal/donors page.
--
-- Keep: entity_tp='IND' AND transaction_tp in ('15','15E','15I','10','15T','15Z')
-- Drop: 22Y (individual refund) and 24T (committee transfer). Refunds net out
-- totals in confusing ways on a per-donor page; drop them from the rollup.

drop materialized view if exists fec_indiv_donor_totals_mv;

create materialized view fec_indiv_donor_totals_mv as
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
where name is not null
  and name <> ''
  and entity_tp = 'IND'
  and transaction_tp in ('15','15E','15I','10','15T','15Z')
group by lower(trim(name));

create unique index fec_indiv_donor_totals_mv_key
  on fec_indiv_donor_totals_mv(donor_key);
create index fec_indiv_donor_totals_mv_total_idx
  on fec_indiv_donor_totals_mv(total_amount desc);
