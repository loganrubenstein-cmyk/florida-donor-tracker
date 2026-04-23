import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const acct = searchParams.get('acct');

  const db = getDb();

  if (!acct && q.trim()) {
    const { data } = await db.from('candidates')
      .select('acct_num, candidate_name, office_desc, election_year, party_code')
      .ilike('candidate_name', `%${q.trim()}%`)
      .order('election_year', { ascending: false })
      .limit(15);
    return NextResponse.json({
      results: (data || []).map(c => ({
        acct_num: c.acct_num,
        name: c.candidate_name,
        detail: [c.office_desc, c.election_year, c.party_code].filter(Boolean).join(' · '),
      })),
    });
  }

  if (!acct) return NextResponse.json({ error: 'Provide ?acct= or ?q=' }, { status: 400 });

  const [
    { data: quarterly },
    { data: candidate },
    { data: linkedPCs },
  ] = await Promise.all([
    db.from('candidate_quarterly')
      .select('quarter, amount')
      .eq('acct_num', acct)
      .order('quarter', { ascending: true }),
    db.from('candidates')
      .select('candidate_name, office_desc, election_year, party_code, hard_money_total, total_combined')
      .eq('acct_num', acct)
      .limit(1)
      .then(r => ({ data: r.data?.[0] ?? null, error: r.error })),
    // PostgREST can't embed committees() on this aggregating view (PGRST200).
    // Fetch PC acct_nums here and hydrate committee details below.
    db.from('candidate_pc_links_v')
      .select('pc_acct_num, link_type')
      .eq('candidate_acct_num', acct),
  ]);

  if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

  const quarters = (quarterly || []).map(q => ({
    quarter: q.quarter,
    amount: parseFloat(q.amount) || 0,
  }));

  // Spike = amount > 2.5× the median of nonzero quarters.
  const amounts = quarters.map(q => q.amount).filter(a => a > 0).sort((a, b) => a - b);
  const median = amounts.length > 0 ? amounts[Math.floor(amounts.length / 2)] : 0;
  for (const q of quarters) {
    q.is_spike = median > 0 && q.amount > median * 2.5;
  }

  const electionYear = candidate.election_year;
  if (electionYear) {
    const electionQ = `${electionYear}-Q4`;
    const match = quarters.find(q => q.quarter === electionQ);
    if (match) match.annotation = 'Election';
  }

  const pcAccts = [...new Set((linkedPCs || []).map(r => r.pc_acct_num).filter(Boolean))];
  const commMap = {};
  if (pcAccts.length) {
    const { data: commRows } = await db
      .from('committees')
      .select('acct_num, committee_name, total_received, date_start')
      .in('acct_num', pcAccts);
    for (const c of commRows || []) commMap[c.acct_num] = c;
  }

  const pacs = (linkedPCs || []).map(r => ({
    acct_num: r.pc_acct_num,
    name: commMap[r.pc_acct_num]?.committee_name || null,
    total: parseFloat(commMap[r.pc_acct_num]?.total_received) || 0,
    formed: commMap[r.pc_acct_num]?.date_start || null,
    link_type: r.link_type,
  }));

  for (const pac of pacs) {
    if (pac.formed) {
      const d = new Date(pac.formed);
      const qNum = Math.ceil((d.getMonth() + 1) / 3);
      const pacQ = `${d.getFullYear()}-Q${qNum}`;
      const match = quarters.find(q => q.quarter === pacQ);
      if (match) {
        match.annotation = match.annotation
          ? `${match.annotation} / PAC formed`
          : `PAC: ${(pac.name || '').substring(0, 30)}`;
      }
    }
  }

  return NextResponse.json({
    candidate: {
      acct_num: acct,
      name: candidate.candidate_name,
      office: candidate.office_desc,
      year: candidate.election_year,
      party: candidate.party_code,
      hard_money: parseFloat(candidate.hard_money_total) || 0,
      total: parseFloat(candidate.total_combined) || 0,
    },
    quarters,
    pacs,
    stats: {
      peak_quarter: quarters.reduce((max, q) => q.amount > (max?.amount || 0) ? q : max, null),
      total_quarters: quarters.length,
      spike_count: quarters.filter(q => q.is_spike).length,
    },
  });
}
