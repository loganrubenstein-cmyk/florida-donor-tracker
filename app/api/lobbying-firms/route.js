import { NextResponse } from 'next/server';
import { cachedJson } from '@/lib/cachedJson';
import { getDb } from '@/lib/db';
import { toCsvResponse } from '@/lib/csv';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q        = (searchParams.get('q') || '').trim();
  const sort     = searchParams.get('sort') || 'comp';
  const page     = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const isExport = searchParams.get('export') === '1';
  const limit    = isExport ? 5000 : 50;
  const offset   = isExport ? 0 : (page - 1) * limit;

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

  if (isExport) {
    const rows = (data || []).map(f => ({
      firm_name:      f.firm_name,
      slug:           f.slug,
      total_comp:     f.total_comp,
      num_principals: f.num_principals,
      num_years:      f.num_years,
      first_year:     f.first_year || '',
      last_year:      f.last_year || '',
    }));
    return toCsvResponse(rows, 'florida-lobbying-firms.csv');
  }

  return cachedJson({
    data: data || [],
    total: count ?? 0,
    pages: Math.ceil((count ?? 0) / limit),
    page,
  });
}
