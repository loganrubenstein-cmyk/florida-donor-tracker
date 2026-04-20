// lib/loadDonor.js — Supabase-backed donor profile loader
// Profile pages are force-dynamic (server-rendered on demand).
// No static JSON files required.
import { getDb } from '@/lib/db';

function cleanSnippet(raw) {
  if (!raw) return null;
  const text = raw.replace(/<[^>]+>/g, '').trim();
  return text.length >= 30 ? text : null;
}

export async function loadDonor(slug) {
  const db = getDb();
  const decodedSlug = decodeURIComponent(slug);

  // ── 1. Main donor record ────────────────────────────────────────────────────
  const { data: donorRows, error: donorErr } = await db
    .from('donors')
    .select('slug, name, is_corporate, total_soft, total_hard, total_combined, num_contributions, top_occupation, top_location, num_committees, num_candidates, has_lobbyist_link, industry, corp_number, corp_ein, corp_status, corp_match_score')
    .eq('slug', decodedSlug)
    .limit(1);

  const donor = donorRows?.[0] ?? null;
  if (donorErr || !donor) {
    throw new Error(`Donor not found: ${decodedSlug}`);
  }

  // ── 2. Top committees ───────────────────────────────────────────────────────
  const { data: committees } = await db
    .from('donor_committees')
    .select('acct_num, committee_name, total, num_contributions')
    .eq('donor_slug', decodedSlug)
    .order('total', { ascending: false })
    .limit(25);

  // ── 3. Top candidates (with office/party/year via join) ─────────────────────
  const { data: candidateRows } = await db
    .from('donor_candidates')
    .select('acct_num, candidate_name, total, num_contributions, candidates(office_desc, party_code, election_year)')
    .eq('donor_slug', decodedSlug)
    .order('total', { ascending: false })
    .limit(25);

  const candidates = (candidateRows || []).map(r => ({
    acct_num:        r.acct_num,
    candidate_name:  r.candidate_name,
    total:           r.total,
    num_contributions: r.num_contributions,
    office:          r.candidates?.office_desc || null,
    party:           r.candidates?.party_code  || null,
    year:            r.candidates?.election_year || null,
  }));

  // ── 4. By-year chart data ───────────────────────────────────────────────────
  const { data: byYear } = await db
    .from('donor_by_year')
    .select('year, soft, hard, total')
    .eq('donor_slug', decodedSlug)
    .order('year', { ascending: true });

  // ── 5. Lobbyist principal connections ────────────────────────────────────────
  let lobbyistPrincipals = [];
  if (donor.has_lobbyist_link) {
    const { data: matches } = await db
      .from('principal_donation_matches')
      .select('principal_slug, contributor_name, match_score, principals(name)')
      .ilike('contributor_name', donor.name)
      .order('match_score', { ascending: false })
      .limit(10);

    lobbyistPrincipals = (matches || []).map(m => ({
      principal_name: m.principals?.name || m.principal_slug,
      principal_slug: m.principal_slug,
      match_score:    parseFloat(m.match_score) || 0,
    }));
  }
  // Fallback: if no match via flag, try direct slug match against principals table
  // Catches cases like "FLORIDA POWER & LIGHT COMPANY" vs "Florida Power & Light Company"
  if (lobbyistPrincipals.length === 0) {
    const { data: slugMatchRows } = await db
      .from('principals')
      .select('slug, name')
      .eq('slug', decodedSlug)
      .limit(1);
    const slugMatch = slugMatchRows?.[0] ?? null;
    if (slugMatch) {
      lobbyistPrincipals = [{
        principal_name: slugMatch.name,
        principal_slug: slugMatch.slug,
        match_score: 1.0,
      }];
    }
  }

  // ── 6. State contract links ─────────────────────────────────────────────────
  // donor_contract_links may not exist until script 95 runs — fail silently.
  let stateContracts = [];
  try {
    const { data: contractLinks } = await db
      .from('donor_contract_links')
      .select('vendor_slug, total_contract_amount, num_contracts, top_agency, year_range, match_score, match_method')
      .eq('entity_slug', decodedSlug)
      .order('total_contract_amount', { ascending: false })
      .limit(20);

    if (contractLinks && contractLinks.length > 0) {
      const vSlugs = contractLinks.map(c => c.vendor_slug);
      const { data: vendors } = await db
        .from('fl_vendor_contracts')
        .select('vendor_slug, vendor_name')
        .in('vendor_slug', vSlugs);
      const vendorMap = {};
      for (const v of vendors || []) vendorMap[v.vendor_slug] = v.vendor_name;
      stateContracts = contractLinks.map(c => ({
        vendor_slug:           c.vendor_slug,
        vendor_name:           vendorMap[c.vendor_slug] || c.vendor_slug,
        total_contract_amount: parseFloat(c.total_contract_amount) || 0,
        num_contracts:         c.num_contracts || 0,
        top_agency:            c.top_agency,
        year_range:            c.year_range,
        match_score:           parseFloat(c.match_score) || 0,
        match_method:          c.match_method,
      }));
    }
  } catch (_) { /* table not yet created — skip */ }

  // ── 7. Federal giving (FEC individual contributions, FL-filtered) ──────────
  // Match by lower(trim(name)) == donor_key in fec_indiv_donor_totals_mv.
  let federal = null;
  try {
    const donorKey = (donor.name || '').trim().toLowerCase();
    if (donorKey) {
      const { data: fedRows } = await db
        .from('fec_indiv_donor_totals_mv')
        .select('donor_key, name, top_city, top_employer, num_contributions, total_amount, first_dt, last_dt, cycles')
        .eq('donor_key', donorKey)
        .limit(1);
      if (fedRows && fedRows[0]) {
        federal = {
          name:              fedRows[0].name,
          top_city:          fedRows[0].top_city,
          top_employer:      fedRows[0].top_employer,
          num_contributions: fedRows[0].num_contributions || 0,
          total_amount:      parseFloat(fedRows[0].total_amount) || 0,
          first_dt:          fedRows[0].first_dt,
          last_dt:           fedRows[0].last_dt,
          cycles:            fedRows[0].cycles || [],
        };
      }
    }
  } catch (_) { /* MV not yet built — skip */ }

  const { data: newsRows } = await db
    .from('news_entity_articles')
    .select('article_title, article_url, article_outlet, article_published, article_snippet, source')
    .eq('entity_slug', decodedSlug)
    .order('article_published', { ascending: false })
    .limit(8);

  // ── 8. Insight strip ────────────────────────────────────────────────────────
  const { count: donorsAbove } = await db
    .from('donors')
    .select('*', { count: 'exact', head: true })
    .gt('total_combined', donor.total_combined);
  const donorRank = (donorsAbove || 0) + 1;

  const partyTotals = { REP: 0, DEM: 0 };
  for (const c of candidates) {
    if (c.party === 'REP') partyTotals.REP += c.total || 0;
    else if (c.party === 'DEM') partyTotals.DEM += c.total || 0;
  }
  const politicalTotal = partyTotals.REP + partyTotals.DEM;
  const repPct = politicalTotal > 0 ? Math.round(partyTotals.REP / politicalTotal * 100) : null;
  const demPct = politicalTotal > 0 ? Math.round(partyTotals.DEM / politicalTotal * 100) : null;

  const peakYear = (byYear || []).length > 0
    ? (byYear.reduce((a, b) => ((b.total || 0) > (a.total || 0) ? b : a), byYear[0])).year
    : null;

  const donorInsights = [];
  if (donorRank <= 10000) donorInsights.push({ text: `#${donorRank.toLocaleString()} statewide donor`, color: 'var(--green)' });
  if (repPct !== null && repPct >= 70) donorInsights.push({ text: `${repPct}% Republican`, color: 'var(--republican)' });
  else if (demPct !== null && demPct >= 70) donorInsights.push({ text: `${demPct}% Democrat`, color: 'var(--democrat)' });
  else if (repPct !== null && demPct !== null && politicalTotal > 0) donorInsights.push({ text: `${repPct}% R / ${demPct}% D`, color: 'var(--text-dim)' });
  if (peakYear) donorInsights.push({ text: `Peak: ${peakYear} cycle`, color: 'var(--orange)' });
  if ((donor.num_committees || 0) > 0) donorInsights.push({ text: `${donor.num_committees} committees funded`, color: 'var(--teal)' });
  if (donor.is_corporate) donorInsights.push({ text: 'Corporate donor', color: 'var(--blue)' });

  return {
    ...donor,
    committees:          committees         || [],
    candidates:          candidates,
    by_year:             byYear             || [],
    lobbyist_principals: lobbyistPrincipals,
    state_contracts:     stateContracts,
    federal:             federal,
    insights:            donorInsights,
    news:                (newsRows || []).map(n => ({
      title:     n.article_title,
      url:       n.article_url,
      outlet:    n.article_outlet,
      published: n.article_published,
      snippet:   cleanSnippet(n.article_snippet),
      source:    n.source,
    })),
  };
}

// Kept for any existing callers that need a list of slugs (e.g. investigations page)
// Returns slugs from Supabase — no file system access needed
export async function listDonorSlugs() {
  const db = getDb();
  const { data } = await db
    .from('donors')
    .select('slug')
    .order('total_combined', { ascending: false });
  return (data || []).map(d => d.slug);
}

// Legacy sync index loader — used by investigations/page.js
// Returns a minimal array for annotation lookups
export async function loadDonorIndex() {
  const db = getDb();
  const { data } = await db
    .from('donors')
    .select('slug, name, is_corporate, total_combined, industry, has_lobbyist_link');
  return data || [];
}
