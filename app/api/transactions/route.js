import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 50;

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  // ── Filters ─────────────────────────────────────────────────────────────────
  const donor_slug     = searchParams.get('donor_slug')     || '';
  const recipient_acct = searchParams.get('recipient_acct') || '';
  const recipient_type = searchParams.get('recipient_type') || ''; // 'committee' | 'candidate'
  const q              = searchParams.get('q')              || ''; // contributor name ILIKE
  const year           = searchParams.get('year')           || '';
  const tx_type        = searchParams.get('tx_type')        || ''; // type_code filter
  const amount_min     = searchParams.get('amount_min')     || '';
  const amount_max     = searchParams.get('amount_max')     || '';
  const date_start     = searchParams.get('date_start')     || '';
  const date_end       = searchParams.get('date_end')       || '';
  const sort           = searchParams.get('sort')           || 'contribution_date';
  const sort_dir       = searchParams.get('sort_dir')       || 'desc';
  const page           = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const page_size      = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(searchParams.get('page_size') || String(DEFAULT_PAGE_SIZE), 10))
  );

  const db = getDb();

  let query = db
    .from('contributions')
    .select(
      'id, recipient_type, recipient_acct, contributor_name, donor_slug, ' +
      'amount, contribution_date, report_year, report_type, type_code, ' +
      'in_kind_description, contributor_address, contributor_city_state_zip, ' +
      'contributor_occupation, source_file',
      { count: 'exact' }
    );

  // ── Apply filters ────────────────────────────────────────────────────────────
  if (donor_slug)     query = query.eq('donor_slug', donor_slug);
  if (recipient_acct) query = query.eq('recipient_acct', recipient_acct);
  if (recipient_type) query = query.eq('recipient_type', recipient_type);
  if (tx_type)        query = query.eq('type_code', tx_type);
  if (year)           query = query.eq('report_year', parseInt(year, 10));

  if (q.trim()) {
    // Split into tokens so "Smith John" matches "JOHN SMITH" (token-order independent)
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

  // ── Sort ─────────────────────────────────────────────────────────────────────
  const ALLOWED_SORTS = new Set([
    'contribution_date', 'amount', 'report_year', 'contributor_name',
    'recipient_acct', 'recipient_type',
  ]);
  const safeSort = ALLOWED_SORTS.has(sort) ? sort : 'contribution_date';
  const ascending = sort_dir === 'asc';
  query = query.order(safeSort, { ascending });

  // ── Pagination ───────────────────────────────────────────────────────────────
  const offset = (page - 1) * page_size;
  query = query.range(offset, offset + page_size - 1);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count || 0;
  const pages = Math.ceil(total / page_size);

  // Resolve recipient names
  const rows = data || [];
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

  return NextResponse.json({
    data: rows,
    total,
    page,
    pages,
    page_size,
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
