import { NextResponse } from 'next/server';
import { cachedJson } from '@/lib/cachedJson';
import { getDb } from '@/lib/db';
import { FEDERAL_OFFICE_CODES } from '@/lib/officeCodes';
import { toCsvResponse } from '@/lib/csv';

const PAGE_SIZE    = 50;
const EXPORT_LIMIT = 5000;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q        = searchParams.get('q')        || '';
  const party    = searchParams.get('party')    || 'all';
  const office   = searchParams.get('office')   || 'all';
  const year     = searchParams.get('year')     || 'all';
  const district = searchParams.get('district') || '';
  const ALLOWED_SORTS = new Set(['candidate_name', 'total_combined', 'hard_money_total', 'soft_money_total', 'hard_num_contributions', 'election_year']);
  const sortRaw  = searchParams.get('sort')     || 'total_combined';
  const sort     = ALLOWED_SORTS.has(sortRaw) ? sortRaw : 'total_combined';
  const sortDir  = searchParams.get('sort_dir') || '';
  const page     = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const isExport = searchParams.get('export') === '1';

  const db = getDb();
  const federalCodes = [...FEDERAL_OFFICE_CODES];

  let query = db
    .from('candidates')
    .select(
      'acct_num, candidate_name, election_year, office_code, office_desc, party_code, district, hard_money_total, soft_money_total, total_combined, hard_num_contributions, num_linked_pcs',
      { count: 'exact' }
    )
    .not('office_code', 'in', `(${federalCodes.join(',')})`);

  if (q.trim())         query = query.ilike('candidate_name', `%${q.trim()}%`);
  if (party !== 'all')  query = query.eq('party_code', party);
  if (office !== 'all') query = query.ilike('office_desc', `%${office}%`);
  if (year !== 'all')   query = query.eq('election_year', parseInt(year, 10));
  if (district.trim())  query = query.eq('district', district.trim().replace(/^0+/, ''));

  const defaultAsc = sort === 'candidate_name';
  const ascending  = sortDir === 'asc' ? true : sortDir === 'desc' ? false : defaultAsc;
  query = query.order(sort, { ascending });

  const offset = isExport ? 0 : (page - 1) * PAGE_SIZE;
  const limit  = isExport ? EXPORT_LIMIT : PAGE_SIZE;
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (isExport) {
    const rows = (data || []).map(c => ({
      candidate_name:    c.candidate_name,
      acct_num:          c.acct_num,
      election_year:     c.election_year,
      office_desc:       c.office_desc,
      party_code:        c.party_code,
      district:          c.district || '',
      total_combined:    c.total_combined,
      hard_money_total:  c.hard_money_total,
      soft_money_total:  c.soft_money_total,
      num_contributions: c.hard_num_contributions,
    }));
    return toCsvResponse(rows, 'florida-candidates.csv');
  }

  return cachedJson({
    data: data || [],
    total: count || 0,
    page,
    pages: Math.ceil((count || 0) / PAGE_SIZE),
  });
}
