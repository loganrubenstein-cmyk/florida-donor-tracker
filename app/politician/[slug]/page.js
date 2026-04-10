import { readFileSync } from 'fs';
import { join } from 'path';
import { notFound } from 'next/navigation';
import { loadCandidate, loadCandidateCycles, getPoliticianBySlug, listPoliticianSlugs } from '@/lib/loadCandidate';
import CandidateProfile from '@/components/candidate/CandidateProfile';
import BackLinks from '@/components/BackLinks';

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

const PARTY_COLOR = { REP: 'var(--republican)', DEM: 'var(--democrat)' };
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

export default async function PoliticianPage({ params, searchParams }) {
  const { slug } = await params;
  const politician = getPoliticianBySlug(slug);
  if (!politician) notFound();

  const { display_name, cycles } = politician;

  // Sort cycles newest first
  const sortedCycles = [...cycles].sort((a, b) => Number(b.year) - Number(a.year));

  // Determine active cycle from ?cycle= param, default to most recent
  const { cycle: requestedAcct } = await searchParams;
  const activeCycle = sortedCycles.find(c => c.acct_num === requestedAcct) ?? sortedCycles[0];

  // Load full candidate data for active cycle
  let candidateData = null;
  try {
    candidateData = await loadCandidate(activeCycle.acct_num);
  } catch {
    notFound();
  }

  // loadCandidateCycles for the acct_num (used by CandidateProfile's own pill bar)
  // We pass all cycles from the politician index instead, which is richer
  const allCyclesForAcct = loadCandidateCycles(activeCycle.acct_num);

  // Election results for all accounts linked to this politician
  const lookup = getElectionLookup();
  const allElectionResults = sortedCycles
    .flatMap(c => lookup[String(c.acct_num)] || [])
    .filter((r, i, arr) => arr.findIndex(x => x.year === r.year && x.election_type === r.election_type) === i)
    .sort((a, b) => b.year - a.year || (a.election_type === 'general' ? -1 : 1));

  const party = activeCycle.party_code;
  const partyColor = PARTY_COLOR[party] || null;

  // Build pretty title: "Rick Scott — Governor (2014)"
  const officeLabel = OFFICE_SHORT[activeCycle.office_code] || activeCycle.office_desc;
  const districtStr = activeCycle.district ? ` · District ${activeCycle.district}` : '';

  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      <BackLinks links={[
        { href: '/candidates', label: 'candidates' },
      ]} />

      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.5rem, 3.5vw, 2.2rem)',
          fontWeight: 400, color: '#fff', marginBottom: '0.4rem',
        }}>
          {display_name.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')}
        </h1>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {party && (
            <span style={{
              fontSize: '0.62rem', padding: '0.1rem 0.45rem',
              border: `1px solid ${partyColor || 'var(--border)'}`,
              color: partyColor || 'var(--text-dim)',
              borderRadius: '2px', fontFamily: 'var(--font-mono)',
            }}>
              {PARTY_LABEL[party] || party}
            </span>
          )}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {officeLabel}{districtStr} · {activeCycle.year}
          </span>
          <span style={{ fontSize: '0.62rem', color: 'rgba(100,140,220,0.45)', fontFamily: 'var(--font-mono)' }}>
            {sortedCycles.length} FL election cycle{sortedCycles.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Cycle selector */}
      {sortedCycles.length > 1 && (
        <div style={{
          display: 'flex', gap: '0.4rem', flexWrap: 'wrap',
          marginBottom: '1.75rem',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '1rem',
        }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', alignSelf: 'center', marginRight: '0.25rem' }}>
            Cycle
          </span>
          {sortedCycles.map(c => {
            const isActive = c.acct_num === activeCycle.acct_num;
            const label = `${c.year} ${OFFICE_SHORT[c.office_code] || c.office_desc}${c.district ? ` D${c.district}` : ''}`;
            return (
              <a
                key={c.acct_num}
                href={`/politician/${slug}?cycle=${c.acct_num}`}
                style={{
                  fontSize: '0.68rem', padding: '0.2rem 0.6rem',
                  borderRadius: '2px', textDecoration: 'none',
                  fontFamily: 'var(--font-mono)',
                  border: `1px solid ${isActive ? 'var(--teal)' : 'var(--border)'}`,
                  color: isActive ? 'var(--teal)' : 'var(--text-dim)',
                  background: isActive ? 'rgba(77,216,240,0.08)' : 'transparent',
                }}
              >
                {label}
              </a>
            );
          })}
        </div>
      )}

      {/* Full candidate profile for active cycle */}
      <CandidateProfile data={candidateData} cycles={allCyclesForAcct} electionResults={allElectionResults} />

      {/* Link to raw acct page */}
      <div style={{
        marginTop: '2rem', fontSize: '0.62rem', color: 'var(--text-dim)',
        fontFamily: 'var(--font-mono)', borderTop: '1px solid var(--border)', paddingTop: '1rem',
        display: 'flex', gap: '1.5rem', flexWrap: 'wrap',
      }}>
        <a href={`/candidate/${activeCycle.acct_num}`} style={{ color: 'rgba(100,140,220,0.5)', textDecoration: 'none' }}>
          View raw campaign account #{activeCycle.acct_num} →
        </a>
        <span>Data: Florida Division of Elections · Not affiliated with the State of Florida.</span>
      </div>
    </main>
  );
}
