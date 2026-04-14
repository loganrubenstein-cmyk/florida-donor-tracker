import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();

  const [{ data: summary }, { data: industries }] = await Promise.all([
    db.from('principal_influence_index')
      .select('donation_total, total_lobby_comp, total_influence')
      .gt('total_influence', 100000),
    db.from('principal_influence_index')
      .select('industry')
      .gt('total_influence', 100000)
      .not('industry', 'is', null),
  ]);

  const rows = summary || [];
  const totalOrgs       = rows.length;
  const totalDonations  = rows.reduce((s, r) => s + parseFloat(r.donation_total  || 0), 0);
  const totalLobbying   = rows.reduce((s, r) => s + parseFloat(r.total_lobby_comp || 0), 0);
  const totalInfluence  = totalDonations + totalLobbying;

  // Industry counts
  const industryCounts = {};
  for (const r of industries || []) {
    if (r.industry) industryCounts[r.industry] = (industryCounts[r.industry] || 0) + 1;
  }
  const industryList = Object.entries(industryCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([industry, count]) => ({ industry, count }));

  return NextResponse.json({
    totalOrgs,
    totalDonations,
    totalLobbying,
    totalInfluence,
    industryList,
  });
}
