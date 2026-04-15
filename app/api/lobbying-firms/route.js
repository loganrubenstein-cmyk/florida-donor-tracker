import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q     = (searchParams.get('q') || '').trim();
  const sort  = searchParams.get('sort') || 'comp';
  const page  = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = 50;
  const offset = (page - 1) * limit;

  const db = getDb();

  let query = db
    .from('lobbying_firms')
    .select('slug, firm_name, total_comp, num_principals, num_years, first_year, last_year', { count: 'exact' });

  if (q) {
    query = query.ilike('firm_name', `%${q}%`);
  }

  const sortMap = {
    comp:    { col: 'total_comp',    asc: false },
    clients: { col: 'num_principals', asc: false },
    name:    { col: 'firm_name',     asc: true  },
    years:   { col: 'num_years',     asc: false },
  };
  const { col, asc } = sortMap[sort] || sortMap.comp;
  query = query.order(col, { ascending: asc });

  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data: data || [],
    total: count ?? 0,
    pages: Math.ceil((count ?? 0) / limit),
    page,
  });
}
