import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const acct = searchParams.get('acct');
  if (!acct) return NextResponse.json({ error: 'Missing ?acct=' }, { status: 400 });

  const db = getDb();
  const { data: rows, error } = await db.from('connections_enriched')
    .select(
      'entity_a, entity_b, entity_a_acct, entity_b_acct, connection_score, ' +
      'entity_a_type, entity_b_type, shared_treasurer, shared_address, shared_chair, ' +
      'donor_overlap_pct, money_between'
    )
    .or(`entity_a_acct.eq.${acct},entity_b_acct.eq.${acct}`)
    .order('connection_score', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows?.length) return NextResponse.json({ neighbors: [] });

  const neighbors = rows.map(r => {
    const isA = r.entity_a_acct === acct;
    const types = [
      r.shared_treasurer && 'shared treasurer',
      r.shared_address   && 'shared address',
      r.shared_chair     && 'shared chair',
      r.donor_overlap_pct > 0 && `${Math.round(r.donor_overlap_pct)}% donor overlap`,
      r.money_between > 0     && 'direct transfers',
    ].filter(Boolean);

    return {
      acct_num:         isA ? r.entity_b_acct  : r.entity_a_acct,
      name:             isA ? r.entity_b        : r.entity_a,
      type:             isA ? r.entity_b_type   : r.entity_a_type,
      connection_score: r.connection_score || 0,
      connection_types: types,
    };
  });

  return NextResponse.json({ neighbors });
}
