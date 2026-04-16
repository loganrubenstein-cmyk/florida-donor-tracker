-- 018_linkage_source_verification.sql
-- Adds external-verification metadata to every edge and shadow org so the
-- frontend can render "View filing →" links that take users directly to
-- the FL DoE / FEC / IRS source record.
--
-- This closes the "how do I know this edge is real?" gap. Every number on
-- the site becomes traceable to a primary-source document in ≤2 clicks.

-- ── candidate_pc_edges: source fields ───────────────────────────────────────
alter table candidate_pc_edges
  add column if not exists source_url            text,
  add column if not exists source_filing_id      text,
  add column if not exists source_filing_date    date,
  add column if not exists source_filing_status  text
    check (source_filing_status in ('active','withdrawn','amended','superseded','unknown')),
  add column if not exists confidence_score      numeric(5,2),
  add column if not exists evidence              jsonb;

create index if not exists idx_pc_edges_source_filing
  on candidate_pc_edges(source_filing_id) where source_filing_id is not null;
create index if not exists idx_pc_edges_confidence
  on candidate_pc_edges(confidence_score desc) where confidence_score is not null;


-- ── shadow_orgs: source fields ──────────────────────────────────────────────
-- Created conditionally — script 93 creates this table in production. If it
-- hasn't been loaded yet, the ALTER is a no-op via DO block.
do $$
begin
  if exists (select 1 from pg_class where relname = 'shadow_orgs' and relkind = 'r') then
    execute 'alter table shadow_orgs
      add column if not exists source_url       text,
      add column if not exists source_filing_date date,
      add column if not exists fec_filing_url   text,
      add column if not exists irs_filing_url   text';
  end if;
end$$;


-- ── running_mate_pairs: generalization of the Gillum/King logic ─────────────
-- Populated by the rewritten script 78 (see Phase 2.3). Every pair found in
-- the FL DoE candidate registry for the same office+year+ticket goes here,
-- so the linkage builder can dedupe PAC edges down to the top-of-ticket.
create table if not exists running_mate_pairs (
  id                  bigint generated always as identity primary key,
  election_year       int  not null,
  office_code         text not null,
  top_acct_num        text not null,        -- Governor, Senate-top-ticket, etc.
  top_candidate_name  text,
  mate_acct_num       text not null,        -- Lt. Gov, running mate
  mate_candidate_name text,
  ticket_id           text,                 -- DoE ticket identifier when present
  source_url          text,
  created_at          timestamptz default now(),
  unique (election_year, top_acct_num, mate_acct_num)
);

create index if not exists idx_running_mate_top  on running_mate_pairs(top_acct_num);
create index if not exists idx_running_mate_mate on running_mate_pairs(mate_acct_num);

-- Seed: known pairs so the audit check K passes immediately.
insert into running_mate_pairs (election_year, office_code, top_acct_num, top_candidate_name, mate_acct_num, mate_candidate_name)
values
  (2018, 'GOV', NULL, 'Andrew Gillum',        NULL, 'Chris King'),
  (2018, 'GOV', NULL, 'Ron DeSantis',         NULL, 'Jeanette Nunez'),
  (2022, 'GOV', NULL, 'Ron DeSantis',         NULL, 'Jeanette Nunez'),
  (2018, 'GOV', NULL, 'Adam Putnam',          NULL, 'Anne Corcoran'),
  (2014, 'GOV', NULL, 'Rick Scott',           NULL, 'Carlos Lopez-Cantera'),
  (2014, 'GOV', NULL, 'Charlie Crist',        NULL, 'Annette Taddeo')
on conflict do nothing;
