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

  // ── Donor → Principals (lobbying-side identity match) ────────────────────
  // Phase 1 of the "dream use case". Surfaces principal_donation_matches rows
  // >= 85 score so /follow can pivot from a corporate donor to the principal
  // that lobbies the legislature under a matching name.
  if (step === 'principals') {
    const slug = searchParams.get('donor_slug') || searchParams.get('slug');
    if (!slug) return NextResponse.json({ error: 'donor_slug required' }, { status: 400 });

    const { data } = await db
      .from('donor_principal_links_v')
      .select('principal_slug, principal_name, match_score')
      .eq('donor_slug', slug)
      .order('match_score', { ascending: false })
      .limit(20);

    return NextResponse.json({
      principals: (data || []).map(r => ({
        slug:  r.principal_slug,
        name:  r.principal_name,
        score: parseFloat(r.match_score) || 0,
      })),
    });
  }

  // ── Principal → Bills lobbied ────────────────────────────────────────────
  // Phase 2 of dream flow. Returns bills this principal lobbied, optionally
  // filtered to a session biennium start year.
  if (step === 'principal_bills') {
    const pslug = searchParams.get('principal_slug') || searchParams.get('slug');
    if (!pslug) return NextResponse.json({ error: 'principal_slug required' }, { status: 400 });
    const session = searchParams.get('session');

    let q = db
      .from('principal_lobbied_bills')
      .select('bill_slug, bill_number, session_year, filing_count, years, position')
      .eq('principal_slug', pslug)
      .order('session_year', { ascending: false })
      .order('filing_count', { ascending: false })
      .limit(200);

    if (session) q = q.eq('session_year', parseInt(session));

    const { data } = await q;
    return NextResponse.json({
      bills: (data || []).map(r => ({
        bill_slug:    r.bill_slug,
        bill_number:  r.bill_number,
        session_year: r.session_year,
        filing_count: r.filing_count,
        years:        r.years || [],
        position:     r.position || null,
      })),
    });
  }

  // ── Candidate votes ∩ Principal's lobbied bills ──────────────────────────
  // Phase 3 of dream flow. Given a candidate + principal, return the candidate's
  // votes on bills that principal lobbied — the payoff payload for /follow.
  if (step === 'aligned_votes') {
    const acct = searchParams.get('candidate_acct') || searchParams.get('acct');
    const pslug = searchParams.get('principal_slug');
    if (!acct || !pslug) {
      return NextResponse.json({ error: 'candidate_acct and principal_slug required' }, { status: 400 });
    }

    // Resolve candidate → people_id. Mirrors the lookup in step=votes.
    let peopleId = null;
    {
      const { data } = await db
        .from('legislators')
        .select('people_id')
        .eq('acct_num', acct)
        .limit(1);
      peopleId = data?.[0]?.people_id ?? null;
    }
    if (!peopleId) {
      const { data: candData } = await db
        .from('candidates')
        .select('candidate_name, district, office_desc')
        .eq('acct_num', acct)
        .limit(1);
      const cand = candData?.[0];
      if (cand?.candidate_name) {
        const lastName = cand.candidate_name.trim().split(/\s+/).pop();
        const districtNum = cand.district ? String(cand.district).match(/\d+/)?.[0] : null;
        const chamber = /senator|senate/i.test(cand.office_desc || '') ? 'Senate'
                      : /representative|house/i.test(cand.office_desc || '') ? 'House'
                      : null;
        if (lastName && districtNum && chamber) {
          const { data: byName } = await db
            .from('legislators')
            .select('people_id')
            .ilike('last_name', lastName)
            .eq('district', parseInt(districtNum))
            .eq('chamber', chamber)
            .limit(1);
          peopleId = byName?.[0]?.people_id ?? null;
        }
      }
    }
    if (!peopleId) {
      return NextResponse.json({
        aligned_votes: [],
        note: 'No FL legislator record linked to this candidate.',
      });
    }

    // Step A: bills this principal lobbied (returns bill_slug + session_year)
    const { data: lobbied } = await db
      .from('principal_lobbied_bills')
      .select('bill_slug, bill_number, session_year, filing_count, position')
      .eq('principal_slug', pslug)
      .limit(500);

    const lobbiedMap = new Map();
    for (const r of lobbied || []) {
      // Take highest filing_count across sessions for a given bill_slug.
      const prev = lobbiedMap.get(r.bill_slug);
      if (!prev || (r.filing_count || 0) > (prev.filing_count || 0)) {
        lobbiedMap.set(r.bill_slug, r);
      }
    }
    const slugs = Array.from(lobbiedMap.keys());
    if (slugs.length === 0) return NextResponse.json({ aligned_votes: [] });

    // Step B: this legislator's votes on those slugs
    const { data: votes } = await db
      .from('legislator_votes')
      .select('bill_slug, bill_number, bill_title, vote_text, vote_date, session_id')
      .eq('people_id', peopleId)
      .in('bill_slug', slugs)
      .order('vote_date', { ascending: false })
      .limit(200);

    const aligned = (votes || []).map(v => {
      const l = lobbiedMap.get(v.bill_slug);
      return {
        bill_slug:    v.bill_slug,
        bill_number:  v.bill_number,
        bill_title:   v.bill_title,
        vote:         v.vote_text,
        vote_date:    v.vote_date,
        session_id:   v.session_id,
        filing_count: l?.filing_count || 0,
        position:     l?.position || null,
      };
    });

    return NextResponse.json({ aligned_votes: aligned });
  }

  // ── Candidate → Votes ─────────────────────────────────────────────────────
  if (step === 'votes') {
    const acct = searchParams.get('acct');
    if (!acct) return NextResponse.json({ error: 'acct required' }, { status: 400 });

    // Primary: match by acct_num (only works for legislator's LATEST cycle).
    let legRow = null;
    {
      const { data } = await db
        .from('legislators')
        .select('people_id, display_name')
        .eq('acct_num', acct)
        .limit(1);
      legRow = data?.[0] ?? null;
    }

    // Fallback: legislators.acct_num only holds latest-cycle acct. Look up the
    // candidate's name + district from candidates and try to match a legislator
    // whose display_name ends with that last name + matching district.
    if (!legRow) {
      const { data: candData } = await db
        .from('candidates')
        .select('candidate_name, district, office_desc')
        .eq('acct_num', acct)
        .limit(1);
      const cand = candData?.[0];
      if (cand?.candidate_name) {
        const lastName = cand.candidate_name.trim().split(/\s+/).pop();
        const districtNum = cand.district ? String(cand.district).match(/\d+/)?.[0] : null;
        const chamber = /senator|senate/i.test(cand.office_desc || '') ? 'Senate'
                      : /representative|house/i.test(cand.office_desc || '') ? 'House'
                      : null;
        if (lastName && districtNum && chamber) {
          const { data: byName } = await db
            .from('legislators')
            .select('people_id, display_name')
            .ilike('last_name', lastName)
            .eq('district', parseInt(districtNum))
            .eq('chamber', chamber)
            .limit(1);
          legRow = byName?.[0] ?? null;
        }
      }
    }

    if (!legRow) {
      return NextResponse.json({
        votes: [],
        note: 'No FL state legislator record linked to this candidate — local, judicial, and non-legislative candidates have no roll-call record, and prior-cycle legislator rows may not match the current legislators table.',
      });
    }

    const { data: votes } = await db
      .from('legislator_votes')
      .select('bill_number, bill_title, vote_text, vote_date, session_id')
      .eq('people_id', legRow.people_id)
      .order('vote_date', { ascending: false })
      .limit(30);

    return NextResponse.json({
      legislator: { people_id: legRow.people_id, name: legRow.display_name },
      votes: (votes || []).map(v => ({
        bill_number: v.bill_number,
        bill_title:  v.bill_title,
        vote:        v.vote_text,
        date:        v.vote_date,
        session_id:  v.session_id,
      })),
    });
  }

  return NextResponse.json({ error: 'Unknown step' }, { status: 400 });
}
