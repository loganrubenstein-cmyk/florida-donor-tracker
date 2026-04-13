import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const chamber = searchParams.get('chamber') || 'House';
  const district = searchParams.get('district');

  if (!district) return NextResponse.json({ error: 'Provide ?district=' }, { status: 400 });

  const num = parseInt(district, 10);
  if (isNaN(num)) return NextResponse.json({ error: 'Invalid district number' }, { status: 400 });

  const validChamber = chamber === 'Senate' ? 'Senate' : 'House';
  const maxDistrict = validChamber === 'Senate' ? 40 : 120;
  if (num < 1 || num > maxDistrict) {
    return NextResponse.json({ error: `${validChamber} districts range 1–${maxDistrict}` }, { status: 400 });
  }

  const db = getDb();

  // Get the legislator for this district
  const { data: legislator, error: legErr } = await db
    .from('legislators')
    .select('people_id, display_name, chamber, district, party, total_raised, acct_num, counties, leadership_title, term_limit_year, votes_yea, votes_nay, votes_nv, votes_absent, participation_rate, email, twitter')
    .eq('chamber', validChamber)
    .eq('district', num)
    .eq('is_current', true)
    .maybeSingle();

  if (legErr) return NextResponse.json({ error: legErr.message }, { status: 500 });
  if (!legislator) return NextResponse.json({ error: 'No current legislator found for this district' }, { status: 404 });

  // Parallel queries for donor data, chamber averages, and recent votes
  const [
    { data: topDonors },
    { data: avgRows },
    { data: recentVotes },
  ] = await Promise.all([
    // Top donors for this legislator's campaign account
    legislator.acct_num
      ? db.from('candidate_top_donors')
          .select('donor_name, donor_slug, total_amount, num_contributions, type')
          .eq('acct_num', legislator.acct_num)
          .order('total_amount', { ascending: false })
          .limit(15)
      : Promise.resolve({ data: [] }),
    // All legislators in same chamber for average computation
    db.from('legislators')
      .select('total_raised')
      .eq('chamber', validChamber)
      .eq('is_current', true)
      .gt('total_raised', 0),
    // Recent votes
    db.from('legislator_votes')
      .select('bill_number, bill_title, vote_text, vote_date')
      .eq('people_id', legislator.people_id)
      .order('vote_date', { ascending: false })
      .limit(10),
  ]);

  let chamberAvgRaised = 0;
  let chamberMedian = 0;
  if (avgRows && avgRows.length > 0) {
    const vals = avgRows.map(r => parseFloat(r.total_raised)).sort((a, b) => a - b);
    chamberAvgRaised = vals.reduce((s, v) => s + v, 0) / vals.length;
    chamberMedian = vals[Math.floor(vals.length / 2)];
  }

  const totalRaised = parseFloat(legislator.total_raised) || 0;
  const pctOfAvg = chamberAvgRaised > 0 ? Math.round((totalRaised / chamberAvgRaised) * 100) : 0;

  // Donor type breakdown from top donors
  const donors = topDonors || [];
  const typeBreakdown = {};
  for (const d of donors) {
    const t = d.type || 'unknown';
    typeBreakdown[t] = (typeBreakdown[t] || 0) + parseFloat(d.total_amount || 0);
  }

  return NextResponse.json({
    legislator: {
      people_id: legislator.people_id,
      name: legislator.display_name,
      chamber: legislator.chamber,
      district: legislator.district,
      party: legislator.party,
      total_raised: totalRaised,
      counties: legislator.counties || [],
      leadership: legislator.leadership_title || null,
      term_limit_year: legislator.term_limit_year || null,
      acct_num: legislator.acct_num || null,
      email: legislator.email || null,
      twitter: legislator.twitter || null,
      voting: {
        yea: legislator.votes_yea || 0,
        nay: legislator.votes_nay || 0,
        nv: legislator.votes_nv || 0,
        absent: legislator.votes_absent || 0,
        participation: parseFloat(legislator.participation_rate) || 0,
      },
    },
    top_donors: donors.map(d => ({
      name: d.donor_name,
      slug: d.donor_slug,
      amount: parseFloat(d.total_amount) || 0,
      count: d.num_contributions || 0,
      type: d.type || 'unknown',
    })),
    donor_type_breakdown: typeBreakdown,
    comparison: {
      chamber_avg: Math.round(chamberAvgRaised),
      chamber_median: Math.round(chamberMedian),
      pct_of_avg: pctOfAvg,
    },
    recent_votes: (recentVotes || []).map(v => ({
      bill: v.bill_number,
      title: v.bill_title,
      vote: v.vote_text,
      date: v.vote_date,
    })),
  });
}
