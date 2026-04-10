import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();

  const { data, error } = await db
    .from('legislators')
    .select('chamber, party, total_raised, participation_rate')
    .eq('is_current', true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data || [];
  const total = rows.length;
  const totalRaised = rows.reduce((s, r) => s + (parseFloat(r.total_raised) || 0), 0);

  const byParty = {};
  const byChamber = { House: { count: 0, raised: 0 }, Senate: { count: 0, raised: 0 } };
  let partSum = 0, partCount = 0;

  for (const r of rows) {
    const p = r.party || 'Other';
    if (!byParty[p]) byParty[p] = { count: 0, raised: 0 };
    byParty[p].count += 1;
    byParty[p].raised += parseFloat(r.total_raised) || 0;

    const ch = r.chamber;
    if (byChamber[ch]) {
      byChamber[ch].count += 1;
      byChamber[ch].raised += parseFloat(r.total_raised) || 0;
    }

    if (r.participation_rate != null) {
      partSum += parseFloat(r.participation_rate);
      partCount += 1;
    }
  }

  return NextResponse.json({
    total,
    totalRaised,
    avgParticipation: partCount > 0 ? partSum / partCount : null,
    byParty,
    byChamber,
  });
}
