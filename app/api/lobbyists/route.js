import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const PAGE_SIZE = 50;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q       = searchParams.get('q') || '';
  const type    = searchParams.get('type') || 'all';
  const sort    = searchParams.get('sort') || 'total_donation_influence';
  const sortDir = searchParams.get('sort_dir') || '';
  const page    = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

  const db = getDb();
  let query = db
    .from('lobbyists')
    .select(
      'slug, name, firm, city, state, num_principals, num_active, total_donation_influence, has_donation_match, top_principal, total_comp',
      { count: 'exact' }
    );

  if (q.trim()) {
    query = query.or(
      `name.ilike.%${q.trim()}%,firm.ilike.%${q.trim()}%,top_principal.ilike.%${q.trim()}%`
    );
  }
  if (type === 'matched') query = query.eq('has_donation_match', true);
  if (type === 'active')  query = query.gt('num_active', 0);

  const defaultAsc = sort === 'name';
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
