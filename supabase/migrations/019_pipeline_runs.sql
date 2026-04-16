-- 019_pipeline_runs.sql
-- Observability + "Updated X" timestamp source of truth.
-- Every scheduled workflow (and manual pipeline invocation) writes a row
-- here with its status, row deltas, and duration. The homepage reads the
-- latest successful row to show "Updated <date>" — no more hardcoded
-- DATA_LAST_UPDATED constant in lib/dataLastUpdated.js.

create table if not exists pipeline_runs (
  id              bigint generated always as identity primary key,
  workflow        text    not null,       -- 'daily-contributions', 'quarterly-full-refresh', etc.
  script_name     text,                   -- '41_load_contributions.py', null for composite workflows
  run_id          text,                   -- github.run_id or local uuid
  status          text    not null check (status in ('running','success','failed','partial','cancelled')),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  duration_sec    int generated always as (extract(epoch from (finished_at - started_at))::int) stored,
  rows_added      bigint,
  rows_updated    bigint,
  rows_deleted    bigint,
  error_message   text,
  log_url         text,                   -- GitHub Actions artifact URL
  metadata        jsonb,
  created_at      timestamptz default now()
);

create index if not exists idx_pipeline_runs_workflow_started
  on pipeline_runs(workflow, started_at desc);
create index if not exists idx_pipeline_runs_status
  on pipeline_runs(status, started_at desc);

-- ── Convenience view: latest-successful by workflow ─────────────────────────
create or replace view pipeline_latest_success as
select distinct on (workflow)
  workflow,
  started_at,
  finished_at,
  duration_sec,
  rows_added,
  rows_updated,
  run_id,
  log_url
from pipeline_runs
where status = 'success'
order by workflow, started_at desc;


-- ── external_anchors: published totals for audit Check M ────────────────────
-- The integrity audit compares our computed totals for key entities against
-- external published numbers (news stories, Follow the Money, FEC reports).
-- If our number drifts >5% we fail the build and open a GitHub issue.
create table if not exists external_anchors (
  id              bigint generated always as identity primary key,
  entity_type     text not null check (entity_type in ('donor','committee','candidate','cycle')),
  entity_slug     text,
  entity_acct_num text,
  anchor_metric   text not null,          -- 'total_contributions', 'total_raised', 'total_spent'
  anchor_value    numeric(15,2) not null,
  anchor_year     int,                    -- null for all-time
  tolerance_pct   numeric(5,2) default 5.00,
  source_citation text not null,          -- full URL + title
  published_at    date,
  created_at      timestamptz default now(),
  unique (entity_type, coalesce(entity_slug,''), coalesce(entity_acct_num,''), anchor_metric, coalesce(anchor_year, 0))
);

create index if not exists idx_anchors_slug on external_anchors(entity_slug) where entity_slug is not null;
create index if not exists idx_anchors_acct on external_anchors(entity_acct_num) where entity_acct_num is not null;
