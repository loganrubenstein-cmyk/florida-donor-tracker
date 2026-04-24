import { NextResponse } from 'next/server';
import { cachedJson } from '@/lib/cachedJson';
import { getDb } from '@/lib/db';
import { toCsvResponse } from '@/lib/csv';

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 50;

// Helper: apply the same filter set to any query builder
function applyFilters(query, { donor_slug, recipient_acct, recipient_type, q, year, tx_type, amount_min, amount_max, date_start, date_end }) {
  if (donor_slug)     query = query.eq('donor_slug', donor_slug);
  if (recipient_acct) query = query.eq('recipient_acct', recipient_acct);
  if (recipient_type) query = query.eq('recipient_type', recipient_type);
  if (tx_type)        query = query.eq('type_code', tx_type);
  if (year)           query = query.eq('report_year', parseInt(year, 10));

  if (q.trim()) {
    const tokens = q.trim().toUpperCase().split(/\s+/).filter(Boolean);
    for (const tok of tokens) {
      query = query.ilike('contributor_name_normalized', `%${tok}%`);
    }
  }

  if (amount_min) {
    const min = parseFloat(amount_min);
    if (!isNaN(min)) query = query.gte('amount', min);
  }
  if (amount_max) {
    const max = parseFloat(amount_max);
    if (!isNaN(max)) query = query.lte('amount', max);
  }
  if (date_start) query = query.gte('contribution_date', date_start);
  if (date_end)   query = query.lte('contribution_date', date_end);

  return query;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  // ── Filters ─────────────────────────────────────────────────────────────────
  const donor_slug     = searchParams.get('donor_slug')     || '';
  const recipient_acct = searchParams.get('recipient_acct') || '';
  const recipient_type = searchParams.get('recipient_type') || '';
  const q              = searchParams.get('q')              || '';
  const year           = searchParams.get('year')           || '';
  const tx_type        = searchParams.get('tx_type')        || '';
  const amount_min     = searchParams.get('amount_min')     || '';
  const amount_max     = searchParams.get('amount_max')     || '';
  const date_start     = searchParams.get('date_start')     || '';
  const date_end       = searchParams.get('date_end')       || '';
  const sort           = searchParams.get('sort')           || 'contribution_date';
  const sort_dir       = searchParams.get('sort_dir')       || 'desc';
  const page           = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const isExport       = searchParams.get('export') === '1';
  const page_size      = isExport ? 5000 : Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(searchParams.get('page_size') || String(DEFAULT_PAGE_SIZE), 10))
  );

  const db = getDb();
  const filterArgs = { donor_slug, recipient_acct, recipient_type, q, year, tx_type, amount_min, amount_max, date_start, date_end };
  const hasFilter = donor_slug || recipient_acct || q.trim() || year || tx_type ||
    amount_min || amount_max || date_start || date_end;

  const ALLOWED_SORTS = new Set([
    'contribution_date', 'amount', 'report_year', 'contributor_name',
    'recipient_acct', 'recipient_type',
  ]);
  const safeSort = ALLOWED_SORTS.has(sort) ? sort : 'contribution_date';
  const ascending = sort_dir === 'asc';
  const offset = (page - 1) * page_size;

  // ── Data query (no count — never blocked by a slow COUNT(*)) ─────────────────
  // When no filters are applied, show the largest contributions from the most
  // recent 2 years to give users a compelling default view. Cap at today to
  // exclude bad-data rows with future dates (e.g. year 3003).
  const today = new Date().toISOString().slice(0, 10);
  const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const isDefault = !hasFilter;
  const effectiveFilterArgs = isDefault ? {
    ...filterArgs,
    date_start: twoYearsAgo,
    date_end: today,
    amount_min: '10000',
  } : filterArgs;

  // When showing defaults, sort by amount desc regardless of user sort
  const effectiveSort = isDefault ? 'amount' : safeSort;
  const effectiveAscending = isDefault ? false : ascending;

  let dataQuery = db
    .from('contributions')
    .select(
      'id, recipient_type, recipient_acct, contributor_name, donor_slug, ' +
      'amount, contribution_date, report_year, report_type, type_code, ' +
      'in_kind_description, contributor_address, contributor_city_state_zip, ' +
      'contributor_occupation, source_file'
    );
  dataQuery = applyFilters(dataQuery, effectiveFilterArgs);
  dataQuery = dataQuery.order(effectiveSort, { ascending: effectiveAscending, nullsFirst: false });
  dataQuery = dataQuery.range(offset, offset + page_size - 1);

  // ── Count query (only when filters active — skip expensive full-table count) ──
  let countQuery = null;
  if (hasFilter) {
    countQuery = db.from('contributions').select('*', { count: 'exact', head: true });
    countQuery = applyFilters(countQuery, filterArgs);
  }

  // ── Run in parallel ───────────────────────────────────────────────────────────
  const [dataResult, countResult] = await Promise.all([
    dataQuery,
    countQuery || Promise.resolve({ count: null, error: null }),
  ]);

  if (dataResult.error) {
    return NextResponse.json({ error: dataResult.error.message }, { status: 500 });
  }

  const rows  = dataResult.data || [];
  const total = countResult.count ?? null;
  const pages = total !== null ? Math.ceil(total / page_size) : null;

  // ── Resolve recipient names ───────────────────────────────────────────────────
  const committeeAccts = [...new Set(rows.filter(r => r.recipient_type === 'committee').map(r => r.recipient_acct))];
  const candidateAccts = [...new Set(rows.filter(r => r.recipient_type === 'candidate').map(r => r.recipient_acct))];

  const [{ data: cmtes }, { data: cands }] = await Promise.all([
    committeeAccts.length
      ? db.from('committees').select('acct_num, committee_name').in('acct_num', committeeAccts)
      : Promise.resolve({ data: [] }),
    candidateAccts.length
      ? db.from('candidates').select('acct_num, candidate_name').in('acct_num', candidateAccts)
      : Promise.resolve({ data: [] }),
  ]);

  const nameMap = {};
  (cmtes || []).forEach(c => { nameMap[c.acct_num] = c.committee_name; });
  (cands || []).forEach(c => { nameMap[c.acct_num] = c.candidate_name; });
  rows.forEach(r => { r.recipient_name = nameMap[r.recipient_acct] || null; });

  if (isExport) {
    const csvRows = rows.map(r => ({
      contributor_name:        r.contributor_name,
      amount:                  r.amount,
      contribution_date:       r.contribution_date,
      recipient_name:          r.recipient_name || '',
      recipient_type:          r.recipient_type,
      recipient_acct:          r.recipient_acct,
      report_year:             r.report_year,
      type_code:               r.type_code,
      contributor_address:     r.contributor_address || '',
      contributor_occupation:  r.contributor_occupation || '',
    }));
    return toCsvResponse(csvRows, 'florida-transactions.csv');
  }

  return cachedJson({
    data: rows,
    total,
    page,
    pages,
    page_size,
    is_default: isDefault,
    filters_applied: {
      donor_slug:     donor_slug || null,
      recipient_acct: recipient_acct || null,
      recipient_type: recipient_type || null,
      q:              q || null,
      year:           year || null,
      tx_type:        tx_type || null,
      amount_min:     amount_min || null,
      amount_max:     amount_max || null,
      date_start:     date_start || null,
      date_end:       date_end || null,
    },
  });
}
