import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const acct = searchParams.get('acct');

  const db = getDb();

  // Search mode
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

  // Fetch timeline data
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
      .maybeSingle(),
    db.from('candidate_pc_links_v')
      .select('pc_acct_num, link_type, committees(committee_name, total_received, date_start)')
      .eq('candidate_acct_num', acct),
  ]);

  if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });

  // Build quarter array with annotations
  const quarters = (quarterly || []).map(q => ({
    quarter: q.quarter,
    amount: parseFloat(q.amount) || 0,
  }));

  // Detect spikes (quarters where amount > 2x the median)
  const amounts = quarters.map(q => q.amount).filter(a => a > 0).sort((a, b) => a - b);
  const median = amounts.length > 0 ? amounts[Math.floor(amounts.length / 2)] : 0;
  for (const q of quarters) {
    q.is_spike = median > 0 && q.amount > median * 2.5;
  }

  // Election quarter annotation
  const electionYear = candidate.election_year;
  if (electionYear) {
    const electionQ = `${electionYear}-Q4`;
    const match = quarters.find(q => q.quarter === electionQ);
    if (match) match.annotation = 'Election';
  }

  // PAC formation dates
  const pacs = (linkedPCs || []).map(r => ({
    acct_num: r.pc_acct_num,
    name: r.committees?.committee_name || null,
    total: parseFloat(r.committees?.total_received) || 0,
    formed: r.committees?.date_start || null,
    link_type: r.link_type,
  }));

  // Mark PAC formation quarters on timeline
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
