// lib/dataLastUpdated.js
//
// Source of truth for the "Updated X" label shown on the homepage.
//
// Live path: query pipeline_latest_success (see migration 019) and return the
// most recent successful quarterly-full-refresh timestamp. If the query fails
// for any reason (table not yet created, Supabase unreachable), fall back to
// the hardcoded constants so the UI always renders something useful.
//
// The hardcoded fallback doubles as a safety net before the automation rollout
// is fully live — once GitHub Actions is writing rows every day, the DB wins.

import { getDb } from '@/lib/db';

export const DATA_LAST_UPDATED = 'April 2026';
export const DATA_LAST_UPDATED_DATE = '2026-04-12';
export const PIPELINE_QUARTER = 'Q1 2026';

const WORKFLOWS_OF_RECORD = [
  'quarterly-full-refresh',
  'daily-contributions',
  'daily-new-committees',
];

function fmtMonthYear(d) {
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function fmtIso(d) {
  return d.toISOString().slice(0, 10);
}

export async function getDataFreshness() {
  try {
    const db = getDb();
    const { data, error } = await db
      .from('pipeline_latest_success')
      .select('workflow, finished_at, run_id, log_url')
      .in('workflow', WORKFLOWS_OF_RECORD);

    if (error || !data || data.length === 0) {
      return _fallback();
    }

    const byWf = Object.fromEntries(data.map(r => [r.workflow, r]));
    const quarterly = byWf['quarterly-full-refresh'];
    const daily = byWf['daily-contributions'] || byWf['daily-new-committees'];
    const chosen = quarterly || daily;
    if (!chosen?.finished_at) return _fallback();

    const d = new Date(chosen.finished_at);
    return {
      label:    fmtMonthYear(d),
      date:     fmtIso(d),
      quarter:  _deriveQuarter(d),
      workflow: chosen.workflow,
      run_id:   chosen.run_id || null,
      log_url:  chosen.log_url || null,
      source:   'pipeline_runs',
    };
  } catch {
    return _fallback();
  }
}

function _fallback() {
  return {
    label:    DATA_LAST_UPDATED,
    date:     DATA_LAST_UPDATED_DATE,
    quarter:  PIPELINE_QUARTER,
    workflow: null,
    run_id:   null,
    log_url:  null,
    source:   'static_fallback',
  };
}

function _deriveQuarter(d) {
  const m = d.getUTCMonth() + 1;
  const y = d.getUTCFullYear();
  const q = m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? 3 : 4;
  return `Q${q} ${y}`;
}
