// lib/loadCandidate.js — Supabase-backed candidate profile loader
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getDb } from '@/lib/db';
import { FEDERAL_OFFICE_CODES } from '@/lib/officeCodes';

function cleanSnippet(raw) {
  if (!raw) return null;
  const text = raw.replace(/<[^>]+>/g, '').trim();
  return text.length >= 30 ? text : null;
}

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
    .select('acct_num, candidate_name, election_id, election_year, office_code, office_desc, party_code, district, status_desc, hard_money_total, hard_corporate_total, hard_individual_total, hard_num_contributions, soft_money_total, total_combined, num_linked_pcs, date_start, date_end')
    .eq('acct_num', String(acctNum))
    .maybeSingle();

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
  // Two separate queries — candidate_pc_links has no FK to committees in Supabase schema,
  // so the PostgREST join syntax fails silently. Fetch links then look up committees by acct_num.
  const { data: pcLinksRaw } = await db
    .from('candidate_pc_links_v')
    .select('pc_acct_num, pc_name, pc_type, link_type, confidence_tier, is_candidate_specific')
    .eq('candidate_acct_num', String(acctNum));

  const pcAcctNums = (pcLinksRaw || []).map(pc => pc.pc_acct_num).filter(Boolean);
  const { data: pcCommitteeRows } = pcAcctNums.length > 0
    ? await db.from('committees').select('acct_num, total_received, num_contributions').in('acct_num', pcAcctNums)
    : { data: [] };

  const _pcCommitteeMap = {};
  for (const c of pcCommitteeRows || []) {
    if (c && c.acct_num) _pcCommitteeMap[c.acct_num] = c;
  }

  // ── 5. Shadow orgs linked to this candidate ────────────────────────────────
  // shadow_orgs.matched_candidates is pipe-separated candidate names
  // Table may not exist yet (created by script 93) — fail silently.
  const candidateName = candidate.candidate_name || '';
  let shadowOrgsRaw = [];
  try {
    const { data: _shadow } = await db
      .from('shadow_orgs')
      .select('org_name, org_slug, stub_type, irs_ein, pp_total_revenue, pp_total_expenses, pp_filing_year, pp_url, num_candidates, match_method')
      .ilike('matched_candidates', `%${candidateName}%`)
      .order('pp_total_revenue', { ascending: false, nullsFirst: false })
      .limit(10);
    shadowOrgsRaw = _shadow || [];
  } catch (_) { /* table not yet created — skip */ }

  // ── 6. Expenditure summary + top vendors + news ─────────────────────────────
  const [{ data: expSummary }, { data: topVendors }, { data: newsRows }] = await Promise.all([
    db.from('candidate_expenditure_summary')
      .select('total_spent, num_expenditures, date_start, date_end')
      .eq('acct_num', String(acctNum))
      .maybeSingle(),
    db.from('candidate_top_vendors')
      .select('vendor_name, vendor_name_normalized, total_amount, num_payments, pct')
      .eq('acct_num', String(acctNum))
      .order('total_amount', { ascending: false })
      .limit(20),
    db.from('news_entity_articles')
      .select('article_title, article_url, article_outlet, article_published, article_snippet, source')
      .eq('entity_acct_num', String(acctNum))
      .order('article_published', { ascending: false })
      .limit(8),
  ]);

  const linkedPcs = (pcLinksRaw || []).map(pc => ({
    pc_acct:               pc.pc_acct_num,
    pc_name:               pc.pc_name,
    pc_type:               pc.pc_type,
    link_type:             pc.link_type,
    confidence_tier:       pc.confidence_tier       || 'possible',
    is_candidate_specific: pc.is_candidate_specific ?? false,
    signal_evidence:       '',
    total_received:        _pcCommitteeMap[pc.pc_acct_num]?.total_received   ?? null,
    num_contributions:     _pcCommitteeMap[pc.pc_acct_num]?.num_contributions ?? 0,
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
      date_range: candidate.date_start ? { earliest: candidate.date_start, latest: candidate.date_end } : null,
    },
    linked_pcs: linkedPcs,
    shadow_orgs: (shadowOrgsRaw || []).map(s => ({
      org_name:          s.org_name,
      org_slug:          s.org_slug,
      stub_type:         s.stub_type,
      irs_ein:           s.irs_ein,
      pp_total_revenue:  s.pp_total_revenue ? parseFloat(s.pp_total_revenue) : null,
      pp_total_expenses: s.pp_total_expenses ? parseFloat(s.pp_total_expenses) : null,
      pp_filing_year:    s.pp_filing_year,
      pp_url:            s.pp_url,
      num_candidates:    s.num_candidates || 0,
      match_method:      s.match_method,
    })),
    news: (newsRows || []).map(n => ({
      title:     n.article_title,
      url:       n.article_url,
      outlet:    n.article_outlet,
      published: n.article_published,
      snippet:   cleanSnippet(n.article_snippet),
      source:    n.source,
    })),
    expenditures: {
      total_spent:      parseFloat(expSummary?.total_spent)      || 0,
      num_expenditures: expSummary?.num_expenditures             || 0,
      date_start:       expSummary?.date_start                   || null,
      date_end:         expSummary?.date_end                     || null,
      top_vendors:      (topVendors || []).map(v => ({
        vendor_name:            v.vendor_name,
        vendor_name_normalized: v.vendor_name_normalized,
        total_amount:           parseFloat(v.total_amount) || 0,
        num_payments:           v.num_payments || 0,
        pct:                    parseFloat(v.pct) || 0,
      })),
    },
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

// ── Politician (multi-cycle canonical) helpers ─────────────────────────────

let _politicianSlugMap = null;
function getPoliticianSlugMap() {
  if (_politicianSlugMap) return _politicianSlugMap;
  const idx = getCyclesIndex();
  const by_name = idx.by_name || {};
  const map = {};
  for (const [name, cycles] of Object.entries(by_name)) {
    // Skip if ALL cycles for this politician are federal offices
    const stateCycles = cycles.filter(c => !FEDERAL_OFFICE_CODES.has((c.office_code || '').toUpperCase()));
    if (stateCycles.length === 0) continue;

    // Normalize trailing punctuation so "JR." and "JR" map to same slug
    const normalized = name.replace(/\.\s*$/, '').trim();
    const slug = normalized
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      .slice(0, 120);
    if (map[slug]) {
      // Merge cycles — same person, different name spellings (state cycles only)
      const seen = new Set(map[slug].cycles.map(c => c.acct_num));
      for (const c of stateCycles) {
        if (!seen.has(c.acct_num)) map[slug].cycles.push(c);
      }
    } else {
      map[slug] = { display_name: normalized, cycles: [...stateCycles] };
    }
  }
  _politicianSlugMap = map;
  return map;
}

/** Returns {display_name, cycles} for a politician slug, or null if not found */
export function getPoliticianBySlug(slug) {
  const map = getPoliticianSlugMap();
  return map[slug] ?? null;
}

/** All politician slugs — used by generateStaticParams */
export function listPoliticianSlugs() {
  return Object.keys(getPoliticianSlugMap());
}

/** Returns the politician slug for a given FL DoE acct_num, or null if not found */
export function getPoliticianSlugByAcctNum(acctNum) {
  const map = getPoliticianSlugMap();
  const target = String(acctNum);
  for (const [slug, politician] of Object.entries(map)) {
    if (politician.cycles.some(c => String(c.acct_num) === target)) return slug;
  }
  return null;
}
