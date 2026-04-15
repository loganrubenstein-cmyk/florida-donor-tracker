import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const acct = searchParams.get('acct');
  const q = searchParams.get('q') || '';

  const db = getDb();

  // Search mode — return matching committees
  if (!acct && q.trim()) {
    const { data, error } = await db
      .from('committees')
      .select('acct_num, committee_name, total_received, num_contributions')
      .ilike('committee_name', `%${q.trim()}%`)
      .order('total_received', { ascending: false })
      .limit(20);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ results: data || [] });
  }

  // Decode mode — full decode for one committee
  if (!acct) return NextResponse.json({ error: 'Provide ?acct= or ?q=' }, { status: 400 });

  const [
    { data: committee },
    { data: topDonors },
    { data: industries },
    { data: meta },
    { data: linkedCandidates },
    { data: expSummary },
  ] = await Promise.all([
    db.from('committees')
      .select('acct_num, committee_name, total_received, num_contributions, date_start, date_end')
      .eq('acct_num', acct)
      .maybeSingle(),
    db.from('committee_top_donors')
      .select('donor_name, donor_slug, total_amount, num_contributions, type')
      .eq('acct_num', acct)
      .order('total_amount', { ascending: false })
      .limit(25),
    db.from('industry_by_committee')
      .select('industry, total')
      .eq('acct_num', acct)
      .order('total', { ascending: false }),
    db.from('committee_meta')
      .select('treasurer_name, chair_name, address_line, type_desc')
      .eq('acct_num', acct)
      .maybeSingle(),
    db.from('candidate_pc_links_v')
      .select('candidate_acct_num, link_type, candidates(candidate_name, office_desc, election_year)')
      .eq('pc_acct_num', String(acct)),
    db.from('committee_expenditure_summary')
      .select('total_spent, num_expenditures')
      .eq('acct_num', acct)
      .maybeSingle(),
  ]);

  if (!committee) return NextResponse.json({ error: 'Committee not found' }, { status: 404 });

  // Compute donor type breakdown
  const donors = topDonors || [];
  const totalFromTop = donors.reduce((s, d) => s + parseFloat(d.total_amount || 0), 0);
  const typeBreakdown = {};
  for (const d of donors) {
    const t = d.type || 'unknown';
    typeBreakdown[t] = (typeBreakdown[t] || 0) + parseFloat(d.total_amount || 0);
  }

  // Single-donor PAC detection
  const totalReceived = parseFloat(committee.total_received) || 0;
  const topDonorPct = donors.length > 0 && totalReceived > 0
    ? (parseFloat(donors[0].total_amount) / totalReceived) * 100
    : 0;
  const isSingleDonorPAC = topDonorPct >= 80;

  // Linked candidates
  const candidates = (linkedCandidates || []).map(r => ({
    acct_num: r.candidate_acct_num,
    name: r.candidates?.candidate_name || null,
    office: r.candidates?.office_desc || null,
    year: r.candidates?.election_year || null,
    link_type: r.link_type,
  }));

  return NextResponse.json({
    committee: {
      acct_num: committee.acct_num,
      name: committee.committee_name,
      total_received: totalReceived,
      num_contributions: committee.num_contributions || 0,
      date_start: committee.date_start,
      date_end: committee.date_end,
      type: meta?.type_desc || null,
      treasurer: meta?.treasurer_name || null,
      chair: meta?.chair_name || null,
      address: meta?.address_line || null,
    },
    top_donors: donors.map(d => ({
      name: d.donor_name,
      slug: d.donor_slug,
      amount: parseFloat(d.total_amount) || 0,
      count: d.num_contributions || 0,
      type: d.type || 'unknown',
    })),
    donor_type_breakdown: typeBreakdown,
    industry_breakdown: (industries || []).map(r => ({
      industry: r.industry,
      total: parseFloat(r.total) || 0,
    })),
    flags: {
      is_single_donor_pac: isSingleDonorPAC,
      top_donor_pct: Math.round(topDonorPct * 10) / 10,
      has_candidates: candidates.length > 0,
    },
    candidates,
    spending: expSummary ? {
      total_spent: parseFloat(expSummary.total_spent) || 0,
      num_expenditures: expSummary.num_expenditures || 0,
    } : null,
  });
}
