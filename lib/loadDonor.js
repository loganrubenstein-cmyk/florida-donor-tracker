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
  const { data: donor, error: donorErr } = await db
    .from('donors')
    .select('slug, name, is_corporate, total_soft, total_hard, total_combined, num_contributions, top_occupation, top_location, num_committees, num_candidates, has_lobbyist_link, industry')
    .eq('slug', decodedSlug)
    .maybeSingle();

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
    const { data: slugMatch } = await db
      .from('principals')
      .select('slug, name')
      .eq('slug', decodedSlug)
      .maybeSingle();
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

  const { data: newsRows } = await db
    .from('news_entity_articles')
    .select('article_title, article_url, article_outlet, article_published, article_snippet, source')
    .eq('entity_slug', decodedSlug)
    .order('article_published', { ascending: false })
    .limit(8);

  return {
    ...donor,
    committees:          committees         || [],
    candidates:          candidates,
    by_year:             byYear             || [],
    lobbyist_principals: lobbyistPrincipals,
    state_contracts:     stateContracts,
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
