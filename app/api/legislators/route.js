import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const PAGE_SIZE = 50;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q        = searchParams.get('q')        || '';
  const chamber  = searchParams.get('chamber')  || 'all';
  const party    = searchParams.get('party')    || 'all';
  const ALLOWED_SORTS = new Set(['display_name', 'last_name', 'district', 'total_raised', 'participation_rate', 'votes_yea']);
  const sortRaw  = searchParams.get('sort')     || 'display_name';
  const sort     = ALLOWED_SORTS.has(sortRaw) ? sortRaw : 'display_name';
  const sortDir  = searchParams.get('sort_dir') || '';
  const page     = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

  const db = getDb();
  let query = db
    .from('legislators')
    .select(
      'people_id, display_name, first_name, last_name, chamber, party, district, ' +
      'leadership_title, counties, email, twitter, term_limit_year, ' +
      'acct_num, total_raised, donor_slug, ' +
      'votes_yea, votes_nay, votes_nv, votes_absent, participation_rate',
      { count: 'exact' }
    )
    .eq('is_current', true);

  if (q.trim()) {
    query = query.or(`display_name.ilike.%${q.trim()}%,last_name.ilike.%${q.trim()}%`);
  }
  if (chamber !== 'all') query = query.eq('chamber', chamber);
  if (party !== 'all')   query = query.eq('party', party);

  const ascending = sortDir === 'asc' ? true : sortDir === 'desc' ? false : (sort === 'display_name');
  query = query.order(sort, { ascending, nullsFirst: false });

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
