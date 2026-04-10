import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { FEDERAL_OFFICE_CODES } from '@/lib/officeCodes';

const PAGE_SIZE = 50;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q        = searchParams.get('q')        || '';
  const party    = searchParams.get('party')    || 'all';
  const office   = searchParams.get('office')   || 'all';
  const year     = searchParams.get('year')     || 'all';
  const district = searchParams.get('district') || '';
  const sort     = searchParams.get('sort')     || 'total_combined';
  const sortDir  = searchParams.get('sort_dir') || '';
  const page     = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

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

  const offset = (page - 1) * PAGE_SIZE;
  query = query.range(offset, offset + PAGE_SIZE - 1);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data: data || [],
    total: count || 0,
    page,
    pages: Math.ceil((count || 0) / PAGE_SIZE),
  });
}
