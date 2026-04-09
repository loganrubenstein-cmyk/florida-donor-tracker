import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const PAGE_SIZE = 50;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q        = searchParams.get('q') || '';
  const type     = searchParams.get('type') || 'all';
  const industry = searchParams.get('industry') || 'all';
  const sort     = searchParams.get('sort') || 'donation_total';
  const page     = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

  const db = getDb();
  let query = db
    .from('principals')
    .select(
      'slug, name, naics, city, state, total_lobbyists, num_active, donation_total, num_contributions, industry',
      { count: 'exact' }
    );

  if (q.trim()) {
    query = query.or(`name.ilike.%${q.trim()}%,city.ilike.%${q.trim()}%`);
  }
  if (type === 'matched') query = query.gt('donation_total', 0);
  if (type === 'active')  query = query.gt('num_active', 0);
  if (industry !== 'all') query = query.eq('industry', industry);

  const sortCol = sort === 'total_lobbyists' ? 'total_lobbyists' : sort === 'name' ? 'name' : 'donation_total';
  const ascending = sort === 'name';
  query = query.order(sortCol, { ascending });

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
