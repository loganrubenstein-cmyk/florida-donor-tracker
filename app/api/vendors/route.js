import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const PAGE_SIZE = 50;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q      = (searchParams.get('q') || '').trim();
  const type   = searchParams.get('type') || 'all';
  const sort   = searchParams.get('sort') || 'total_amount';
  const page   = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const offset = (page - 1) * PAGE_SIZE;

  const db = getDb();
  let query = db.from('vendor_totals_mv')
    .select('slug, name, is_government, is_franchise, total_amount, num_payments', { count: 'exact' });

  if (q) query = query.ilike('name', `%${q}%`);
  if (type === 'government')  query = query.eq('is_government', true);
  if (type === 'franchise')   query = query.eq('is_franchise', true);
  if (type === 'private')     query = query.eq('is_government', false).eq('is_franchise', false);

  const sortCol = sort === 'num_payments' ? 'num_payments' : sort === 'name' ? 'name' : 'total_amount';
  query = query.order(sortCol, { ascending: sort === 'name' });
  query = query.range(offset, offset + PAGE_SIZE - 1);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ data: [], total: 0, pages: 0, error: error.message });

  return NextResponse.json({
    data: (data || []).map(v => ({
      slug: v.slug,
      name: v.name,
      is_government: v.is_government,
      is_franchise:  v.is_franchise,
      total_amount:  parseFloat(v.total_amount) || 0,
      num_payments:  v.num_payments || 0,
    })),
    total: count || 0,
    pages: Math.max(1, Math.ceil((count || 0) / PAGE_SIZE)),
    page,
  });
}
