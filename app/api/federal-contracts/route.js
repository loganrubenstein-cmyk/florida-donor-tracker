import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const PAGE_SIZE = 50;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q      = searchParams.get('q') || '';
  const filter = searchParams.get('filter') || 'all';
  const ALLOWED_SORTS = new Set(['total_obligation', 'recipient_name', 'period_start', 'period_end']);
  const sortRaw = searchParams.get('sort') || 'total_obligation';
  const sort    = ALLOWED_SORTS.has(sortRaw) ? sortRaw : 'total_obligation';
  const page   = Math.max(1, parseInt(searchParams.get('page') || '1', 10));

  const db = getDb();

  // Aggregate per recipient across all awards
  let recipientSlugs = null;
  if (filter === 'matched') {
    const { data: linkRows } = await db
      .from('federal_contract_links')
      .select('recipient_slug');
    recipientSlugs = [...new Set((linkRows || []).map(r => r.recipient_slug))];
    if (recipientSlugs.length === 0) {
      return NextResponse.json({ data: [], total: 0, page, pages: 0 });
    }
  }

  // Aggregate federal_contracts by recipient_slug
  let query = db
    .from('federal_contracts')
    .select(
      'recipient_slug, recipient_name, recipient_uei, total_obligation, awarding_agency, naics_description, period_start, period_end',
      { count: 'exact' }
    );

  if (q.trim()) query = query.ilike('recipient_name', `%${q.trim()}%`);
  if (recipientSlugs) query = query.in('recipient_slug', recipientSlugs);

  const ascending = sort === 'recipient_name';
  query = query.order(sort, { ascending });

  const offset = (page - 1) * PAGE_SIZE;
  query = query.range(offset, offset + PAGE_SIZE - 1);

  const { data: awards, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const awardList = awards || [];

  // Fetch cross-reference links for this page
  const linkMap = {};
  if (awardList.length > 0) {
    const slugs = [...new Set(awardList.map(a => a.recipient_slug).filter(Boolean))];
    const { data: linkRows } = await db
      .from('federal_contract_links')
      .select('recipient_slug, entity_slug, entity_type, match_score, federal_total, state_total')
      .in('recipient_slug', slugs);
    for (const r of linkRows || []) {
      if (!linkMap[r.recipient_slug]) linkMap[r.recipient_slug] = [];
      linkMap[r.recipient_slug].push(r);
    }
  }

  const enriched = awardList.map(a => ({
    ...a,
    has_match:   !!linkMap[a.recipient_slug],
    cross_links: linkMap[a.recipient_slug] || [],
  }));

  return NextResponse.json({
    data:  enriched,
    total: count || 0,
    page,
    pages: Math.ceil((count || 0) / PAGE_SIZE),
  });
}
