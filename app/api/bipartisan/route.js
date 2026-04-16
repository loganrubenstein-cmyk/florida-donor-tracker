import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const R_KW = ['REPUBLICAN', 'GOP', 'CONSERVATIVES FOR', 'TRUMP', 'MAGA'];
const D_KW = ['DEMOCRAT', 'PROGRESSIVE', 'SEIU', 'AFSCME', 'AFL-CIO', 'LABOR '];

function inferParty(name) {
  const u = (name || '').toUpperCase();
  if (R_KW.some(k => u.includes(k))) return 'REP';
  if (D_KW.some(k => u.includes(k))) return 'DEM';
  return null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug') || '';

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const db = getDb();

  const { data: donorRows } = await db
    .from('donors')
    .select('slug, name, total_combined')
    .eq('slug', slug)
    .limit(1);
  const donor = donorRows?.[0];
  if (!donor) return NextResponse.json({ error: 'Donor not found' }, { status: 404 });

  const [{ data: candContribs }, { data: commContribs }] = await Promise.all([
    db.from('donor_candidates')
      .select('acct_num, candidate_name, total, party_code')
      .eq('donor_slug', slug)
      .order('total', { ascending: false }),
    db.from('donor_committees')
      .select('acct_num, committee_name, total')
      .eq('donor_slug', slug)
      .order('total', { ascending: false }),
  ]);

  const buckets = { REP: 0, DEM: 0, NPA: 0, unknown: 0 };
  const repRecipients = [];
  const demRecipients = [];

  for (const c of candContribs || []) {
    const party = c.party_code || 'NPA';
    const amt   = parseFloat(c.total) || 0;
    if (party === 'REP') {
      buckets.REP += amt;
      repRecipients.push({ name: c.candidate_name, acct_num: c.acct_num, total: amt, type: 'candidate' });
    } else if (party === 'DEM') {
      buckets.DEM += amt;
      demRecipients.push({ name: c.candidate_name, acct_num: c.acct_num, total: amt, type: 'candidate' });
    } else {
      buckets.NPA += amt;
    }
  }

  for (const c of commContribs || []) {
    const party = inferParty(c.committee_name);
    const amt   = parseFloat(c.total) || 0;
    if (party === 'REP') {
      buckets.REP += amt;
      repRecipients.push({ name: c.committee_name, acct_num: c.acct_num, total: amt, type: 'committee' });
    } else if (party === 'DEM') {
      buckets.DEM += amt;
      demRecipients.push({ name: c.committee_name, acct_num: c.acct_num, total: amt, type: 'committee' });
    } else {
      buckets.unknown += amt;
    }
  }

  repRecipients.sort((a, b) => b.total - a.total);
  demRecipients.sort((a, b) => b.total - a.total);

  const grandTotal = Object.values(buckets).reduce((s, v) => s + v, 0);
  const repPct = grandTotal > 0 ? (buckets.REP / grandTotal * 100).toFixed(1) : '0.0';
  const demPct = grandTotal > 0 ? (buckets.DEM / grandTotal * 100).toFixed(1) : '0.0';

  return NextResponse.json({
    donor,
    buckets,
    repPct,
    demPct,
    repRecipients: repRecipients.slice(0, 20),
    demRecipients: demRecipients.slice(0, 20),
  });
}
