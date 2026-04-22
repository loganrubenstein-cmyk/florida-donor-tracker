import { getDb } from '@/lib/db';
import { billNumberToSlug, billNumberToDisplay, getBienniumStart } from '@/lib/fmt';

// Maps LegiScan session_id → FL biennium start year (odd year).
// Extend when new sessions are imported.
const SESSION_BIENNIUM = {
  2135: 2025, // 2025–2026 regular session
  2220: 2025, // 2026 special session (same biennium)
};

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
      .limit(200),

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

  // ── Bill enrichment: display format + lobbyist counts ──────────────────
  // Add bill_slug, bill_display, biennium_start to every vote and sponsorship.
  // Then batch-query bill_lobbyist_counts keyed by (slug, biennium_start) so
  // HB 220 from the 2025-26 session never collides with HB 220 from 2023-24.

  const enrichBill = (billNumber, voteDate, sessionId) => {
    const slug    = billNumberToSlug(billNumber);
    const display = billNumberToDisplay(billNumber);
    const year    = voteDate
      ? new Date(voteDate).getFullYear()
      : (SESSION_BIENNIUM[sessionId] ?? null);
    const bienniumStart = year ? getBienniumStart(year) : null;
    return { bill_slug: slug, bill_display: display, biennium_start: bienniumStart };
  };

  const enrichedVotes = (votes || []).map(v => ({
    ...v,
    ...enrichBill(v.bill_number, v.vote_date, v.session_id),
  }));

  const enrichedSpons = (sponsorships || []).map(s => ({
    ...s,
    ...enrichBill(s.bill_number, null, s.session_id),
  }));

  // Collect unique slugs + biennium years for the batch query
  const allEnriched   = [...enrichedVotes, ...enrichedSpons];
  const slugSet       = new Set(allEnriched.map(x => x.bill_slug).filter(Boolean));
  const bienniumSet   = new Set(allEnriched.map(x => x.biennium_start).filter(Boolean));
  const bienniumYears = [...bienniumSet].flatMap(b => [b, b + 1]);

  let lobbyistCountMap = {};
  if (slugSet.size > 0 && bienniumYears.length > 0) {
    const { data: counts } = await db.from('bill_lobbyist_counts')
      .select('bill_slug, year, lobbyist_count')
      .in('bill_slug', [...slugSet])
      .in('year', bienniumYears);

    for (const row of counts || []) {
      const key = `${row.bill_slug}__${getBienniumStart(row.year)}`;
      lobbyistCountMap[key] = (lobbyistCountMap[key] || 0) + Number(row.lobbyist_count || 0);
    }
  }

  const attachCount = item => ({
    ...item,
    lobbyist_count: item.bill_slug && item.biennium_start
      ? (lobbyistCountMap[`${item.bill_slug}__${item.biennium_start}`] || 0)
      : 0,
  });

  // ── Role sort order for display ─────────────────────────────────────────
  const ROLE_ORDER = { Chair: 0, 'Vice Chair': 1, 'Ranking Member': 2, Member: 3 };
  const sortedMemberships = (memberships || []).sort((a, b) => {
    const ra = ROLE_ORDER[a.role] ?? 9;
    const rb = ROLE_ORDER[b.role] ?? 9;
    return ra !== rb ? ra - rb : (a.legislative_committees?.name || '').localeCompare(b.legislative_committees?.name || '');
  });

  return {
    legislator: legislator || null,
    memberships: sortedMemberships,
    votes: enrichedVotes.map(attachCount),
    sponsorships: enrichedSpons.map(attachCount),
    topDonors: topDonorsList || [],
    disclosure: disclosureRaw || null,
  };
}
