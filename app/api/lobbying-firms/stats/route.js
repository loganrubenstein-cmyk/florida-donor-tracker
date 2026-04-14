import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();

  const [{ data: summary }, { data: trend }] = await Promise.all([
    db.from('lobbying_firms')
      .select('total_comp, num_principals, num_years')
      .order('total_comp', { ascending: false })
      .limit(1000),
    db.from('lobbying_firm_quarters')
      .select('year, total_comp'),
  ]);

  const rows = summary || [];
  const totalComp = rows.reduce((s, r) => s + parseFloat(r.total_comp || 0), 0);
  const totalFirms = rows.length;
  const avgClients = totalFirms > 0
    ? Math.round(rows.reduce((s, r) => s + (r.num_principals || 0), 0) / totalFirms)
    : 0;

  // Annual totals from quarters
  const byYear = {};
  for (const q of (trend || [])) {
    const yr = String(q.year);
    if (!byYear[yr]) byYear[yr] = 0;
    byYear[yr] += parseFloat(q.total_comp || 0);
  }
  // Exclude incomplete current year (2026)
  delete byYear['2026'];

  const annualTrend = Object.entries(byYear)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, amount]) => ({ quarter: year, amount }));

  const peakEntry = annualTrend.reduce((best, cur) => cur.amount > (best?.amount || 0) ? cur : best, null);

  return NextResponse.json({
    totalComp,
    totalFirms,
    avgClients,
    peakYear: peakEntry?.quarter || null,
    peakComp: peakEntry?.amount || 0,
    annualTrend,
  });
}
