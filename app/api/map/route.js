import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Aggregates donor totals by location using donors.top_location
// Much faster than scanning contributions — donors table is ~883K rows vs 10M+

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const view = searchParams.get('view') || 'cities'; // cities | states | instateout

  const db = getDb();

  if (view === 'cities') {
    const { data, error } = await db.rpc('get_donor_city_totals');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      view: 'cities',
      items: (data || []).map(r => ({
        city:        r.city?.trim().toUpperCase() || '',
        total:       parseFloat(r.total) || 0,
        donor_count: parseInt(r.donor_count) || 0,
      })),
    });
  }

  if (view === 'states') {
    const { data, error } = await db.rpc('get_donor_state_totals');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      view: 'states',
      items: (data || []).map(r => ({
        state:       r.state || '',
        total:       parseFloat(r.total) || 0,
        donor_count: parseInt(r.donor_count) || 0,
      })),
    });
  }

  if (view === 'instateout') {
    const { data, error } = await db.rpc('get_donor_instate_totals');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const r = data?.[0] || {};
    const inState  = parseFloat(r.in_state)  || 0;
    const outState = parseFloat(r.out_state) || 0;
    const total    = inState + outState;
    return NextResponse.json({
      view: 'instateout',
      in_state:      inState,
      out_state:     outState,
      in_count:      parseInt(r.in_count)  || 0,
      out_count:     parseInt(r.out_count) || 0,
      total,
      in_state_pct:  total > 0 ? Math.round((inState  / total) * 100) : 0,
      out_state_pct: total > 0 ? Math.round((outState / total) * 100) : 0,
    });
  }

  return NextResponse.json({ error: 'Unknown view' }, { status: 400 });
}
