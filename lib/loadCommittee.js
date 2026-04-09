// lib/loadCommittee.js — Supabase-backed committee profile loader
import { getDb } from '@/lib/db';

export async function loadCommittee(acctNum) {
  const db = getDb();
  const acct = String(acctNum);

  // ── 1. Main committee record ────────────────────────────────────────────────
  const { data: committee, error } = await db
    .from('committees')
    .select('acct_num, committee_name, total_received, num_contributions')
    .eq('acct_num', acct)
    .single();

  if (error || !committee) {
    throw new Error(`Committee not found: ${acct}`);
  }

  // ── 2. Top donors + solicitation (parallel) ────────────────────────────────
  const [{ data: topDonors }, { data: solic }] = await Promise.all([
    db.from('committee_top_donors')
      .select('donor_name, donor_slug, total_amount, num_contributions, type')
      .eq('acct_num', acct)
      .order('total_amount', { ascending: false })
      .limit(25),
    db.from('committee_solicitations')
      .select('solicitation_id, solicitation_type, org_type, solicitors, website_url, solicitation_active, solicitation_file_date')
      .eq('acct_num', acct)
      .maybeSingle(),
  ]);

  let solicitors = [];
  if (solic?.solicitors) {
    try { solicitors = JSON.parse(solic.solicitors); } catch {}
  }

  return {
    acct_num:         committee.acct_num,
    committee_name:   committee.committee_name,
    total_received:   parseFloat(committee.total_received)   || 0,
    num_contributions: committee.num_contributions            || 0,
    date_range:       null,
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
  };
}

export async function listCommitteeAcctNums() {
  const db = getDb();
  const { data } = await db.from('committees').select('acct_num');
  return (data || []).map(d => d.acct_num);
}
