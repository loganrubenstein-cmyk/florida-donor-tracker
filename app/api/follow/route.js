import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Step 1: search donors
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const step = searchParams.get('step') || 'search';

  const db = getDb();

  // ── Search donors ─────────────────────────────────────────────────────────
  if (step === 'search') {
    const q = searchParams.get('q') || '';
    if (q.length < 2) return NextResponse.json({ results: [] });

    const { data } = await db
      .from('donors')
      .select('slug, name, total_combined, is_corporate, industry')
      .ilike('name', `%${q}%`)
      .order('total_combined', { ascending: false })
      .limit(10);

    return NextResponse.json({ results: data || [] });
  }

  // ── Donor → Committees ────────────────────────────────────────────────────
  if (step === 'committees') {
    const slug = searchParams.get('slug');
    if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

    const { data: donorRow } = await db
      .from('donors')
      .select('slug, name, total_combined, is_corporate, industry')
      .eq('slug', slug)
      .limit(1)
      .then(r => ({ data: r.data?.[0] ?? null }));

    const { data: committees } = await db
      .from('donor_committees')
      .select('acct_num, committee_name, total, num_contributions')
      .eq('donor_slug', slug)
      .order('total', { ascending: false })
      .limit(20);

    return NextResponse.json({
      donor: donorRow,
      committees: (committees || []).map(c => ({
        acct_num:         c.acct_num,
        name:             c.committee_name,
        total:            parseFloat(c.total) || 0,
        num_contributions: c.num_contributions || 0,
      })),
    });
  }

  // ── Committee → Candidates ────────────────────────────────────────────────
  if (step === 'candidates') {
    const acct = searchParams.get('acct');
    if (!acct) return NextResponse.json({ error: 'acct required' }, { status: 400 });

    // Candidates directly linked to this committee via edges
    const { data: edges } = await db
      .from('candidate_pc_links_v')
      .select('candidate_acct_num, pc_name, link_type, confidence_tier, candidates(candidate_name, office_desc, party_code, total_combined, election_year)')
      .eq('pc_acct_num', acct)
      .limit(20);

    // Also check direct contributions from committee to candidate accounts
    const { data: directContribs } = await db
      .from('contributions')
      .select('acct_num, recipient_name, amount, candidates(candidate_name, office_desc, party_code, total_combined, election_year)')
      .eq('donor_slug', `committee-${acct}`)
      .not('candidates', 'is', null)
      .order('amount', { ascending: false })
      .limit(20);

    const seen = new Set();
    const candidates = [];

    for (const e of edges || []) {
      if (!e.candidate_acct_num || seen.has(e.candidate_acct_num)) continue;
      seen.add(e.candidate_acct_num);
      candidates.push({
        acct_num:      e.candidate_acct_num,
        name:          e.candidates?.candidate_name || `Account #${e.candidate_acct_num}`,
        office:        e.candidates?.office_desc || null,
        party:         e.candidates?.party_code || null,
        total_raised:  parseFloat(e.candidates?.total_combined) || 0,
        year:          e.candidates?.election_year || null,
        link_type:     e.link_type,
        confidence:    e.confidence_tier,
      });
    }

    return NextResponse.json({ candidates });
  }

  // ── Candidate → Votes ─────────────────────────────────────────────────────
  if (step === 'votes') {
    const acct = searchParams.get('acct');
    if (!acct) return NextResponse.json({ error: 'acct required' }, { status: 400 });

    // Look up politician slug from candidate acct
    const { data: polRow } = await db
      .from('politicians')
      .select('people_id, name')
      .eq('candidate_acct_num', acct)
      .limit(1)
      .then(r => ({ data: r.data?.[0] ?? null }));

    if (!polRow) return NextResponse.json({ votes: [], note: 'No legislator record linked to this candidate.' });

    const { data: votes } = await db
      .from('legislator_votes')
      .select('bill_number, bill_title, vote, vote_date, session_year, bill_url')
      .eq('people_id', polRow.people_id)
      .order('vote_date', { ascending: false })
      .limit(30);

    return NextResponse.json({
      legislator: { people_id: polRow.people_id, name: polRow.name },
      votes: (votes || []).map(v => ({
        bill_number: v.bill_number,
        bill_title:  v.bill_title,
        vote:        v.vote,
        date:        v.vote_date,
        year:        v.session_year,
        url:         v.bill_url,
      })),
    });
  }

  return NextResponse.json({ error: 'Unknown step' }, { status: 400 });
}
