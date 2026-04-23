import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { toCsvResponse } from '@/lib/csv';

const PAGE_SIZE    = 50;
const EXPORT_LIMIT = 5000;
const VALID_SORTS  = ['name', 'total_combined', 'total_soft', 'total_hard', 'num_contributions'];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q        = searchParams.get('q') || '';
  const type     = searchParams.get('type') || 'all';
  const industry = searchParams.get('industry') || 'all';
  const city     = searchParams.get('city') || '';
  const state    = searchParams.get('state') || '';
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
  if (city.trim()) {
    // top_location is formatted "CITY, STATE ZIP" (e.g. "MIAMI, FL 33172").
    // Prefix-match the city; fold in state if supplied.
    // Escape % and _ so a stray character in the input can't turn into a
    // wildcard (e.g. city="STE. %" would otherwise wildcard-match everything).
    const escape = s => s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    const cityEsc = escape(city.trim());
    const stateEsc = state.trim() ? escape(state.trim()) : '';
    const cityPat = stateEsc ? `${cityEsc},%${stateEsc}%` : `${cityEsc},%`;
    query = query.ilike('top_location', cityPat);
  }

  const defaultAsc = sort === 'name';
  const ascending  = sortDir === 'asc' ? true : sortDir === 'desc' ? false : defaultAsc;
  query = query.order(sort, { ascending });

  const offset = isExport ? 0 : (page - 1) * PAGE_SIZE;
  const limit  = isExport ? EXPORT_LIMIT : PAGE_SIZE;
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (isExport) {
    const rows = (data || []).map(d => ({
      name:              d.name,
      slug:              d.slug,
      total_combined:    d.total_combined,
      total_hard:        d.total_hard,
      total_soft:        d.total_soft,
      num_contributions: d.num_contributions,
      industry:          d.industry || '',
      top_location:      d.top_location || '',
      is_corporate:      d.is_corporate ? 'yes' : 'no',
    }));
    return toCsvResponse(rows, 'florida-donors.csv');
  }

  return NextResponse.json({
    data: data || [],
    total: count || 0,
    page,
    pages: Math.ceil((count || 0) / PAGE_SIZE),
  });
}
