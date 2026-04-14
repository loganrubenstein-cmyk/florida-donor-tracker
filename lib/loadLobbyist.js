// lib/loadLobbyist.js — Supabase-backed lobbyist/principal profile loader
import { getDb } from '@/lib/db';

// ── Lobbyist profiles ─────────────────────────────────────────────────────────

export async function loadLobbyist(slug) {
  const db = getDb();

  const { data: lobbyist, error } = await db
    .from('lobbyists')
    .select('slug, name, firm, city, state, num_principals, num_active, total_donation_influence, has_donation_match, top_principal, total_comp')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !lobbyist) throw new Error(`Lobbyist not found: ${slug}`);

  // All principals this lobbyist has worked with + annual comp history (parallel)
  const [{ data: principalRows }, { data: compRows }] = await Promise.all([
    db.from('principal_lobbyists')
      .select('principal_slug, firm, branch, is_active, since, principals(name)')
      .eq('lobbyist_slug', slug)
      .order('is_active', { ascending: false }),
    db.from('lobby_lobbyist_annual')
      .select('firm_name, year, total_comp, num_principals')
      .eq('lobbyist_name', lobbyist.name)
      .order('year', { ascending: true }),
  ]);

  const principals = (principalRows || []).map(r => ({
    name:           r.principals?.name || r.principal_slug,
    principal_slug: r.principal_slug,
    firm:           r.firm,
    branch:         r.branch,
    is_active:      r.is_active,
    since:          r.since,
    until:          null,
  }));

  const compHistory = compRows || [];
  // Prefer lobbyists.total_comp (matched via sorted-token join in pipeline) over
  // summing lobby_lobbyist_annual rows — the latter uses a different name format and misses many lobbyists
  const totalComp = parseFloat(lobbyist.total_comp) || compHistory.reduce((s, r) => s + (parseFloat(r.total_comp) || 0), 0);

  return { ...lobbyist, principals, compHistory, totalComp };
}

export async function listLobbyistSlugs() {
  const db = getDb();
  const { data } = await db.from('lobbyists').select('slug');
  return (data || []).map(d => d.slug);
}

// ── Principal profiles ────────────────────────────────────────────────────────

export async function loadPrincipal(slug) {
  const db = getDb();

  const { data: principal, error } = await db
    .from('principals')
    .select('slug, name, naics, city, state, total_lobbyists, num_active, donation_total, num_contributions, industry')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !principal) throw new Error(`Principal not found: ${slug}`);

  // Lobbyists hired by this principal
  const { data: lobbyistRows } = await db
    .from('principal_lobbyists')
    .select('lobbyist_slug, lobbyist_name, firm, branch, is_active, since')
    .eq('principal_slug', slug)
    .order('is_active', { ascending: false });

  const lobbyists = (lobbyistRows || []).map(r => ({
    lobbyist_name: r.lobbyist_name,
    lobbyist_slug: r.lobbyist_slug,
    firm:          r.firm,
    branch:        r.branch,
    is_active:     r.is_active,
    since:         r.since,
    until:         null,
  }));

  // Donation matches + quarterly comp + top firms (parallel)
  const [{ data: matchRows }, { data: compRows }, { data: firmRows }] = await Promise.all([
    db.from('principal_donation_matches')
      .select('contributor_name, match_score, total_donated, num_contributions')
      .eq('principal_slug', slug)
      .order('match_score', { ascending: false }),
    db.from('lobbyist_principal_comp')
      .select('year, quarter, branch, total_comp')
      .eq('principal_slug', slug)
      .order('year', { ascending: true })
      .order('quarter', { ascending: true }),
    db.from('lobbying_firm_clients')
      .select('firm_slug, principal_name, total_comp')
      .eq('principal_slug', slug)
      .order('total_comp', { ascending: false })
      .limit(10),
  ]);

  // Top committees: aggregate donor_committees for matched donor slugs
  let topCommitteesData = [];
  if (matchRows?.length > 0) {
    const names = matchRows.map(m => m.contributor_name).filter(Boolean);
    const { data: donorSlugRows } = await db
      .from('donors')
      .select('slug')
      .in('name', names)
      .limit(30);
    const donorSlugs = (donorSlugRows || []).map(d => d.slug).filter(Boolean);
    if (donorSlugs.length > 0) {
      const { data: dcRows } = await db
        .from('donor_committees')
        .select('acct_num, committee_name, total, num_contributions')
        .in('donor_slug', donorSlugs)
        .order('total', { ascending: false })
        .limit(500);
      const byAcct = {};
      for (const r of (dcRows || [])) {
        if (!byAcct[r.acct_num]) {
          byAcct[r.acct_num] = { acct_num: r.acct_num, name: r.committee_name, total: 0, num_contributions: 0 };
        }
        byAcct[r.acct_num].total += parseFloat(r.total) || 0;
        byAcct[r.acct_num].num_contributions += r.num_contributions || 0;
      }
      topCommitteesData = Object.values(byAcct)
        .sort((a, b) => b.total - a.total)
        .slice(0, 15);
    }
  }

  // Build compData shape expected by PrincipalProfile
  const byQuarter = compRows || [];
  const totalComp = byQuarter.reduce((s, r) => s + (r.total_comp || 0), 0);
  const uniqueQuarters = new Set(byQuarter.map(r => `${r.year}-${r.quarter}`));
  const branches = [...new Set(byQuarter.map(r => r.branch))].filter(Boolean);
  const compData = byQuarter.length > 0 ? {
    total_comp:   totalComp,
    num_quarters: uniqueQuarters.size,
    branches,
    by_quarter:   byQuarter,
    top_firms:    (firmRows || []).map(f => ({
      firm_name:  f.firm_slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      slug:       f.firm_slug,
      total_comp: parseFloat(f.total_comp) || 0,
    })),
  } : null;

  // State contract links — table may not exist until script 95 runs
  let stateContracts = [];
  try {
    const { data: contractLinks } = await db
      .from('donor_contract_links')
      .select('vendor_slug, total_contract_amount, num_contracts, top_agency, year_range, match_score, match_method')
      .eq('entity_slug', slug)
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

  return {
    ...principal,
    lobbyists,
    donation_matches: (matchRows || []).map(m => ({
      contributor_name:  m.contributor_name,
      match_score:       parseFloat(m.match_score) || 0,
      total_donated:     parseFloat(m.total_donated) || 0,
      num_contributions: m.num_contributions,
    })),
    comp: compData,
    top_committees: topCommitteesData,
    state_contracts: stateContracts,
  };
}

export async function listPrincipalSlugs() {
  const db = getDb();
  const { data } = await db.from('principals').select('slug');
  return (data || []).map(d => d.slug);
}
