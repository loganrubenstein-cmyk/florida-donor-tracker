import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'filings'; // filings | committees | cycle
  const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 50);

  const db = getDb();

  try {
    if (type === 'filings') {
      // Recent large contributions
      const { data, error } = await db
        .from('contributions')
        .select('contributor_name, donor_slug, recipient_acct, amount, contribution_date, type_code')
        .gte('amount', 25000)
        .not('contribution_date', 'is', null)
        .order('contribution_date', { ascending: false })
        .limit(limit);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Fetch committee names for these recipient accounts
      const accts = [...new Set((data || []).map(r => r.recipient_acct).filter(Boolean))];
      const { data: committees } = accts.length
        ? await db.from('committees').select('acct_num, committee_name').in('acct_num', accts)
        : { data: [] };
      const nameMap = Object.fromEntries((committees || []).map(c => [c.acct_num, c.committee_name]));

      return NextResponse.json({
        type: 'filings',
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

    if (type === 'committees') {
      // Recently registered committees
      const { data, error } = await db
        .from('committees')
        .select('acct_num, committee_name, date_start, total_received, num_contributions')
        .order('date_start', { ascending: false })
        .not('date_start', 'is', null)
        .limit(limit);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({
        type: 'committees',
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
      // Top donors this cycle year
      const year = searchParams.get('year') || new Date().getFullYear();
      const { data, error } = await db
        .from('donor_by_year')
        .select('donor_slug, year, total, donors(name, is_corporate)')
        .eq('year', year)
        .order('total', { ascending: false })
        .limit(limit);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      return NextResponse.json({
        type: 'cycle',
        year,
        items: (data || []).map(r => ({
          donor_slug: r.donor_slug,
          name:       r.donors?.name || r.donor_slug,
          is_corporate: r.donors?.is_corporate || false,
          total:      parseFloat(r.total) || 0,
        })),
      });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
