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

    // Step 1: get edges from the view (no embedded join — views don't support it)
    const { data: edges } = await db
      .from('candidate_pc_links_v')
      .select('candidate_acct_num, link_type, confidence_tier')
      .eq('pc_acct_num', acct)
      .limit(30);

    const acctNums = [...new Set((edges || []).map(e => e.candidate_acct_num).filter(Boolean))];

    if (acctNums.length === 0) return NextResponse.json({ candidates: [] });

    // Step 2: fetch candidate details for those acct_nums
    const { data: cands } = await db
      .from('candidates')
      .select('acct_num, candidate_name, office_desc, party_code, total_combined, election_year')
      .in('acct_num', acctNums)
      .order('total_combined', { ascending: false })
      .limit(20);

    const edgeMap = {};
    for (const e of edges || []) {
      if (!edgeMap[e.candidate_acct_num]) edgeMap[e.candidate_acct_num] = e;
    }

    const candidates = (cands || []).map(c => ({
      acct_num:     c.acct_num,
      name:         c.candidate_name,
      office:       c.office_desc || null,
      party:        c.party_code || null,
      total_raised: parseFloat(c.total_combined) || 0,
      year:         c.election_year || null,
      link_type:    edgeMap[c.acct_num]?.link_type || null,
      confidence:   edgeMap[c.acct_num]?.confidence_tier || null,
    }));

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
