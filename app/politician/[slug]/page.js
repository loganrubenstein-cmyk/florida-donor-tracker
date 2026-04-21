import { readFileSync } from 'fs';
import { join } from 'path';
import { notFound } from 'next/navigation';
import { loadCandidate, loadCandidateCycles, getPoliticianBySlug, listPoliticianSlugs } from '@/lib/loadCandidate';
import { getDb } from '@/lib/db';
import CandidateProfile from '@/components/candidate/CandidateProfile';
import BackLinks from '@/components/BackLinks';
import EntityHeader from '@/components/shared/EntityHeader';
import BackToTop from '@/components/shared/BackToTop';
import { buildMeta } from '@/lib/seo';
import { fmtMoneyCompact } from '@/lib/fmt';
import { PARTY_COLOR } from '@/lib/partyUtils';
import { FEDERAL_OFFICE_CODES } from '@/lib/officeCodes';

// Surnames with non-standard internal capitalization that get mangled by
// simple title-casing. Add more as needed.
const NAME_CASING_OVERRIDES = {
  'desantis':   'DeSantis',
  'degroot':    'DeGroot',
  'lagrone':    'LaGrone',
  'laceirra':   'LaCeirra',
  'lamarca':    'LaMarca',
  'larose':     'LaRose',
  'lasala':     'LaSala',
  'madonna':    'Madonna',
  'mccarthy':   'McCarthy',
  'mcclain':    'McClain',
  'mcconnell':  'McConnell',
  'mcdonough':  'McDonough',
  'mcfarland':  'McFarland',
  'mckenzie':   'McKenzie',
  'obrien':     "O'Brien",
  'oconnell':   "O'Connell",
  'oconnor':    "O'Connor",
};

