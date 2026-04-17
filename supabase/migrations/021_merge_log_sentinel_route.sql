-- 021_merge_log_sentinel_route.sql
--
-- Script 09 (dedup) routes FL DoE aggregation-marker strings (e.g.
-- "MEMBERSHIP DUES 10,314 MEMBERS", "ANONYMOUS $500", "1 MEMBER @ $225,000")
-- to the sentinel canonical entity `aggregated-non-itemized`. We log each
-- such routing with a distinct action value so audits can filter for it.
-- The existing CHECK constraint predates this feature; expand it.

alter table donor_merge_log
  drop constraint if exists donor_merge_log_action_check;

alter table donor_merge_log
  add constraint donor_merge_log_action_check
  check (action in (
    'create_entity',
    'merge',
    'split',
    'reassign_alias',
    'delete_alias',
    'note',
    'sentinel_route'
  ));
