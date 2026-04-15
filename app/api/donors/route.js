import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const PAGE_SIZE    = 50;
const EXPORT_LIMIT = 500;
const VALID_SORTS  = ['name', 'total_combined', 'total_soft', 'total_hard', 'num_contributions'];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q        = searchParams.get('q') || '';
  const type     = searchParams.get('type') || 'all';
  const industry = searchParams.get('industry') || 'all';
  const sortRaw  = searchParams.get('sort');
  const sort     = VALID_SORTS.includes(sortRaw) ? sortRaw : 'total_combined';
  const sortDir  = searchParams.get('sort_dir') || '';
  const page     = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const isExport = searchParams.get('export') === '1';

  const db = getDb();
  let query = db
    .from('donors')
    .select(
      'slug, name, is_corporate, total_combined, total_soft, total_hard, num_contributions, top_location, num_committees, has_lobbyist_link, industry',
      { count: 'exact' }
    )
    .gte('total_combined', 1000);

  if (q.trim())              query = query.ilike('name', `%${q.trim()}%`);
  if (type === 'corporate')  query = query.eq('is_corporate', true);
  if (type === 'individual') query = query.eq('is_corporate', false);
  if (type === 'lobbyist')   query = query.eq('has_lobbyist_link', true);
  if (industry !== 'all')    query = query.eq('industry', industry);

  const defaultAsc = sort === 'name';
  const ascending  = sortDir === 'asc' ? true : sortDir === 'desc' ? false : defaultAsc;
  query = query.order(sort, { ascending });

  const offset = isExport ? 0 : (page - 1) * PAGE_SIZE;
  const limit  = isExport ? EXPORT_LIMIT : PAGE_SIZE;
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data: data || [],
    total: count || 0,
    page,
    pages: Math.ceil((count || 0) / PAGE_SIZE),
  });
}
