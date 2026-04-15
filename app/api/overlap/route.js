import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const TYPE_MAP = { CHE: 'individual', INK: 'corporate', CAS: 'individual', LOA: 'corporate', OTH: 'unknown' };
function normalizeType(t) {
  if (!t) return 'unknown';
  return TYPE_MAP[t] || t;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const q = searchParams.get('q') || '';
  if (q.trim()) {
    const db = getDb();
    const [{ data: candidates }, { data: committees }] = await Promise.all([
      db.from('candidates')
        .select('acct_num, candidate_name, office_desc, election_year, party_code')
        .ilike('candidate_name', `%${q.trim()}%`)
        .order('election_year', { ascending: false })
        .limit(10),
      db.from('committees')
        .select('acct_num, committee_name, total_received')
        .ilike('committee_name', `%${q.trim()}%`)
        .order('total_received', { ascending: false })
        .limit(10),
    ]);
    return NextResponse.json({
      results: [
        ...(candidates || []).map(c => ({
          acct_num: c.acct_num,
          name: c.candidate_name,
          type: 'candidate',
          detail: [c.office_desc, c.election_year, c.party_code].filter(Boolean).join(' · '),
        })),
        ...(committees || []).map(c => ({
          acct_num: c.acct_num,
          name: c.committee_name,
          type: 'committee',
          detail: c.total_received ? `$${(c.total_received / 1e6).toFixed(1)}M raised` : '',
        })),
      ],
    });
  }

  const acctA = searchParams.get('a');
  const acctB = searchParams.get('b');
  if (!acctA || !acctB) {
    return NextResponse.json({ error: 'Provide ?a= and ?b= (account numbers) or ?q= to search' }, { status: 400 });
  }

  const db = getDb();

  async function getDonors(acct) {
    let { data } = await db.from('candidate_top_donors')
      .select('donor_name, donor_slug, total_amount, num_contributions, type')
      .eq('acct_num', acct)
      .order('total_amount', { ascending: false });
    if (data && data.length > 0) return { donors: data, source: 'candidate' };

    ({ data } = await db.from('committee_top_donors')
      .select('donor_name, donor_slug, total_amount, num_contributions, type')
      .eq('acct_num', acct)
      .order('total_amount', { ascending: false }));
    return { donors: data || [], source: 'committee' };
  }

  async function getEntityName(acct) {
    const { data: cand } = await db.from('candidates')
      .select('candidate_name')
      .eq('acct_num', acct)
      .maybeSingle();
    if (cand) return { name: cand.candidate_name, type: 'candidate' };

    const { data: comm } = await db.from('committees')
      .select('committee_name')
      .eq('acct_num', acct)
      .maybeSingle();
    if (comm) return { name: comm.committee_name, type: 'committee' };
    return { name: acct, type: 'unknown' };
  }

  const [donorsA, donorsB, entityA, entityB] = await Promise.all([
    getDonors(acctA),
    getDonors(acctB),
    getEntityName(acctA),
    getEntityName(acctB),
  ]);

  const mapA = new Map();
  for (const d of donorsA.donors) {
    if (d.donor_slug) mapA.set(d.donor_slug, d);
  }
  const mapB = new Map();
  for (const d of donorsB.donors) {
    if (d.donor_slug) mapB.set(d.donor_slug, d);
  }

  const overlap = [];
  for (const [slug, dA] of mapA) {
    if (mapB.has(slug)) {
      const dB = mapB.get(slug);
      overlap.push({
        name: dA.donor_name,
        slug,
        type: normalizeType(dA.type),
        amount_a: parseFloat(dA.total_amount) || 0,
        amount_b: parseFloat(dB.total_amount) || 0,
        total: (parseFloat(dA.total_amount) || 0) + (parseFloat(dB.total_amount) || 0),
      });
    }
  }
  overlap.sort((a, b) => b.total - a.total);

  const totalOverlap = overlap.reduce((s, d) => s + d.total, 0);
  const totalA = donorsA.donors.reduce((s, d) => s + (parseFloat(d.total_amount) || 0), 0);
  const totalB = donorsB.donors.reduce((s, d) => s + (parseFloat(d.total_amount) || 0), 0);

  const typeBreakdown = {};
  for (const d of overlap) {
    const t = d.type;
    typeBreakdown[t] = (typeBreakdown[t] || 0) + d.total;
  }

  return NextResponse.json({
    entity_a: { acct_num: acctA, ...entityA },
    entity_b: { acct_num: acctB, ...entityB },
    summary: {
      overlap_count: overlap.length,
      total_overlap_amount: totalOverlap,
      donors_a: donorsA.donors.length,
      donors_b: donorsB.donors.length,
      overlap_pct_a: totalA > 0 ? Math.round((totalOverlap / totalA) * 1000) / 10 : 0,
      overlap_pct_b: totalB > 0 ? Math.round((totalOverlap / totalB) * 1000) / 10 : 0,
    },
    type_breakdown: typeBreakdown,
    shared_donors: overlap.slice(0, 50),
  });
}
