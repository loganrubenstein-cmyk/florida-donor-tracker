import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function clampDays(raw, fallback) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 365);
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'filings'; // filings | committees | cycle
  const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 50);

  const db = getDb();

  try {
    if (type === 'filings') {
      // Recent large contributions — last 90 days by contribution_date.
      // Uses a wide window since data refreshes are manual (6–14 days lag).
      const windowDays = clampDays(searchParams.get('days'), 90);
      const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const { data, error } = await db
        .from('contributions')
        .select('contributor_name, donor_slug, recipient_acct, amount, contribution_date, type_code')
        .gte('amount', 25000)
        .gte('contribution_date', cutoff)
        .not('contribution_date', 'is', null)
        .order('contribution_date', { ascending: false })
        .limit(limit);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const accts = [...new Set((data || []).map(r => r.recipient_acct).filter(Boolean))];
      const { data: committees } = accts.length
        ? await db.from('committees').select('acct_num, committee_name').in('acct_num', accts)
        : { data: [] };
      const nameMap = Object.fromEntries((committees || []).map(c => [c.acct_num, c.committee_name]));

      return NextResponse.json({
        type: 'filings',
        window_days: windowDays,
        latest_date: (data && data[0]?.contribution_date) || null,
        items: (data || []).map(r => ({
          donor_name:     r.contributor_name,
          donor_slug:     r.donor_slug,
          recipient_name: nameMap[r.recipient_acct] || null,
          acct_num:       r.recipient_acct,
          amount:         parseFloat(r.amount) || 0,
          date:           r.contribution_date,
          type:           r.type_code,
        })),
      });
    }

    if (type === 'candidates') {
      // New candidate filings: candidates.date_start within last N days.
      // date_start is the FL DoE candidate-record filing timestamp (populated
      // for ~67% of rows; current-cycle coverage is effectively 100%).
      const windowDays = clampDays(searchParams.get('days'), 60);
      const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const { data, error } = await db
        .from('candidates')
        .select('acct_num, candidate_name, election_year, office_desc, party_code, district, date_start, status_desc, total_combined')
        .gte('date_start', cutoff)
        .not('date_start', 'is', null)
        .order('date_start', { ascending: false })
        .limit(limit);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({
        type: 'candidates',
        window_days: windowDays,
        latest_date: (data && data[0]?.date_start) || null,
        items: (data || []).map(r => ({
          acct_num:      r.acct_num,
          name:          r.candidate_name,
          election_year: r.election_year,
          office:        r.office_desc,
          party:         r.party_code,
          district:      r.district,
          date_start:    r.date_start,
          status:        r.status_desc,
          total_combined: parseFloat(r.total_combined) || 0,
        })),
      });
    }

    if (type === 'committees') {
      // Committees registered in the current cycle (Jan 1 of current year onward).
      // Falls back to "newest by date_start" if no current-year rows exist.
      const cycleYear = new Date().getFullYear();
      const cutoff = `${cycleYear}-01-01`;

      const { data, error } = await db
        .from('committees')
        .select('acct_num, committee_name, date_start, total_received, num_contributions')
        .gte('date_start', cutoff)
        .order('date_start', { ascending: false })
        .not('date_start', 'is', null)
        .limit(limit);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({
        type: 'committees',
        cycle_year: cycleYear,
        latest_date: (data && data[0]?.date_start) || null,
        items: (data || []).map(r => ({
          acct_num:      r.acct_num,
          name:          r.committee_name,
          date_start:    r.date_start,
          total_received: parseFloat(r.total_received) || 0,
          num_contributions: r.num_contributions || 0,
        })),
      });
    }

    if (type === 'cycle') {
      // Top donors this cycle year — two-step: totals then names.
      // donor_by_year view can time out on large year sorts; degrade gracefully.
      const year = searchParams.get('year') || new Date().getFullYear();
      const { data: byYear, error } = await db
        .from('donor_by_year')
        .select('donor_slug, total')
        .eq('year', year)
        .not('donor_slug', 'is', null)
        .order('total', { ascending: false })
        .limit(limit);

      if (error) {
        return NextResponse.json({
          type: 'cycle',
          year,
          items: [],
          note: 'Cycle aggregation temporarily unavailable — try the full Donors directory.',
        });
      }

      const slugs = (byYear || []).map(r => r.donor_slug).filter(Boolean);
      const { data: donorRows } = slugs.length
        ? await db.from('donors').select('slug, name, is_corporate').in('slug', slugs)
        : { data: [] };
      const donorMap = Object.fromEntries((donorRows || []).map(d => [d.slug, d]));

      return NextResponse.json({
        type: 'cycle',
        year,
        items: (byYear || []).map(r => ({
          donor_slug:   r.donor_slug,
          name:         donorMap[r.donor_slug]?.name || r.donor_slug,
          is_corporate: donorMap[r.donor_slug]?.is_corporate || false,
          total:        parseFloat(r.total) || 0,
        })),
      });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
