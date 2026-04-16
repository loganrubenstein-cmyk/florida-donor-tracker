import { getDb } from '@/lib/db';

export async function loadLegislator(peopleId) {
  const db = getDb();
  const id = parseInt(peopleId, 10);

  const [
    { data: legislator },
    { data: memberships },
    { data: votes },
    { data: sponsorships },
    { data: topDonors },
    { data: disclosureRaw },
  ] = await Promise.all([
    db.from('legislators').select('*').eq('people_id', id).limit(1).then(r => ({ data: r.data?.[0] ?? null, error: r.error })),

    db.from('committee_memberships')
      .select('abbreviation, role, legislative_committees(name, chamber)')
      .eq('people_id', id)
      .order('role', { ascending: true }),

    db.from('legislator_votes')
      .select('bill_id, bill_number, bill_title, vote_text, vote_date, roll_call_id, session_id')
      .eq('people_id', id)
      .order('vote_date', { ascending: false, nullsFirst: false })
      .limit(100),

    db.from('bill_sponsorships')
      .select('bill_id, bill_number, bill_title, sponsor_type, session_id')
      .eq('people_id', id)
      .order('sponsor_type', { ascending: true })
      .limit(50),

    // Top donors to this legislator via their campaign account
    Promise.resolve({ data: null }),

    db.from('official_disclosures')
      .select('filing_year, filing_type, net_worth, income_sources, real_estate, business_interests, liabilities, source_url, filer_name')
      .eq('legislator_id', id)
      .order('filing_year', { ascending: false })
      .limit(1)
      .then(r => ({ data: r.data?.[0] ?? null })),
  ]);

  // If we have an acct_num, fetch top donors from candidate_top_donors
  let topDonorsList = null;
  if (legislator?.acct_num) {
    const { data } = await db.from('candidate_top_donors')
      .select('donor_name, donor_slug, total_amount, num_contributions')
      .eq('acct_num', legislator.acct_num)
      .order('total_amount', { ascending: false })
      .limit(10);
    topDonorsList = data;
  }

  // Role sort order for display
  const ROLE_ORDER = { Chair: 0, 'Vice Chair': 1, 'Ranking Member': 2, Member: 3 };
  const sortedMemberships = (memberships || []).sort((a, b) => {
    const ra = ROLE_ORDER[a.role] ?? 9;
    const rb = ROLE_ORDER[b.role] ?? 9;
    return ra !== rb ? ra - rb : (a.legislative_committees?.name || '').localeCompare(b.legislative_committees?.name || '');
  });

  return {
    legislator: legislator || null,
    memberships: sortedMemberships,
    votes: votes || [],
    sponsorships: sponsorships || [],
    topDonors: topDonorsList || [],
    disclosure: disclosureRaw || null,
  };
}
