import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const PAGE_SIZE = 50;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q      = searchParams.get('q') || '';
  const filter = searchParams.get('filter') || 'all';
  const sort   = searchParams.get('sort') || 'total_amount';
  const page   = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

  const db = getDb();

  // For "matched" filter, pre-fetch vendor slugs that have donor/principal links
  let matchedSlugs = null;
  if (filter === 'matched') {
    const { data: linkRows } = await db.from('donor_contract_links').select('vendor_slug');
    matchedSlugs = [...new Set((linkRows || []).map(r => r.vendor_slug))];
    if (matchedSlugs.length === 0) {
      return NextResponse.json({ data: [], total: 0, page, pages: 0 });
    }
  }

  let query = db
    .from('fl_vendor_contracts')
    .select('vendor_slug, vendor_name, total_amount, num_contracts, top_agency, year_range', { count: 'exact' });

  if (q.trim()) query = query.ilike('vendor_name', `%${q.trim()}%`);
  if (matchedSlugs) query = query.in('vendor_slug', matchedSlugs);

  const ascending = sort === 'vendor_name';
  query = query.order(sort, { ascending });

  const offset = (page - 1) * PAGE_SIZE;
  query = query.range(offset, offset + PAGE_SIZE - 1);

  const { data: vendors, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach donor match data for this page of results
  const vendorList = vendors || [];
  const donorMatchMap = {};
  if (vendorList.length > 0) {
    const slugs = vendorList.map(v => v.vendor_slug);
    const { data: linkRows } = await db
      .from('donor_contract_links')
      .select('vendor_slug, entity_slug, entity_type, total_contributions, match_score, match_method')
      .in('vendor_slug', slugs)
      .order('total_contributions', { ascending: false });
    for (const r of linkRows || []) {
      if (!donorMatchMap[r.vendor_slug]) donorMatchMap[r.vendor_slug] = [];
      donorMatchMap[r.vendor_slug].push(r);
    }
  }

  const enriched = vendorList.map(v => ({
    ...v,
    has_donor_match: !!donorMatchMap[v.vendor_slug],
    donor_matches:   donorMatchMap[v.vendor_slug] || [],
  }));

  return NextResponse.json({
    data:  enriched,
    total: count || 0,
    page,
    pages: Math.ceil((count || 0) / PAGE_SIZE),
  });
}
