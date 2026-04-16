-- 020_linkage_view_source_fields.sql
-- Extends candidate_pc_links_v to expose per-edge source verification fields
-- (source_url, source_filing_id, source_filing_date, source_filing_status,
--  confidence_score) so the candidate profile can render "View filing →" links
-- and per-row confidence badges without a second query.
--
-- The view still picks the single best edge per (candidate, pc) pair by the
-- same priority ladder as 011, but now carries that edge's source metadata
-- plus an aggregated list of all source URLs for the pair (for the "N sources"
-- caption in the UI).

drop view if exists candidate_pc_links_v;

create view candidate_pc_links_v as
with best_edge as (
  select
    candidate_acct_num,
    pc_acct_num,
    pc_name,
    pc_type,
    edge_type,
    source_url,
    source_filing_id,
    source_filing_date,
    source_filing_status,
    confidence_score,
    match_method,
    match_score,
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
        end,
        case when source_url is not null and source_url <> '' then 0 else 1 end,
        case when confidence_score is not null then 0 else 1 end,
        confidence_score desc nulls last
    ) as rn
  from candidate_pc_edges
  where is_publishable = true
),
all_sources as (
  select
    candidate_acct_num,
    pc_acct_num,
    count(*) filter (where source_url is not null and source_url <> '') as num_sources,
    array_remove(array_agg(distinct source_url) filter (where source_url is not null and source_url <> ''), null) as source_urls
  from candidate_pc_edges
  where is_publishable = true
  group by candidate_acct_num, pc_acct_num
)
select
  b.candidate_acct_num,
  b.pc_acct_num,
  b.pc_name,
  b.pc_type,
  b.edge_type              as link_type,
  case
    when b.confidence_score is null            then 'possible'
    when b.confidence_score >= 90              then 'strong'
    when b.confidence_score >= 75              then 'likely'
    else                                            'possible'
  end                      as confidence_tier,
  b.confidence_score,
  b.source_url,
  b.source_filing_id,
  b.source_filing_date,
  b.source_filing_status,
  b.match_method,
  b.match_score,
  b.is_candidate_specific,
  coalesce(s.num_sources, 0)    as num_sources,
  coalesce(s.source_urls, '{}') as source_urls,
  (select string_agg(distinct e2.evidence_summary, '; ')
   from candidate_pc_edges e2
   where e2.candidate_acct_num = b.candidate_acct_num
     and e2.pc_acct_num = b.pc_acct_num
     and e2.is_publishable = true
  ) as signal_evidence
from best_edge b
left join all_sources s
  on s.candidate_acct_num = b.candidate_acct_num
 and s.pc_acct_num        = b.pc_acct_num
where b.rn = 1;