// Title-case a FL DoE display_name while preserving internal capitals
// (McDonough, DeSantis, O'Brien, LaRose, etc.). Applies the override map for
// known camelCase surnames. Only transforms all-caps or all-lowercase words;
// leaves existing mixed-case words as-is.
function prettyName(name) {
  if (!name) return name;
  return name.split(' ').map(word => {
    if (!word) return word;
    // Known override (matched case-insensitively)
    const override = NAME_CASING_OVERRIDES[word.toLowerCase()];
    if (override) return override;
    // Mixed case already — trust it (the data was good)
    if (/[A-Z]/.test(word) && /[a-z]/.test(word)) return word;
    // All lowercase or all uppercase — title-case it
    return word.split(/([-'])/).map(part => {
      if (part === '-' || part === "'") return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }).join('');
  }).join(' ');
}

let _electionLookup = null;
function getElectionLookup() {
  if (!_electionLookup) {
    try {
      _electionLookup = JSON.parse(
        readFileSync(join(process.cwd(), 'public', 'data', 'elections', 'results_by_acct.json'), 'utf-8')
      );
    } catch { _electionLookup = {}; }
  }
  return _electionLookup;
}

export const dynamic = 'force-dynamic';

const PARTY_LABEL = { REP: 'Republican', DEM: 'Democrat', NOP: 'No Party', IND: 'Independent' };

const OFFICE_SHORT = {
  STR: 'State Rep', STS: 'State Sen', GOV: 'Governor', LTG: 'Lt. Governor',
  ATG: 'Atty General', CFO: 'CFO', CAG: 'Ag Comm',
  USR: 'US Rep', USS: 'US Sen', PRE: 'President',
  STA: 'State Atty', PUB: 'Public Defender', CTJ: 'Circuit Judge', SEB: 'State Exec',
};

export async function generateStaticParams() {
  const slugs = listPoliticianSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const politician = getPoliticianBySlug(slug);
  if (!politician) return { title: 'Politician' };
  const { display_name, cycles } = politician;
  const latest = [...cycles].sort((a, b) => Number(b.year) - Number(a.year))[0];
  const office = OFFICE_SHORT[latest.office_code] || latest.office_desc || '';
  const party = PARTY_LABEL[latest.party_code] || '';
  const desc = [
    display_name,
    party ? `(${party})` : '',
    office ? `\u2014 ${office}` : '',
    latest.district ? `District ${latest.district}.` : '.',
    `${cycles.length} Florida election cycle${cycles.length !== 1 ? 's' : ''} tracked with full campaign finance data.`,
  ].filter(Boolean).join(' ');
  return buildMeta({ title: display_name, description: desc, path: `/politician/${slug}` });
}

export default async function PoliticianPage({ params, searchParams }) {
  const { slug } = await params;
  const politician = getPoliticianBySlug(slug);
  if (!politician) notFound();

  const { display_name, cycles } = politician;

  const sortedCycles = [...cycles].sort((a, b) => Number(b.year) - Number(a.year));

  const { cycle: requestedAcct } = await searchParams;
  // Default to most recent STATE cycle — federal cycles show $0 FL DoE data and link to FEC
  const activeCycle = sortedCycles.find(c => c.acct_num === requestedAcct)
    ?? sortedCycles.find(c => !FEDERAL_OFFICE_CODES.has((c.office_code || '').toUpperCase()))
    ?? sortedCycles[0];

  let candidateData = null;
  try {
    candidateData = await loadCandidate(activeCycle.acct_num);
  } catch {
    notFound();
  }

  // Pass all cycles from the politician index — it's richer than loadCandidateCycles.
  const allCyclesForAcct = loadCandidateCycles(activeCycle.acct_num);

  const allAcctNums = sortedCycles.map(c => String(c.acct_num));
  const db = getDb();
  const [{ data: legRows }, { data: cycleFinRows }] = await Promise.all([
    db.from('legislators')
      .select('people_id, chamber, district')
      .in('acct_num', allAcctNums)
      .limit(1),
    db.from('candidates')
      .select('acct_num, hard_money_total, soft_money_total, total_combined')
      .in('acct_num', allAcctNums),
  ]);
  const matchedLeg = legRows?.[0] || null;

  const cycleFinMap = {};
  for (const row of cycleFinRows || []) {
    cycleFinMap[String(row.acct_num)] = {
      hard:     parseFloat(row.hard_money_total)  || 0,
      soft:     parseFloat(row.soft_money_total)  || 0,
      combined: parseFloat(row.total_combined)    || 0,
    };
  }
  const careerHard     = Object.values(cycleFinMap).reduce((s, r) => s + r.hard, 0);
  const careerSoft     = Object.values(cycleFinMap).reduce((s, r) => s + r.soft, 0);
  const careerCombined = Object.values(cycleFinMap).reduce((s, r) => s + r.combined, 0);

  const lookup = getElectionLookup();
  const allElectionResults = sortedCycles
    .flatMap(c => lookup[String(c.acct_num)] || [])
    .filter((r, i, arr) => arr.findIndex(x => x.year === r.year && x.election_type === r.election_type) === i)
    .sort((a, b) => b.year - a.year || (a.election_type === 'general' ? -1 : 1));

  const party = activeCycle.party_code;
  const partyColor = PARTY_COLOR[party] || null;

  const officeLabel = OFFICE_SHORT[activeCycle.office_code] || activeCycle.office_desc;
  const districtStr = activeCycle.district ? ` · District ${activeCycle.district}` : '';

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      <BackLinks links={[
        { href: '/candidates', label: 'candidates' },
      ]} />

      <EntityHeader
        name={prettyName(display_name)}
        badges={[
          ...(party ? [{ label: PARTY_LABEL[party] || party, color: partyColor || 'var(--border)' }] : []),
          ...(matchedLeg ? [{ label: `Currently serving · FL ${matchedLeg.chamber} D${matchedLeg.district} →`, color: 'var(--teal)', href: `/legislator/${matchedLeg.people_id}` }] : []),
        ]}
        meta={[
          `${officeLabel}${districtStr} · ${activeCycle.year}`,
          `${sortedCycles.length} FL election cycle${sortedCycles.length !== 1 ? 's' : ''}`,
        ]}
      />

      {activeCycle.office_desc && activeCycle.year && (
        <div style={{ marginBottom: '0.75rem', marginTop: '-0.25rem' }}>
          <a
            href={`/race/${encodeURIComponent(activeCycle.office_desc.toLowerCase().replace(/\s+/g, '-'))}/${activeCycle.year}`}
            style={{ fontSize: '0.65rem', color: 'var(--teal)', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}
          >
            all candidates this race →
          </a>
        </div>
      )}

      {/* Cycle comparison table — doubles as cycle selector */}
      {sortedCycles.length > 0 && (
        <div style={{ marginBottom: '1.75rem' }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
            Election Cycles
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Year', 'Office', 'Hard Money', 'Soft Money', 'Combined'].map((h, j) => (
                    <th key={h} style={{
                      padding: '0.3rem 0.6rem', fontSize: '0.58rem', color: 'var(--text-dim)',
                      textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                      textAlign: j >= 2 ? 'right' : 'left',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const maxCombined = Math.max(...sortedCycles.map(c => cycleFinMap[String(c.acct_num)]?.combined || 0), 1);
                  return sortedCycles.map(c => {
                  const isActive = c.acct_num === activeCycle.acct_num;
                  const isFederal = FEDERAL_OFFICE_CODES.has((c.office_code || '').toUpperCase());
                  const fin = cycleFinMap[String(c.acct_num)] || {};
                  const officeStr = `${OFFICE_SHORT[c.office_code] || c.office_desc || ''}${c.district ? ` D${c.district}` : ''}`;
                  const barPct = ((fin.combined || 0) / maxCombined * 100).toFixed(1);
                  const fecOffice = c.office_code === 'USS' ? 'S' : c.office_code === 'USR' ? 'H' : c.office_code === 'PRE' ? 'P' : '';
                  const fecUrl = `https://www.fec.gov/data/candidates/?q=${encodeURIComponent(display_name)}${fecOffice ? `&office=${fecOffice}` : ''}&state=FL`;
                  return (
                    <tr key={c.acct_num} style={{
                      borderBottom: '1px solid rgba(100,140,220,0.06)',
                      background: isActive
                        ? `linear-gradient(to right, rgba(77,216,240,0.07) ${barPct}%, rgba(77,216,240,0.03) ${barPct}%)`
                        : `linear-gradient(to right, rgba(100,140,220,0.04) ${barPct}%, transparent ${barPct}%)`,
                    }}>
                      <td style={{ padding: '0.35rem 0.6rem', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                        <a href={`/politician/${slug}?cycle=${c.acct_num}`} style={{
                          color: isActive ? 'var(--teal)' : 'var(--text-dim)',
                          textDecoration: 'none', fontWeight: isActive ? 700 : 400,
                        }}>
                          {c.year}
                        </a>
                      </td>
                      <td style={{ padding: '0.35rem 0.6rem', color: isActive ? 'var(--text)' : 'var(--text-dim)', fontSize: '0.7rem' }}>
                        {officeStr}
                        {isFederal && (
                          <span style={{ display: 'block', fontSize: '0.58rem', color: 'var(--text-dim)', marginTop: '0.1rem' }}>
                            Federal — FL DoE data only.{' '}
                            <a href={fecUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(100,140,220,0.6)', textDecoration: 'none' }}>
                              Full data on FEC.gov ↗
                            </a>
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-serif)', fontVariantNumeric: 'tabular-nums', fontSize: '0.7rem', color: fin.hard > 0 ? 'var(--orange)' : 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                        {fin.hard > 0 ? fmtMoneyCompact(fin.hard) : '—'}
                      </td>
                      <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-serif)', fontVariantNumeric: 'tabular-nums', fontSize: '0.7rem', color: fin.soft > 0 ? 'var(--blue)' : 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                        {fin.soft > 0 ? fmtMoneyCompact(fin.soft) : '—'}
                      </td>
                      <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-serif)', fontVariantNumeric: 'tabular-nums', fontSize: '0.7rem', color: isActive ? 'var(--teal)' : 'var(--text-dim)', fontWeight: isActive ? 600 : 400, whiteSpace: 'nowrap' }}>
                        {fin.combined > 0 ? fmtMoneyCompact(fin.combined) : '—'}
                      </td>
                    </tr>
                  );
                }); })()}
                {/* Career totals row */}
                {sortedCycles.length > 1 && (
                  <tr style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                    <td colSpan={2} style={{ padding: '0.35rem 0.6rem', fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Career Total
                    </td>
                    <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-serif)', fontVariantNumeric: 'tabular-nums', fontSize: '0.7rem', color: 'var(--orange)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {careerHard > 0 ? fmtMoneyCompact(careerHard) : '—'}
                    </td>
                    <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-serif)', fontVariantNumeric: 'tabular-nums', fontSize: '0.7rem', color: 'var(--blue)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {careerSoft > 0 ? fmtMoneyCompact(careerSoft) : '—'}
                    </td>
                    <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-serif)', fontVariantNumeric: 'tabular-nums', fontSize: '0.7rem', color: 'var(--teal)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {careerCombined > 0 ? fmtMoneyCompact(careerCombined) : '—'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Full candidate profile for active cycle — header suppressed to avoid duplication */}
      <CandidateProfile data={candidateData} cycles={allCyclesForAcct} electionResults={allElectionResults} hideHeader />

      {/* Link to raw acct page */}
      <div style={{
        marginTop: '2rem', fontSize: '0.62rem', color: 'var(--text-dim)',
        fontFamily: 'var(--font-mono)', borderTop: '1px solid var(--border)', paddingTop: '1rem',
        display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center',
      }}>
        <a href={`/candidate/${activeCycle.acct_num}`} style={{ color: 'rgba(100,140,220,0.5)', textDecoration: 'none' }}>
          View raw campaign account #{activeCycle.acct_num} →
        </a>
        <a href={`/flow`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
          Explore top donors in Money Flow →
        </a>
        <span>Data: Florida Division of Elections · Not affiliated with the State of Florida.</span>
      </div>
      <BackToTop />
    </main>
  );
}
