// lib/loadDonor.js — Supabase-backed donor profile loader
// Profile pages are force-dynamic (server-rendered on demand).
// No static JSON files required.
import { getDb } from '@/lib/db';

export async function loadDonor(slug) {
  const db = getDb();
  const decodedSlug = decodeURIComponent(slug);

  // ── 1. Main donor record ────────────────────────────────────────────────────
  const { data: donor, error: donorErr } = await db
    .from('donors')
    .select('slug, name, is_corporate, total_soft, total_hard, total_combined, num_contributions, top_occupation, top_location, num_committees, num_candidates, has_lobbyist_link, industry')
    .eq('slug', decodedSlug)
    .single();

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

  // ── 5. Lobbyist principal connections (if flagged) ──────────────────────────
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
      match_score:    parseFloat(m.match_score) || 0,
    }));
  }

  return {
    ...donor,
    committees:          committees         || [],
    candidates:          candidates,
    by_year:             byYear             || [],
    lobbyist_principals: lobbyistPrincipals,
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
