import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const PAGE_SIZE    = 50;
const EXPORT_LIMIT = 500;

// Must match slugify() in lib/slugify.js
function slugify(name) {
  if (!name) return '';
  return name
    .replace(/\.\s*$/, '').trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 120);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q       = searchParams.get('q')      || '';
  const party   = searchParams.get('party')  || 'all';
  const office  = searchParams.get('office') || 'all';
  const year    = searchParams.get('year')   || 'all';
  const sort     = searchParams.get('sort')     || 'total_combined_all';
  const sortDir  = searchParams.get('sort_dir') || '';
  const page     = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const isExport = searchParams.get('export') === '1';

  const db = getDb();

  let query = db
    .from('politicians_canonical')
    .select('display_name, party, latest_office, latest_district, latest_acct_num, earliest_cycle, latest_cycle, num_cycles, total_combined_all, hard_money_all, soft_money_all, is_ambiguous', { count: 'exact' });

  if (q.trim())         query = query.ilike('display_name', `%${q.trim()}%`);
  if (party !== 'all')  query = query.eq('party', party);
  if (office !== 'all') query = query.ilike('latest_office', `%${office}%`);
  if (year !== 'all') {
    const y = parseInt(year, 10);
    query = query.lte('earliest_cycle', y).gte('latest_cycle', y);
  }

  const defaultAsc = sort === 'display_name';
  const ascending  = sortDir === 'asc' ? true : sortDir === 'desc' ? false : defaultAsc;
  query = query.order(sort, { ascending });

  const offset = isExport ? 0 : (page - 1) * PAGE_SIZE;
  const limit  = isExport ? EXPORT_LIMIT : PAGE_SIZE;
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const withSlugs = (data || []).map(p => ({
    ...p,
    slug: slugify(p.display_name),
  }));

  return NextResponse.json({
    data: withSlugs,
    total: count || 0,
    page,
    pages: Math.ceil((count || 0) / PAGE_SIZE),
  });
}
