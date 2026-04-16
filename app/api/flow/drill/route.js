import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getDb } from '@/lib/db';

// Loaded once at startup — pre-aggregated from public/data/industries/*.json
let _industryTotals = null;
function getIndustryTotals() {
  if (!_industryTotals) {
    try {
      _industryTotals = JSON.parse(
        readFileSync(join(process.cwd(), 'public', 'data', 'industry_totals.json'), 'utf-8')
      );
    } catch { _industryTotals = { summary: [], byIndustry: {} }; }
  }
  return _industryTotals;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const level = searchParams.get('level');
  const db = getDb();

  // ── Industries ──────────────────────────────────────────────────────────────
  if (level === 'industries') {
    const { summary } = getIndustryTotals();
    const results = summary.map(r => ({
      industry: r.industry,
      total: r.total,
      donor_count: r.candidate_count,
    }));
    return NextResponse.json({ results });
  }

  // ── Candidates by industry ──────────────────────────────────────────────────
  // Level renamed from "donors" to "candidates" — industry→candidate drill using
  // per-candidate static industry files (donors.industry column is not yet populated)
  if (level === 'donors') {
    const industry = searchParams.get('industry');
    if (!industry) return NextResponse.json({ error: 'Missing ?industry=' }, { status: 400 });

    const { byIndustry } = getIndustryTotals();
    const topCandidates = (byIndustry[industry] || []).slice(0, 25);
    if (!topCandidates.length) return NextResponse.json({ results: [] });

    const acctNums = topCandidates.map(c => c.acct_num);
    const { data: candRows } = await db.from('candidates')
      .select('acct_num, candidate_name, office_desc, party_code, election_year')
      .in('acct_num', acctNums);

    const candMap = {};
    for (const c of candRows || []) candMap[c.acct_num] = c;

    const results = topCandidates
      .map(c => {
        const cand = candMap[c.acct_num];
        if (!cand || !cand.candidate_name) return null;
        return {
          // Shaped like a "donor" row so ColumnPanel renders it, but these are candidates
          slug: c.acct_num,
          name: cand.candidate_name,
          total: c.total,
          office: cand.office_desc,
          party: cand.party_code,
          year: cand.election_year,
          _isCandidateRow: true,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ results });
  }

  // ── Committees funded by a donor ────────────────────────────────────────────
  if (level === 'committees') {
    const donorSlug = searchParams.get('donor_slug');
    if (!donorSlug) return NextResponse.json({ error: 'Missing ?donor_slug=' }, { status: 400 });

    const { data: donorRows, error: dErr } = await db.from('committee_top_donors')
      .select('acct_num, total_amount, num_contributions')
      .eq('donor_slug', donorSlug)
      .order('total_amount', { ascending: false })
      .limit(20);
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

    const acctNums = (donorRows || []).map(r => r.acct_num).filter(Boolean);
    if (!acctNums.length) return NextResponse.json({ results: [] });

    const { data: commRows } = await db.from('committees')
      .select('acct_num, committee_name')
      .in('acct_num', acctNums);

    const nameMap = {};
    for (const c of commRows || []) nameMap[c.acct_num] = c.committee_name;

    const results = (donorRows || [])
      .filter(r => nameMap[r.acct_num])
      .map(r => ({
        acct_num: r.acct_num,
        committee_name: nameMap[r.acct_num],
        total_amount: parseFloat(r.total_amount) || 0,
        num_contributions: r.num_contributions,
      }));

    return NextResponse.json({ results });
  }

  // ── Top donors to a candidate ──────────────────────────────────────────────
  if (level === 'topdonors') {
    const candidateAcct = searchParams.get('candidate_acct');
    if (!candidateAcct) return NextResponse.json({ error: 'Missing ?candidate_acct=' }, { status: 400 });

    const { data, error } = await db.from('candidate_top_donors')
      .select('donor_slug, donor_name, total_amount, num_contributions')
      .eq('acct_num', candidateAcct)
      .order('total_amount', { ascending: false })
      .limit(20);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      results: (data || []).map(d => ({
        slug: d.donor_slug,
        name: d.donor_name,
        total: parseFloat(d.total_amount) || 0,
        num_contributions: d.num_contributions,
      })),
    });
  }

  // ── Candidates linked to a committee ───────────────────────────────────────
  if (level === 'candidates') {
    const committeeAcct = searchParams.get('committee_acct');
    if (!committeeAcct) return NextResponse.json({ error: 'Missing ?committee_acct=' }, { status: 400 });

    const { data: pcLinks } = await db.from('candidate_pc_links_v')
      .select('candidate_acct_num, link_type, confidence_tier')
      .eq('pc_acct_num', committeeAcct)
      .limit(25);

    if (!pcLinks?.length) return NextResponse.json({ results: [] });

    const candidateAccts = [...new Set(pcLinks.map(l => l.candidate_acct_num))];
    const { data: candidateRows } = await db.from('candidates')
      .select('acct_num, candidate_name, office_desc, party_code, election_year')
      .in('acct_num', candidateAccts);

    const candMap = {};
    for (const c of candidateRows || []) candMap[c.acct_num] = c;

    const results = pcLinks
      .map(link => {
        const cand = candMap[link.candidate_acct_num];
        if (!cand) return null;
        return {
          acct_num: cand.acct_num,
          name: cand.candidate_name,
          office: cand.office_desc,
          party: cand.party_code,
          year: cand.election_year,
          link_type: link.link_type,
          confidence: link.confidence_tier,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b.year || 0) - (a.year || 0));

    return NextResponse.json({ results });
  }

  // ── Party summary ──────────────────────────────────────────────────────────
  if (level === 'parties') {
    const PARTIES = [
      { party: 'REP', label: 'Republican' },
      { party: 'DEM', label: 'Democrat' },
      { party: 'NPA', label: 'No Party Affiliation' },
    ];
    const results = await Promise.all(PARTIES.map(async ({ party, label }) => {
      const { data } = await db.from('candidates')
        .select('acct_num', { count: 'exact' })
        .eq('party_code', party)
        .gt('total_combined', 0)
        .limit(1);
      const { count } = await db.from('candidates')
        .select('acct_num', { count: 'exact', head: true })
        .eq('party_code', party)
        .gt('total_combined', 0);
      const { data: totRow } = await db.from('candidates')
        .select('total_combined')
        .eq('party_code', party)
        .gt('total_combined', 0)
        .order('total_combined', { ascending: false })
        .limit(100);
      const total = (totRow || []).reduce((s, r) => s + (parseFloat(r.total_combined) || 0), 0);
      return { party, label, candidate_count: count || 0, total };
    }));
    return NextResponse.json({ results });
  }

  // ── Candidates by party ─────────────────────────────────────────────────────
  if (level === 'party_candidates') {
    const party = searchParams.get('party');
    if (!party) return NextResponse.json({ error: 'Missing ?party=' }, { status: 400 });

    const { data } = await db.from('candidates')
      .select('acct_num, candidate_name, office_desc, party_code, election_year, total_combined')
      .eq('party_code', party)
      .gt('total_combined', 0)
      .order('total_combined', { ascending: false })
      .limit(25);

    const results = (data || []).map(c => ({
      slug: c.acct_num,
      name: c.candidate_name,
      total: parseFloat(c.total_combined) || 0,
      office: c.office_desc,
      party: c.party_code,
      year: c.election_year,
      _isCandidateRow: true,
    }));
    return NextResponse.json({ results });
  }

  // ── Quick search (typeahead) ────────────────────────────────────────────────
  if (level === 'search') {
    const type = searchParams.get('type');
    const q = searchParams.get('q');
    if (!q || !type) return NextResponse.json({ error: 'Missing ?type= and ?q=' }, { status: 400 });

    if (type === 'committee') {
      const { data } = await db.from('committees')
        .select('acct_num, committee_name')
        .ilike('committee_name', `%${q}%`)
        .limit(10);
      return NextResponse.json({
        results: (data || []).map(c => ({ acct_num: c.acct_num, committee_name: c.committee_name })),
      });
    }

    if (type === 'candidate') {
      const { data } = await db.from('candidates')
        .select('acct_num, candidate_name, office_desc, party_code, election_year, total_combined')
        .ilike('candidate_name', `%${q}%`)
        .gt('total_combined', 0)
        .order('total_combined', { ascending: false })
        .limit(10);
      return NextResponse.json({
        results: (data || []).map(c => ({
          slug: c.acct_num,
          name: c.candidate_name,
          total: parseFloat(c.total_combined) || 0,
          office: c.office_desc,
          party: c.party_code,
          year: c.election_year,
          _isCandidateRow: true,
        })),
      });
    }

    if (type === 'donor') {
      const { data } = await db.from('donors')
        .select('slug, name, total_combined')
        .ilike('name', `%${q}%`)
        .gt('total_combined', 1000)
        .order('total_combined', { ascending: false })
        .limit(10);
      return NextResponse.json({
        results: (data || []).map(d => ({ slug: d.slug, name: d.name, total: parseFloat(d.total_combined) || 0 })),
      });
    }

    return NextResponse.json({ error: 'Invalid type. Use: committee, candidate, donor' }, { status: 400 });
  }

  return NextResponse.json({ error: 'Invalid level. Use: industries, donors, committees, candidates, parties, party_candidates, search' }, { status: 400 });
}
