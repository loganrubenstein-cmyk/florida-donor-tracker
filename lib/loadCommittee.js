// lib/loadCommittee.js — Supabase-backed committee profile loader
import { getDb } from '@/lib/db';

const CAPS_KEEP = new Set(['PAC', 'LLC', 'ECO', 'NOP', 'DBA', 'INC', 'II', 'III', 'IV', 'PC', 'LP', 'LLP', 'AFL', 'CIO', 'SEIU', 'NEA', 'NRA', 'USA', 'US', 'FL', 'GOP']);
function toTitle(s) {
  if (!s) return s;
  return s.toLowerCase().replace(/\b\w+/g, w =>
    CAPS_KEEP.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)
  );
}

function cleanSnippet(raw) {
  if (!raw) return null;
  const text = raw.replace(/<[^>]+>/g, '').trim();
  return text.length >= 30 ? text : null;
}

export async function loadCommittee(acctNum) {
  const db = getDb();
  const acct = String(acctNum);

  // ── 1. Main committee record ────────────────────────────────────────────────
  const { data: committeeRows, error } = await db
    .from('committees')
    .select('acct_num, committee_name, total_received, num_contributions, date_start, date_end, former_names, status, successor_acct_num, closed_date, source_url')
    .eq('acct_num', acct)
    .limit(1);

  const committee = committeeRows?.[0] ?? null;
  if (error || !committee) {
    throw new Error(`Committee not found: ${acct}`);
  }

  let formerNames = [];
  if (Array.isArray(committee.former_names)) {
    formerNames = committee.former_names;
  } else if (typeof committee.former_names === 'string') {
    try { formerNames = JSON.parse(committee.former_names); } catch {}
  }

  // ── 2. Top donors + solicitation + expenditures + meta + connections + yearly (parallel) ─
  const [{ data: topDonors }, { data: solic }, { data: expSummary }, { data: topVendors }, { data: newsRows }, { data: meta }, { data: connRows }, { data: yearRows }] = await Promise.all([
    db.from('committee_top_donors')
      .select('donor_name, donor_slug, total_amount, num_contributions, type')
      .eq('acct_num', acct)
      .order('total_amount', { ascending: false })
      .limit(25),
    db.from('committee_solicitations')
      .select('solicitation_id, solicitation_type, org_type, solicitors, website_url, solicitation_active, solicitation_file_date')
      .eq('acct_num', acct)
      .limit(1).then(r => ({ data: r.data?.[0] ?? null, error: r.error })),
    db.from('committee_expenditure_summary')
      .select('total_spent, num_expenditures, date_start, date_end')
      .eq('acct_num', acct)
      .limit(1).then(r => ({ data: r.data?.[0] ?? null, error: r.error })),
    db.from('committee_top_vendors')
      .select('vendor_name, vendor_name_normalized, vendor_canonical_slug, total_amount, num_payments, pct')
      .eq('acct_num', acct)
      .order('total_amount', { ascending: false })
      .limit(20),
    db.from('news_entity_articles')
      .select('article_title, article_url, article_outlet, article_published, article_snippet, source')
      .eq('entity_acct_num', acct)
      .order('article_published', { ascending: false })
      .limit(8),
    db.from('committee_meta')
      .select('treasurer_name, chair_name, address_line')
      .eq('acct_num', acct)
      .limit(1).then(r => ({ data: r.data?.[0] ?? null, error: r.error })),
    db.from('entity_connections')
      .select('shared_treasurer, shared_address, shared_chair')
      .or(`entity_a_acct.eq.${acct},entity_b_acct.eq.${acct}`)
      .limit(500),
    db.rpc('get_committee_by_year', { p_acct_num: acct }),
  ]);

  let solicitors = [];
  if (solic?.solicitors) {
    try { solicitors = JSON.parse(solic.solicitors); } catch {}
  }

  const connections = connRows || [];
  const sharedWith = {
    treasurer: connections.filter(c => c.shared_treasurer).length,
    address:   connections.filter(c => c.shared_address).length,
    chair:     connections.filter(c => c.shared_chair).length,
  };

  // ── Insight strip ──────────────────────────────────────────────────────────
  const { count: committeesAbove } = await db
    .from('committees')
    .select('*', { count: 'exact', head: true })
    .gt('total_received', parseFloat(committee.total_received) || 0);
  const committeeRank = (committeesAbove || 0) + 1;

  const top5Total = (topDonors || []).slice(0, 5).reduce((s, d) => s + (parseFloat(d.total_amount) || 0), 0);
  const totalRcvd = parseFloat(committee.total_received) || 0;
  const concPct = totalRcvd > 0 ? Math.round((top5Total / totalRcvd) * 100) : null;
  const totalConnections = sharedWith.treasurer + sharedWith.address + sharedWith.chair;

  const committeeInsights = [];
  if (committeeRank <= 2000) committeeInsights.push({ text: `#${committeeRank.toLocaleString()} committee by total received`, color: 'var(--green)' });
  if (concPct !== null && concPct >= 50) committeeInsights.push({ text: `Top 5 donors = ${concPct}% of total`, color: 'var(--gold)' });
  if (totalConnections > 0) committeeInsights.push({ text: `${totalConnections} committee connections`, color: 'var(--teal)' });
  if (formerNames.length > 0) committeeInsights.push({ text: `Formerly: ${formerNames[0]?.name || ''}`, color: 'var(--text-dim)' });
  if (committee.status === 'closed' || committee.closed_date) committeeInsights.push({ text: 'Closed committee', color: 'var(--republican)' });

  return {
    acct_num:         committee.acct_num,
    committee_name:   toTitle(committee.committee_name),
    former_names:     formerNames,
    status:           committee.status || null,
    successor_acct_num: committee.successor_acct_num || null,
    closed_date:      committee.closed_date || null,
    source_url:       committee.source_url || null,
    total_received:   parseFloat(committee.total_received)   || 0,
    num_contributions: committee.num_contributions            || 0,
    date_range: committee.date_start ? { earliest: committee.date_start, latest: committee.date_end } : null,
    top_donors: (topDonors || []).map(d => ({
      name:             d.donor_name,
      slug:             d.donor_slug,
      total_amount:     parseFloat(d.total_amount) || 0,
      num_contributions: d.num_contributions,
      type:             d.type,
    })),
    solicitation_id:       solic?.solicitation_id       ?? null,
    solicitation_active:   solic?.solicitation_active   ?? null,
    org_type:              solic?.org_type               ?? null,
    solicitation_file_date: solic?.solicitation_file_date ?? null,
    solicitors,
    website_url:           solic?.website_url || null,
    committee_meta: meta ? {
      treasurer_name: meta.treasurer_name || null,
      chair_name:     meta.chair_name     || null,
      address_line:   meta.address_line   || null,
    } : null,
    insights: committeeInsights,
    shared_with: sharedWith,
    news: (newsRows || []).map(n => ({
      title:     n.article_title,
      url:       n.article_url,
      outlet:    n.article_outlet,
      published: n.article_published,
      snippet:   cleanSnippet(n.article_snippet),
      source:    n.source,
    })),
    by_year: (yearRows || []).map(r => ({
      year: r.year,
      total: parseFloat(r.total) || 0,
      num_contributions: Number(r.num_contributions) || 0,
    })),
    expenditures: expSummary ? {
      total_spent:      parseFloat(expSummary.total_spent) || 0,
      num_expenditures: expSummary.num_expenditures || 0,
      date_range: {
        start: expSummary.date_start || null,
        end:   expSummary.date_end   || null,
      },
      top_vendors: (topVendors || []).map(v => ({
        vendor_name:            v.vendor_name,
        vendor_name_normalized: v.vendor_name_normalized,
        vendor_canonical_slug:  v.vendor_canonical_slug,
        total_amount:           parseFloat(v.total_amount) || 0,
        num_payments:           v.num_payments || 0,
        pct:                    parseFloat(v.pct) || 0,
      })),
    } : null,
  };
}

export async function listCommitteeAcctNums() {
  const db = getDb();
  const { data } = await db.from('committees').select('acct_num');
  return (data || []).map(d => d.acct_num);
}
