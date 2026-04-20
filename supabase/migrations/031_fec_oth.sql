-- Migration 031: FEC committee-to-committee transfers (oth).
-- Source: FEC bulk itoth.txt (pipe-delimited, 21 fields, same layout as pas2).
-- Filter at load time: keep rows where cmte_id OR other_id corresponds to a
-- FL-related committee (state=FL in cm.txt, or linked to a FL candidate).

create table if not exists fec_oth (
  sub_id text primary key,
  cmte_id text not null,
  cycle integer not null,
  amndt_ind text,
  rpt_tp text,
  transaction_pgi text,
  image_num text,
  transaction_tp text,
  entity_tp text,
  name text,
  city text,
  state text,
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

create index if not exists fec_oth_cmte_idx       on fec_oth(cmte_id, cycle);
create index if not exists fec_oth_other_idx      on fec_oth(other_id, cycle);
create index if not exists fec_oth_cycle_idx      on fec_oth(cycle);
create index if not exists fec_oth_amt_idx        on fec_oth(transaction_amt desc);

-- Rollup: how much has each FL committee received from others, and from whom.
create materialized view if not exists fec_oth_recipient_totals_mv as
select
  o.cmte_id                              as recipient_cmte_id,
  max(cm.name)                           as recipient_name,
  o.cycle,
  count(*)                               as num_transfers,
  sum(o.transaction_amt)                 as total_amount
from fec_oth o
left join fec_committees cm on cm.cmte_id = o.cmte_id and cm.cycle = o.cycle
group by o.cmte_id, o.cycle;

create unique index if not exists fec_oth_recipient_totals_mv_key
  on fec_oth_recipient_totals_mv(recipient_cmte_id, cycle);
create index        if not exists fec_oth_recipient_totals_mv_total_idx
  on fec_oth_recipient_totals_mv(total_amount desc);
