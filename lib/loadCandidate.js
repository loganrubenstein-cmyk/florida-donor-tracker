// lib/loadCandidate.js — Supabase-backed candidate profile loader
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getDb } from '@/lib/db';

// candidate_cycles.json stays as static file (built from public/data/candidates/)
// It's only 1.6 MB and doesn't need live updates
const CYCLES_FILE = join(process.cwd(), 'public', 'data', 'candidate_cycles.json');

let _cyclesCache = null;
function getCyclesIndex() {
  if (_cyclesCache) return _cyclesCache;
  try {
    if (existsSync(CYCLES_FILE)) {
      _cyclesCache = JSON.parse(readFileSync(CYCLES_FILE, 'utf-8'));
    }
  } catch {}
  return _cyclesCache || {};
}

export async function loadCandidate(acctNum) {
  const db = getDb();

  // ── 1. Main candidate record ────────────────────────────────────────────────
  const { data: candidate, error } = await db
    .from('candidates')
    .select('acct_num, candidate_name, election_id, election_year, office_code, office_desc, party_code, district, status_desc, hard_money_total, hard_corporate_total, hard_individual_total, hard_num_contributions, soft_money_total, total_combined, num_linked_pcs')
    .eq('acct_num', String(acctNum))
    .single();

  if (error || !candidate) {
    throw new Error(`Candidate not found: ${acctNum}`);
  }

  // ── 2. Top donors ───────────────────────────────────────────────────────────
  const { data: topDonors } = await db
    .from('candidate_top_donors')
    .select('donor_name, donor_slug, total_amount, num_contributions, type, occupation')
    .eq('acct_num', String(acctNum))
    .order('total_amount', { ascending: false })
    .limit(25);

  // ── 3. Quarterly fundraising chart data ─────────────────────────────────────
  const { data: quarterly } = await db
    .from('candidate_quarterly')
    .select('quarter, amount')
    .eq('acct_num', String(acctNum))
    .order('quarter', { ascending: true });

  // ── 4. Linked PCs (soft money committees) ──────────────────────────────────
  const { data: pcLinks } = await db
    .from('candidate_pc_links')
    .select('pc_acct_num, pc_name, pc_type, link_type, committees(total_received, num_contributions)')
    .eq('candidate_acct_num', String(acctNum));

  const linkedPcs = (pcLinks || []).map(pc => ({
    pc_acct:          pc.pc_acct_num,
    pc_name:          pc.pc_name,
    pc_type:          pc.pc_type,
    link_type:        pc.link_type,
    total_received:   pc.committees?.total_received   ?? null,
    num_contributions: pc.committees?.num_contributions ?? 0,
  }));

  // ── Assemble into the shape CandidateProfile expects ───────────────────────
  const donors = (topDonors || []).map(d => ({
    name:             d.donor_name,
    slug:             d.donor_slug,
    total_amount:     parseFloat(d.total_amount) || 0,
    num_contributions: d.num_contributions,
    type:             d.type,
    occupation:       d.occupation,
  }));

  const byQuarter = (quarterly || []).map(q => ({
    quarter: q.quarter,
    amount:  parseFloat(q.amount) || 0,
  }));

  return {
    acct_num:       candidate.acct_num,
    candidate_name: candidate.candidate_name,
    election_id:    candidate.election_id,
    election_year:  candidate.election_year,
    office_code:    candidate.office_code,
    office_desc:    candidate.office_desc,
    party_code:     candidate.party_code,
    district:       candidate.district,
    status_desc:    candidate.status_desc,
    soft_money_total: parseFloat(candidate.soft_money_total) || 0,
    total_combined:   parseFloat(candidate.total_combined)   || 0,
    hard_money: {
      total:             parseFloat(candidate.hard_money_total)      || 0,
      individual_total:  parseFloat(candidate.hard_individual_total) || 0,
      corporate_total:   parseFloat(candidate.hard_corporate_total)  || 0,
      num_contributions: candidate.hard_num_contributions            || 0,
      by_quarter:        byQuarter,
      top_donors:        donors,
      date_range:        null, // not stored in Supabase — derived from quarterly if needed
    },
    linked_pcs: linkedPcs,
  };
}

/** Returns related election appearances for the cycle pill bar */
export function loadCandidateCycles(acctNum) {
  const idx = getCyclesIndex();
  return idx.by_acct?.[String(acctNum)] ?? [];
}

/** Used by generateStaticParams for legislator pages (terminal 2) */
export async function listCandidateAcctNums() {
  const db = getDb();
  const { data } = await db.from('candidates').select('acct_num');
  return (data || []).map(d => d.acct_num);
}
