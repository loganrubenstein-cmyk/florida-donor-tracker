import { getDb } from '@/lib/db';

function slugToBillNumber(slug) {
  if (!slug) return null;
  const m = String(slug).match(/^(hb|sb|hr|sr|hcr|scr|hjr|sjr|hm|sm)-0*(\d+)$/i);
  if (!m) return null;
  const prefix = m[1].toLowerCase().startsWith('h') ? 'H' : 'S';
  return `${prefix}${m[2].padStart(4, '0')}`;
}

function flSenateUrl(bill, year) {
  const m = String(bill || '').match(/^([HS])(\d+)$/);
  if (!m || !year) return null;
  return `https://www.flsenate.gov/Session/Bill/${year}/${parseInt(m[2], 10)}`;
}

export async function loadBill(slug, yearOverride) {
  const db = getDb();
  const billNumber = slugToBillNumber(slug);

  const { data: infoRows } = await db
    .from('bill_info')
    .select('year, title, status, last_action, primary_sponsor, bill_canon')
    .eq('bill_slug', slug)
    .order('year', { ascending: false });

  if (!infoRows || infoRows.length === 0) return null;

  const availableYears = infoRows.map(r => r.year);
  const activeYear = yearOverride ? parseInt(yearOverride, 10) : infoRows[0].year;
  const info = infoRows.find(r => r.year === activeYear) || infoRows[0];

  let sponsorList = [];
  let voteSummary = { House: null, Senate: null };
  let votes = [];

  if (billNumber) {
    const [{ data: sponsors }, { data: voteRows }] = await Promise.all([
      db.from('bill_sponsorships')
        .select('people_id, bill_number, bill_title, sponsor_type, session_id, legislators(display_name, party, chamber, district)')
        .eq('bill_number', billNumber),
      db.from('legislator_votes')
        .select('people_id, vote_text, vote_date, session_id, legislators(display_name, party, chamber)')
        .eq('bill_number', billNumber)
        .order('vote_date', { ascending: false })
        .limit(2000),
    ]);

    // Pick the session_id whose vote_date year best matches activeYear.
    const sessionsByYear = {};
    for (const v of voteRows || []) {
      if (!v.vote_date) continue;
      const yr = String(v.vote_date).slice(0, 4);
      sessionsByYear[yr] = sessionsByYear[yr] || v.session_id;
    }
    const activeSessionId = sessionsByYear[String(activeYear)] || (voteRows?.[0]?.session_id ?? null);

    sponsorList = (sponsors || [])
      .filter(s => activeSessionId == null || s.session_id === activeSessionId)
      .map(s => ({
        people_id: s.people_id,
        display_name: s.legislators?.display_name || null,
        party: s.legislators?.party || null,
        chamber: s.legislators?.chamber || (s.bill_number?.startsWith('H') ? 'House' : 'Senate'),
        district: s.legislators?.district || null,
        sponsor_type: s.sponsor_type,
      }))
      .filter(s => s.display_name)
      .sort((a, b) => {
        const order = { primary: 0, Primary: 0, cosponsor: 1, Co: 1 };
        const oa = order[a.sponsor_type] ?? 2;
        const ob = order[b.sponsor_type] ?? 2;
        if (oa !== ob) return oa - ob;
        return (a.display_name || '').localeCompare(b.display_name || '');
      });

    const activeVotes = (voteRows || []).filter(v => activeSessionId == null || v.session_id === activeSessionId);
    votes = activeVotes;

    const byChamber = { House: { Yea: 0, Nay: 0, NV: 0, Absent: 0, total: 0 }, Senate: { Yea: 0, Nay: 0, NV: 0, Absent: 0, total: 0 } };
    const lastVoteByChamber = { House: null, Senate: null };
    // Latest roll-call per chamber: group votes by (vote_date, chamber), pick latest date with meaningful vote_text.
    const rollCalls = {};
    for (const v of activeVotes) {
      const ch = v.legislators?.chamber;
      if (!ch || !byChamber[ch]) continue;
      const key = `${ch}|${v.vote_date}`;
      if (!rollCalls[key]) rollCalls[key] = { chamber: ch, date: v.vote_date, tally: { Yea: 0, Nay: 0, NV: 0, Absent: 0 } };
      const vt = v.vote_text;
      if (vt === 'Yea' || vt === 'Yes') rollCalls[key].tally.Yea++;
      else if (vt === 'Nay' || vt === 'No') rollCalls[key].tally.Nay++;
      else if (vt === 'Absent') rollCalls[key].tally.Absent++;
      else rollCalls[key].tally.NV++;
    }
    for (const ch of ['House', 'Senate']) {
      const chRolls = Object.values(rollCalls).filter(r => r.chamber === ch).sort((a, b) => String(b.date).localeCompare(String(a.date)));
      if (chRolls[0]) lastVoteByChamber[ch] = chRolls[0];
    }
    voteSummary = lastVoteByChamber;
  }

  const { data: disclosureRows } = await db
    .from('bill_disclosures')
    .select('principal, lobbyist, firm')
    .eq('bill_slug', slug)
    .eq('year', activeYear)
    .limit(5000);

  const principalMap = {};
  for (const d of disclosureRows || []) {
    const key = d.principal;
    if (!principalMap[key]) principalMap[key] = { principal: key, filings: 0, lobbyists: new Set(), firms: new Set() };
    principalMap[key].filings++;
    if (d.lobbyist) principalMap[key].lobbyists.add(d.lobbyist);
    if (d.firm) principalMap[key].firms.add(d.firm);
  }
  const principals = Object.values(principalMap)
    .map(p => ({ ...p, lobbyists: [...p.lobbyists], firms: [...p.firms] }))
    .sort((a, b) => b.filings - a.filings);

  return {
    slug,
    bill_number: info.bill_canon || billNumber || slug.toUpperCase(),
    year: activeYear,
    title: info.title || null,
    status: info.status || null,
    last_action: info.last_action || null,
    primary_sponsor: info.primary_sponsor || null,
    available_years: availableYears,
    sponsors: sponsorList,
    votes_summary: voteSummary,
    principals,
    fl_senate_url: flSenateUrl(billNumber, activeYear),
  };
}
