import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const acctNum = searchParams.get('acct') || '';
  if (!acctNum) return NextResponse.json({ error: 'acct required' }, { status: 400 });

  const db = getDb();

  const [{ data: connRows, error }, { data: focusRows }] = await Promise.all([
    db.from('connections_enriched')
      .select('id, entity_a, entity_b, entity_a_acct, entity_b_acct, connection_score, shared_treasurer, shared_address, shared_chair, donor_overlap_pct, money_between')
      .or(`entity_a_acct.eq.${acctNum},entity_b_acct.eq.${acctNum}`)
      .order('connection_score', { ascending: false })
      .limit(30),
    db.from('committees').select('committee_name').eq('acct_num', acctNum).limit(1),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const connections = connRows || [];
  const focusName = focusRows?.[0]?.committee_name || acctNum;

  const nodeMap = {};
  const addNode = (acct, name, isFocus = false) => {
    if (acct && !nodeMap[acct]) {
      nodeMap[acct] = { id: acct, label: name || acct, isFocus, size: isFocus ? 12 : 6 };
    }
  };

  addNode(acctNum, focusName, true);
  for (const c of connections) {
    addNode(c.entity_a_acct, c.entity_a);
    addNode(c.entity_b_acct, c.entity_b);
  }

  const edges = connections.map(c => {
    let edgeType = 'donor';
    if (c.shared_treasurer) edgeType = 'treasurer';
    else if (c.shared_address) edgeType = 'address';
    else if (c.shared_chair) edgeType = 'chair';
    else if (parseFloat(c.money_between) > 0) edgeType = 'money';
    return {
      id:     String(c.id),
      source: c.entity_a_acct,
      target: c.entity_b_acct,
      score:  c.connection_score,
      type:   edgeType,
    };
  });

  return NextResponse.json({
    nodes: Object.values(nodeMap),
    edges,
    focus: acctNum,
    total_connections: connections.length,
  });
}
