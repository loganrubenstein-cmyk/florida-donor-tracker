import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sort = searchParams.get('sort') === 'most' ? 'most' : 'least';
  const limit = Math.max(1, Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 100));

  const db = getDb();

  const { data: committees } = await db
    .from('committees')
    .select('acct_num, committee_name, total_received, num_contributions')
    .gt('total_received', 50000)
    .order('total_received', { ascending: false })
    .limit(500);

  if (!committees || committees.length === 0) {
    return NextResponse.json({ committees: [], stats: {} });
  }

  const acctNums = committees.map(c => c.acct_num);

  // Batch the .in() query to avoid PostgREST URL length limits.
  const BATCH = 100;
  const donorTypes = [];
  for (let i = 0; i < acctNums.length; i += BATCH) {
    const batch = acctNums.slice(i, i + BATCH);
    const { data } = await db
      .from('committee_top_donors')
      .select('acct_num, type, total_amount')
      .in('acct_num', batch);
    if (data) donorTypes.push(...data);
  }

  const typeMap = {};
  for (const d of donorTypes) {
    if (!typeMap[d.acct_num]) typeMap[d.acct_num] = { individual: 0, corporate: 0, committee: 0, other: 0, total: 0 };
    const amt = parseFloat(d.total_amount) || 0;
    const type = d.type || 'other';
    if (type === 'individual' || type === 'CHE' || type === 'CAS') {
      typeMap[d.acct_num].individual += amt;
    } else if (type === 'corporate' || type === 'INK') {
      typeMap[d.acct_num].corporate += amt;
    } else if (type === 'committee') {
      typeMap[d.acct_num].committee += amt;
    } else {
      typeMap[d.acct_num].other += amt;
    }
    typeMap[d.acct_num].total += amt;
  }

  // Transparency = % from identifiable individuals; dark = corporate + committee-to-committee.
  const scored = committees
    .filter(c => typeMap[c.acct_num] && typeMap[c.acct_num].total > 0)
    .map(c => {
      const types = typeMap[c.acct_num];
      const individualPct = (types.individual / types.total) * 100;
      const darkPct = ((types.corporate + types.committee) / types.total) * 100;

      return {
        acct_num: c.acct_num,
        name: c.committee_name,
        total_received: parseFloat(c.total_received) || 0,
        num_contributions: c.num_contributions || 0,
        transparency_score: Math.round(individualPct * 10) / 10,
        dark_money_pct: Math.round(darkPct * 10) / 10,
        breakdown: {
          individual: Math.round(types.individual),
          corporate: Math.round(types.corporate),
          committee: Math.round(types.committee),
          other: Math.round(types.other),
        },
      };
    });

  if (sort === 'most') {
    scored.sort((a, b) => b.transparency_score - a.transparency_score);
  } else {
    scored.sort((a, b) => a.transparency_score - b.transparency_score);
  }

  const result = scored.slice(0, limit);

  const allScores = scored.map(c => c.transparency_score);
  const avgScore = allScores.length > 0 ? allScores.reduce((s, v) => s + v, 0) / allScores.length : 0;
  const totalDark = scored.reduce((s, c) => s + c.breakdown.corporate + c.breakdown.committee, 0);
  const totalTraceable = scored.reduce((s, c) => s + c.breakdown.individual, 0);

  return NextResponse.json({
    committees: result,
    stats: {
      total_committees: scored.length,
      avg_transparency: Math.round(avgScore * 10) / 10,
      total_dark_money: totalDark,
      total_traceable: totalTraceable,
    },
  });
}
