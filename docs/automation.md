# Florida Donor Tracker — Automation

Every scrape, load, reconcile, audit, and smoke-test step now runs on GitHub
Actions. Before this rewrite the only scheduled workflow was a reminder issue;
humans had to double-click `.command` files to refresh data. After this
rewrite:

- New/closed committees refresh daily
- Contributions refresh daily
- Fund transfers + lobbyist compensation refresh weekly
- The whole pipeline + integrity audit + smoke test runs quarterly
- A nightly smoke test + audit opens a GitHub issue on any regression
- An hourly watchdog pings the FL DoE expend.exe endpoint and files an
  issue when it goes down (it 502s often enough that we need to know)

## Workflows

| File | Cadence | What it runs |
|---|---|---|
| `.github/workflows/daily-new-committees.yml` | 06:00 ET daily | `02_download_registry.py` (folds in 02b), then `40_load_committees_supabase.py` |
| `.github/workflows/daily-contributions.yml` | 07:00 ET daily | `03_scrape_contributions.py --since-last-manifest` → `41_load_contributions.py` |
| `.github/workflows/weekly-transfers.yml` | 04:00 ET Sunday | `11_scrape_fund_transfers.py` |
| `.github/workflows/weekly-lobbyists.yml` | 05:00 ET Sunday | `14_scrape_lobbyists.py` → `47_load_lobbyist_compensation.py` |
| `.github/workflows/quarterly-full-refresh.yml` | Jan/Apr/Jul/Oct 11 at 12:00 ET | Full pipeline 01 → 99 |
| `.github/workflows/nightly-smoke.yml` | 02:00 ET daily | `84_audit_data_integrity.py` + `99_smoke_test.py` |
| `.github/workflows/expend-exe-watchdog.yml` | Hourly at :07 | HEAD/GET probe of expend.exe |
| `.github/workflows/quarterly-reminder.yml` | Jan/Apr/Jul/Oct 11 | Legacy reminder issue (kept as a safety net during the switchover) |

Every workflow uses the composite action at
`.github/actions/run-script/action.yml` which:

1. Checks out the repo
2. Sets up Python with pip cache
3. Installs dependencies from `requirements.txt` if present, otherwise a
   minimal set (`psycopg2-binary pandas requests python-dotenv thefuzz pyyaml`)
4. Runs the requested script with `python -u`, piping stdout+stderr to a
   timestamped log file in `data/logs/`
5. Uploads `data/logs/*` and `data/processed/*.csv` as an artifact with 14-day
   retention

On failure each workflow opens a GitHub issue via
`peter-evans/create-issue-from-file@v5`, tagged with `pipeline-failure` plus a
severity label (`severity:low|medium|high`). The nightly smoke test tags with
`smoke-test`; the watchdog tags with `data-source-down`.

## Required secrets

Set these under the repo's **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
|---|---|
| `SUPABASE_DB_URL` | Postgres connection string for loads + audit + smoke checks. Direct (port 5432) connection — the pooled 6543 route does not support `COPY FROM STDIN`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key for the canonical loader (`09b_apply_manual_merges.py` uses it for the alias table). |
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase URL used by a few scripts that read via PostgREST. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key. |
| `SITE_URL` | Live site URL for the smoke test (`https://florida-donor-tracker.vercel.app`). Leave unset to default. |
| `SUNBIZ_SFTP_USER` / `SUNBIZ_SFTP_PASS` | Needed only when rerunning the Sunbiz bulk pull. |

After adding or rotating a secret, re-run any failed workflow from the Actions
tab — secrets are re-read on each run. **Never commit a `.env.local`; the
workflows never copy it. Anything that ever landed in git history should be
rotated.**

## Timezone + cadence notes

- Cron schedules use UTC. The workflow files include the ET equivalent in the
  filename so future-you doesn't need to convert.
- Quarterly workflows fire on the **11th** of Jan/Apr/Jul/Oct — the day after
  the FL DoE campaign-finance filing deadline. Adjust if FL DoE changes the
  deadline.
- `expend-exe-watchdog` fires at :07 each hour (staggered away from :00 where
  every other "hourly" workflow in the world is scheduled) to keep the
  free-tier runners happy.

## Alert routing

Every failure opens a GitHub issue. GitHub notifies the repo owner via email +
the mobile app. No Slack webhook is wired yet; add one by extending each
workflow's failure step with a `slackapi/slack-github-action@v1.25` step if
needed.

Issues created by pipeline failures are labeled for filtering:

- `pipeline-failure` — any workflow failure
- `data-update` — scraping / load failure
- `smoke-test` — nightly integrity check failed
- `data-source-down` — upstream FL DoE endpoint is unreachable
- `severity:high|medium|low` — triage priority

A `data-source-down` issue repeatedly opened for expend.exe means the FL DoE
endpoint is the root cause, not our code — don't fight the watchdog.

## Local rehearsal

Before merging a workflow change, rehearse it locally:

```bash
# dry-run the script the workflow would call
.venv/bin/python scripts/84_audit_data_integrity.py

# or run the nightly smoke sequence
.venv/bin/python scripts/84_audit_data_integrity.py && \
  SITE_URL=https://florida-donor-tracker.vercel.app \
  .venv/bin/python scripts/99_smoke_test.py
```

If these exit 0 locally, the workflow will succeed on CI barring secret
misconfiguration.

## Historical context

Before this rewrite:

- `02b_discover_closed_committees.py` was a one-off patch script that had to
  be run manually to find dissolved committees. It's now folded into
  `02_download_registry.py` and always runs.
- `82_load_committee_70275.py` and `83_backfill_contributions_70275.py` were
  bespoke per-committee scripts written to surface Friends of Ron DeSantis
  (acct 70275). Those are retired; the normal pipeline picks up 70275 now.
- `84_audit_data_integrity.py` had 4 checks (A–D). It now has 15 (A–O)
  including external-anchor comparison against `data/external_anchors.yaml`.
- `85_reconcile_donor_aggregates.py` was one-directional ("only raise
  totals"). It's now a `REFRESH MATERIALIZED VIEW donors_mv` + hard validation
  gate, so the $136M Florida Realtors drift class of bug cannot recur.
