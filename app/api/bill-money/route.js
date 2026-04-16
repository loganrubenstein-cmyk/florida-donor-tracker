import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const billSlug  = searchParams.get('bill') || '';
  const yearParam = searchParams.get('year') || null;
  if (!billSlug) return NextResponse.json({ error: 'bill required' }, { status: 400 });

  const db = getDb();

  // Get canonical bill name (optionally filtered to one session year)
  let canonQuery = db.from('bill_disclosures').select('bill_canon').eq('bill_slug', billSlug);
  if (yearParam) canonQuery = canonQuery.eq('year', parseInt(yearParam, 10));
  const { data: billRows } = await canonQuery.limit(1);
  const billCanon = billRows?.[0]?.bill_canon;
  if (!billCanon) return NextResponse.json({ principals: [], votes: [], bill_canon: null, num_principals: 0, num_voters: 0 });

  // Get all principals + lobbyists who disclosed on this bill (same year filter)
  let discQuery = db.from('bill_disclosures').select('principal, lobbyist').eq('bill_slug', billSlug);
  if (yearParam) discQuery = discQuery.eq('year', parseInt(yearParam, 10));
  const { data: discRows } = await discQuery;

  const principalNames = [...new Set((discRows || []).map(r => r.principal).filter(Boolean))];
  if (principalNames.length === 0) {
    return NextResponse.json({ principals: [], votes: [], bill_canon: billCanon, num_principals: 0, num_voters: 0 });
  }

  // Get votes on this bill
  const { data: voteRows } = await db
    .from('legislator_votes')
    .select('people_id, bill_number, vote_text, vote_date')
    .ilike('bill_number', `%${billCanon.replace(/[^A-Z0-9]/gi, '%')}%`)
    .limit(500);

  // Get legislators for those people_ids
  const peopleIds = [...new Set((voteRows || []).map(r => r.people_id).filter(Boolean))];
  let legislatorMap = {};
  if (peopleIds.length > 0) {
    const { data: legRows } = await db
      .from('legislators')
      .select('people_id, display_name, party, acct_num')
      .in('people_id', peopleIds);
    for (const l of legRows || []) legislatorMap[l.people_id] = l;
  }

  // Build yes/no legislator acct_num sets
  const yesAccts = new Set();
  const noAccts  = new Set();
  for (const v of voteRows || []) {
    const leg = legislatorMap[v.people_id];
    if (!leg?.acct_num) continue;
    if (v.vote_text === 'Yea' || v.vote_text === 'Yes') yesAccts.add(leg.acct_num);
    else if (v.vote_text === 'Nay' || v.vote_text === 'No') noAccts.add(leg.acct_num);
  }

  // Look up principal slugs
  const { data: principalRows } = await db
    .from('principals')
    .select('slug, name')
    .in('name', principalNames.slice(0, 50));
  const principalMap = {};
  for (const p of principalRows || []) principalMap[p.name] = p.slug;

  // For each principal, get donation totals to yes/no voters via donor_candidates
  // (using principal_donation_matches → contributor → donor_candidates)
  const results = await Promise.all(
    (principalRows || []).slice(0, 30).map(async p => {
      // Get donation matches for this principal
      const { data: matchRows } = await db
        .from('principal_donation_matches')
        .select('contributor_name')
        .eq('principal_slug', p.slug)
        .limit(30);

      const donorNames = (matchRows || []).map(m => m.contributor_name).filter(Boolean);
      let toYes = 0, toNo = 0;

      if (donorNames.length > 0) {
        // Get donor slugs
        const { data: donorRows } = await db
          .from('donors')
          .select('slug')
          .in('name', donorNames.slice(0, 20));
        const donorSlugs = (donorRows || []).map(d => d.slug);

        if (donorSlugs.length > 0 && (yesAccts.size > 0 || noAccts.size > 0)) {
          const { data: dcRows } = await db
            .from('donor_candidates')
            .select('acct_num, total')
            .in('donor_slug', donorSlugs);

          for (const r of dcRows || []) {
            const amt = parseFloat(r.total) || 0;
            if (yesAccts.has(r.acct_num)) toYes += amt;
            if (noAccts.has(r.acct_num))  toNo  += amt;
          }
        }
      }

      return {
        principal_name:        p.name,
        principal_slug:        p.slug,
        num_filings:           (discRows || []).filter(r => r.principal === p.name).length,
        total_donated_to_yes:  toYes,
        total_donated_to_no:   toNo,
      };
    })
  );

  return NextResponse.json({
    bill_canon:      billCanon,
    principals:      results.sort((a, b) => (b.total_donated_to_yes + b.total_donated_to_no) - (a.total_donated_to_yes + a.total_donated_to_no)),
    votes:           (voteRows || []).map(v => ({
      people_id:    v.people_id,
      display_name: legislatorMap[v.people_id]?.display_name || '',
      party:        legislatorMap[v.people_id]?.party || '',
      vote_text:    v.vote_text,
      vote_date:    v.vote_date,
    })).slice(0, 100),
    num_principals:  principalNames.length,
    num_voters:      voteRows?.length || 0,
  });
}
