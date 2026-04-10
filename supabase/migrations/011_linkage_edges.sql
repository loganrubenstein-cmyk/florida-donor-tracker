-- 011_linkage_edges.sql
-- Evidence-based candidate → committee linkage with per-row provenance.
-- Replaces the simple candidate_pc_links table (kept for backward compat until validated).

-- ── candidate_pc_edges: one row per evidence edge ────────────────────────────

create table if not exists candidate_pc_edges (
  id bigint generated always as identity primary key,
  candidate_acct_num text not null,
  pc_acct_num text,                    -- nullable for stubs (dissolved/unmatched)
  pc_name text,
  pc_type text,                        -- CCE, ECO, CPO, PCO, PAC, etc.
  edge_type text not null,             -- SOLICITATION_CONTROL, STATEMENT_OF_ORG_SUPPORT,
                                       -- DIRECT_CONTRIBUTION_TO_CANDIDATE,
                                       -- OTHER_DISTRIBUTION_TO_CANDIDATE,
                                       -- IEC_FOR_OR_AGAINST, ECC_FOR_OR_AGAINST,
                                       -- ADMIN_OVERLAP_ONLY
  direction text,                      -- 'support' | 'opposition' | null
  evidence_summary text,               -- human-readable tooltip text
  source_type text,                    -- solicitation_index, solicitation_csv,
                                       -- candidate_contribution, committee_expenditure, registry
  source_record_id text,               -- solicitation id, source filename, etc.
  match_method text,                   -- exact_name, fuzzy_name, acct_num, professional_treasurer
  match_score numeric(5,2),            -- 0-100 fuzzy score, null for exact/structural
  amount numeric(15,2),                -- dollar amount if applicable
  edge_date date,                      -- filing/contribution/expenditure date
  is_publishable boolean not null default false,
  is_candidate_specific boolean not null default false,
                                       -- true = PAC total attributed to candidate in soft_money_total
                                       -- false = affiliated multi-candidate PAC (shown but not summed)
  created_at timestamptz default now()
);

create index if not exists idx_pc_edges_candidate on candidate_pc_edges(candidate_acct_num);
create index if not exists idx_pc_edges_pc on candidate_pc_edges(pc_acct_num);
create index if not exists idx_pc_edges_type on candidate_pc_edges(edge_type);
create index if not exists idx_pc_edges_publishable on candidate_pc_edges(is_publishable)
  where is_publishable = true;


-- ── committee_lineage: predecessor/successor groups ─────────────────────────

create table if not exists committee_lineage (
  id bigint generated always as identity primary key,
  group_id text not null,              -- deterministic hash grouping related committees
  acct_num text not null,
  role text not null,                  -- 'predecessor' | 'successor' | 'current'
  evidence text,                       -- "name similarity 92%, shared treasurer John Smith, temporal gap 4 months"
  created_at timestamptz default now(),
  unique(group_id, acct_num)
);

create index if not exists idx_lineage_acct on committee_lineage(acct_num);
create index if not exists idx_lineage_group on committee_lineage(group_id);


-- ── candidate_pc_links_v: frontend-compatible view ──────────────────────────
-- Matches the shape of the old candidate_pc_links table so loadCandidate.js
-- needs only a table-name change.

create or replace view candidate_pc_links_v as
with best_edge as (
  select
    candidate_acct_num,
    pc_acct_num,
    pc_name,
    pc_type,
    edge_type,
    bool_or(is_candidate_specific) over (
      partition by candidate_acct_num, pc_acct_num
    ) as is_candidate_specific,
    row_number() over (
      partition by candidate_acct_num, pc_acct_num
      order by
        case edge_type
          when 'STATEMENT_OF_ORG_SUPPORT'          then 1
          when 'SOLICITATION_CONTROL'               then 2
          when 'DIRECT_CONTRIBUTION_TO_CANDIDATE'   then 3
          when 'OTHER_DISTRIBUTION_TO_CANDIDATE'    then 4
          when 'IEC_FOR_OR_AGAINST'                 then 5
          when 'ECC_FOR_OR_AGAINST'                 then 6
          when 'ADMIN_OVERLAP_ONLY'                 then 7
        end
    ) as rn
  from candidate_pc_edges
  where is_publishable = true
)
select
  b.candidate_acct_num,
  b.pc_acct_num,
  b.pc_name,
  b.pc_type,
  b.edge_type as link_type,
  'strong' as confidence_tier,
  b.is_candidate_specific,
  (select string_agg(distinct e2.evidence_summary, '; ')
   from candidate_pc_edges e2
   where e2.candidate_acct_num = b.candidate_acct_num
     and e2.pc_acct_num = b.pc_acct_num
     and e2.is_publishable = true
  ) as signal_evidence
from best_edge b
where b.rn = 1;
