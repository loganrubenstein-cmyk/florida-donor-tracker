import { getDb } from '@/lib/db';

export async function loadLegislativeCommittee(abbreviation) {
  const db = getDb();

  const [{ data: committee }, { data: memberRows }] = await Promise.all([
    db.from('legislative_committees')
      .select('abbreviation, name, chamber, url, scraped_at')
      .eq('abbreviation', abbreviation)
      .limit(1)
      .then(r => ({ data: r.data?.[0] ?? null, error: r.error })),

    db.from('committee_memberships')
      .select('role, people_id, legislators(people_id, display_name, party, district, total_raised, acct_num, leadership_title)')
      .eq('abbreviation', abbreviation),
  ]);

  if (!committee) return null;

  const ROLE_ORDER = { Chair: 0, 'Vice Chair': 1, 'Ranking Member': 2, Member: 3 };
  const members = (memberRows || []).sort((a, b) => {
    const ra = ROLE_ORDER[a.role] ?? 9;
    const rb = ROLE_ORDER[b.role] ?? 9;
    return ra !== rb ? ra - rb : (a.legislators?.display_name || '').localeCompare(b.legislators?.display_name || '');
  });

  const totalRaised = members.reduce((s, m) => s + (parseFloat(m.legislators?.total_raised) || 0), 0);
  const partyBreak = {};
  for (const m of members) {
    const p = m.legislators?.party || 'Other';
    partyBreak[p] = (partyBreak[p] || 0) + 1;
  }

  const acctNums = members.map(m => m.legislators?.acct_num).filter(Boolean);
  let topDonors = [];
  let industryBreakdown = [];

  if (acctNums.length > 0) {
    const [{ data: donorRows }, { data: industryRows }] = await Promise.all([
      db.from('candidate_top_donors')
        .select('donor_name, donor_slug, total_amount, num_contributions, acct_num')
        .in('acct_num', acctNums),
      db.from('industry_by_committee')
        .select('industry, total')
        .in('acct_num', acctNums),
    ]);

    const donorMap = {};
    for (const row of (donorRows || [])) {
      const key = row.donor_name;
      if (!donorMap[key]) {
        donorMap[key] = {
          donor_name: row.donor_name,
          donor_slug: row.donor_slug,
          total_amount: 0,
          num_contributions: 0,
          num_recipients: 0,
        };
      }
      donorMap[key].total_amount += parseFloat(row.total_amount) || 0;
      donorMap[key].num_contributions += row.num_contributions || 0;
      donorMap[key].num_recipients += 1;
    }
    topDonors = Object.values(donorMap)
      .sort((a, b) => b.total_amount - a.total_amount)
      .slice(0, 10);

    const indMap = {};
    for (const row of (industryRows || [])) {
      const ind = row.industry || 'Other';
      indMap[ind] = (indMap[ind] || 0) + (parseFloat(row.total) || 0);
    }
    const indTotal = Object.values(indMap).reduce((s, v) => s + v, 0);
    industryBreakdown = Object.entries(indMap)
      .sort(([, a], [, b]) => b - a)
      .map(([industry, total]) => ({
        industry,
        total,
        pct: indTotal > 0 ? (total / indTotal) * 100 : 0,
      }));
  }

  return { committee, members, totalRaised, partyBreak, topDonors, industryBreakdown };
}

export async function loadCommitteesDirectory() {
  const db = getDb();

  const [{ data: committees }] = await Promise.all([
    db.from('legislative_committees')
      .select('abbreviation, name, chamber, url')
      .order('chamber', { ascending: true })
      .order('name', { ascending: true }),
  ]);

  if (!committees) return { house: [], senate: [] };

  // For each committee get member count + chair + total raised via a single query
  const { data: memberRows } = await db
    .from('committee_memberships')
    .select('abbreviation, role, legislators(display_name, party, total_raised)');

  // Build a map of abbreviation → stats
  const statsMap = {};
  for (const row of (memberRows || [])) {
    const abbr = row.abbreviation;
    if (!statsMap[abbr]) {
      statsMap[abbr] = { member_count: 0, total_raised: 0, chair_name: null, chair_party: null };
    }
    statsMap[abbr].member_count += 1;
    statsMap[abbr].total_raised += parseFloat(row.legislators?.total_raised) || 0;
    if (row.role === 'Chair' && row.legislators?.display_name) {
      statsMap[abbr].chair_name = row.legislators.display_name;
      statsMap[abbr].chair_party = row.legislators.party;
    }
  }

  const enriched = committees.map(c => ({ ...c, ...(statsMap[c.abbreviation] || {}) }));
  return {
    house:  enriched.filter(c => c.chamber === 'House'),
    senate: enriched.filter(c => c.chamber === 'Senate'),
  };
}
