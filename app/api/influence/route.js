import { NextResponse } from 'next/server';
import { cachedJson } from '@/lib/cachedJson';
import { getDb } from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q        = (searchParams.get('q') || '').trim();
  const industry = (searchParams.get('industry') || '').trim();
  const sort     = searchParams.get('sort') || 'total';
  const page     = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit    = 50;
  const offset   = (page - 1) * limit;

  const db = getDb();

  let query = db
    .from('principal_influence_index')
    .select('slug, name, industry, donation_total, total_lobby_comp, total_influence, active_years, num_contributions', { count: 'exact' });

  if (q) query = query.ilike('name', `%${q}%`);
  if (industry) query = query.eq('industry', industry);

  // Only include orgs with meaningful spend on either side
  query = query.gt('total_influence', 100000);

  const sortMap = {
    total:   { col: 'total_influence',   asc: false },
    lobby:   { col: 'total_lobby_comp',  asc: false },
    donate:  { col: 'donation_total',    asc: false },
    name:    { col: 'name',              asc: true  },
  };
  const { col, asc } = sortMap[sort] || sortMap.total;
  query = query.order(col, { ascending: asc, nullsFirst: false });
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return cachedJson({
    data: data || [],
    total: count ?? 0,
    pages: Math.ceil((count ?? 0) / limit),
    page,
  });
}
