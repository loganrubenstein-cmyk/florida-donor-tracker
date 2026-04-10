import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const PAGE_SIZE = 50;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q         = searchParams.get('q')         || '';
  const type      = searchParams.get('type')      || 'all';
  const sort      = searchParams.get('sort')      || 'connection_score';
  const page      = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const committee = searchParams.get('committee') || ''; // filter to a specific acct_num (either side)

  const db = getDb();

  let query = db
    .from('connections_enriched')
    .select(
      'id, entity_a, entity_b, entity_a_acct, entity_b_acct, connection_score, ' +
      'shared_treasurer, shared_address, shared_phone, shared_chair, ' +
      'donor_overlap_pct, money_between, ' +
      'shared_treasurer_name, shared_chair_name, shared_address_line, ' +
      'entity_a_type, entity_b_type',
      { count: 'exact' }
    );

  if (committee.trim()) {
    query = query.or(`entity_a_acct.eq.${committee.trim()},entity_b_acct.eq.${committee.trim()}`);
  } else if (q.trim()) {
    query = query.or(`entity_a.ilike.%${q.trim()}%,entity_b.ilike.%${q.trim()}%`);
  }

  if (type === 'shared_treasurer') query = query.eq('shared_treasurer', true);
  else if (type === 'shared_chair')    query = query.eq('shared_chair', true);
  else if (type === 'shared_address')  query = query.eq('shared_address', true);
  else if (type === 'donor_overlap')   query = query.gt('donor_overlap_pct', 0);
  else if (type === 'money_between')   query = query.gt('money_between', 0);

  const ALLOWED_SORTS = new Set(['connection_score', 'donor_overlap_pct', 'money_between']);
  const safeSort = ALLOWED_SORTS.has(sort) ? sort : 'connection_score';
  query = query.order(safeSort, { ascending: false });

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
