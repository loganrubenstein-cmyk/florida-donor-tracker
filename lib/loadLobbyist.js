// lib/loadLobbyist.js — Supabase-backed lobbyist/principal profile loader
import { getDb } from '@/lib/db';

// ── Lobbyist profiles ─────────────────────────────────────────────────────────

export async function loadLobbyist(slug) {
  const db = getDb();

  const { data: lobbyist, error } = await db
    .from('lobbyists')
    .select('slug, name, firm, city, state, num_principals, num_active, total_donation_influence, has_donation_match, top_principal')
    .eq('slug', slug)
    .single();

  if (error || !lobbyist) throw new Error(`Lobbyist not found: ${slug}`);

  // All principals this lobbyist has worked with
  const { data: principalRows } = await db
    .from('principal_lobbyists')
    .select('principal_slug, firm, branch, is_active, since, principals(name)')
    .eq('lobbyist_slug', slug)
    .order('is_active', { ascending: false });

  const principals = (principalRows || []).map(r => ({
    name:      r.principals?.name || r.principal_slug,  // LobbyistProfile uses p.name
    firm:      r.firm,
    branch:    r.branch,
    is_active: r.is_active,
    since:     r.since,
    until:     null,
  }));

  return { ...lobbyist, principals };
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
    .single();

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
    top_committees: [],
  };
}

export async function listPrincipalSlugs() {
  const db = getDb();
  const { data } = await db.from('principals').select('slug');
  return (data || []).map(d => d.slug);
}
