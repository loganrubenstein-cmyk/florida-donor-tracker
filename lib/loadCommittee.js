// lib/loadCommittee.js — Supabase-backed committee profile loader
import { getDb } from '@/lib/db';

export async function loadCommittee(acctNum) {
  const db = getDb();
  const acct = String(acctNum);

  // ── 1. Main committee record ────────────────────────────────────────────────
  const { data: committee, error } = await db
    .from('committees')
    .select('acct_num, committee_name, total_received, num_contributions, date_start, date_end')
    .eq('acct_num', acct)
    .single();

  if (error || !committee) {
    throw new Error(`Committee not found: ${acct}`);
  }

  // ── 2. Top donors + solicitation + expenditures + meta + connections (parallel) ─
  const [{ data: topDonors }, { data: solic }, { data: expSummary }, { data: topVendors }, { data: newsRows }, { data: meta }, { data: connRows }] = await Promise.all([
    db.from('committee_top_donors')
      .select('donor_name, donor_slug, total_amount, num_contributions, type')
      .eq('acct_num', acct)
      .order('total_amount', { ascending: false })
      .limit(25),
    db.from('committee_solicitations')
      .select('solicitation_id, solicitation_type, org_type, solicitors, website_url, solicitation_active, solicitation_file_date')
      .eq('acct_num', acct)
      .maybeSingle(),
    db.from('committee_expenditure_summary')
      .select('total_spent, num_expenditures, date_start, date_end')
      .eq('acct_num', acct)
      .maybeSingle(),
    db.from('committee_top_vendors')
      .select('vendor_name, vendor_name_normalized, total_amount, num_payments, pct')
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
      .maybeSingle(),
    db.from('entity_connections')
      .select('shared_treasurer, shared_address, shared_chair')
      .or(`entity_a_acct.eq.${acct},entity_b_acct.eq.${acct}`)
      .limit(500),
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

  return {
    acct_num:         committee.acct_num,
    committee_name:   committee.committee_name,
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
    shared_with: sharedWith,
    news: (newsRows || []).map(n => ({
      title:     n.article_title,
      url:       n.article_url,
      outlet:    n.article_outlet,
      published: n.article_published,
      snippet:   n.article_snippet,
      source:    n.source,
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
