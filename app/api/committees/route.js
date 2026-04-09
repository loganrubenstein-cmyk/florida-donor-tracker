import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const PAGE_SIZE = 50;

const R_KW = ['REPUBLICAN', 'GOP', 'CONSERVATIVES FOR', 'AMERICANS FOR PROSPERITY'];
const D_KW = ['DEMOCRAT', 'SEIU', 'AFSCME', 'AFL-CIO', 'LABOR ', 'UNION ', 'PROGRESSIVE'];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q     = searchParams.get('q') || '';
  const party = searchParams.get('party') || 'all';
  const sort     = searchParams.get('sort')     || 'total_received';
  const sortDir  = searchParams.get('sort_dir') || '';
  const page     = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

  const db = getDb();
  let query = db
    .from('committees')
    .select('acct_num, committee_name, total_received, num_contributions', { count: 'exact' });

  if (q.trim()) query = query.ilike('committee_name', `%${q.trim()}%`);

  const defaultAsc = sort === 'committee_name' || sort === 'name';
  const ascending  = sortDir === 'asc' ? true : sortDir === 'desc' ? false : defaultAsc;
  const sortCol    = sort === 'contributions' ? 'num_contributions' : sort === 'name' ? 'committee_name' : 'total_received';
  query = query.order(sortCol, { ascending });

  const offset = (page - 1) * PAGE_SIZE;
  query = query.range(offset, offset + PAGE_SIZE - 1);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Apply party filter client-side (heuristic name matching, can't do in SQL)
  let filtered = data || [];
  if (party === 'R') {
    filtered = filtered.filter(c => R_KW.some(k => (c.committee_name || '').toUpperCase().includes(k)));
  } else if (party === 'D') {
    filtered = filtered.filter(c => D_KW.some(k => (c.committee_name || '').toUpperCase().includes(k)));
  }

  return NextResponse.json({
    data: filtered,
    total: count || 0,
    page,
    pages: Math.ceil((count || 0) / PAGE_SIZE),
  });
}
