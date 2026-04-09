import Link from 'next/link';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fmtMoney, fmtCount } from '../../lib/fmt';

export const metadata = {
  title: 'Election Results — Florida Donor Tracker',
  description: 'Florida election results 2012–2024 with campaign finance cross-reference. Cost per vote, race outcomes, and spending efficiency.',
};

function loadSummary() {
  try {
    const p = join(process.cwd(), 'public', 'data', 'elections', 'summary.json');
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch { return []; }
}

const PARTY_COLOR = {
  REP: 'var(--republican)',
  DEM: 'var(--democrat)',
  NOP: 'var(--text-dim)',
  NPA: 'var(--text-dim)',
  LIB: 'var(--orange)',
  GRE: '#80ffa0',
  IND: 'var(--text-dim)',
  WRI: 'var(--text-dim)',
};
function partyColor(p) { return PARTY_COLOR[p] || 'var(--text-dim)'; }

function partyLabel(p) {
  const MAP = { REP: 'R', DEM: 'D', NOP: 'NPA', NPA: 'NPA', LIB: 'L', GRE: 'G', IND: 'I', WRI: 'W' };
  return MAP[p] || p;
}

export default function ElectionsPage() {
  const summary = loadSummary();

  // Group by year, pick general elections as primary, note primaries
  const byYear = {};
  for (const e of summary) {
    const yr = e.year;
    if (!byYear[yr]) byYear[yr] = {};
    byYear[yr][e.election_type || 'general'] = e;
  }
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  // Count totals
  const totalElections = summary.length;
  const uniqueYears = years.length;
  const totalContestsWithFinance = summary.reduce((s, e) => s + (e.contests_with_finance || 0), 0);

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <span>Elections</span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', color: 'var(--text)', marginBottom: '0.25rem' }}>
        Election Results
      </h1>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '0.25rem' }}>
        Florida general and primary election results 2012–2024, cross-referenced with campaign finance data.
        Includes cost-per-vote analysis for candidates with finance records.
      </p>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '2rem' }}>
        Source: Florida Division of Elections precinct-level results. Not affiliated with the State of Florida.
        All data from public records.
      </p>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '2.5rem', padding: '1rem 1.25rem', background: 'var(--surface)', borderRadius: '6px', border: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>{totalElections}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Elections</div>
        </div>
        <div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>{uniqueYears}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Years (2012–2024)</div>
        </div>
        <div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>{fmtCount(totalContestsWithFinance)}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contests with Finance Data</div>
        </div>
      </div>

      {/* Per-year sections */}
      {years.map(year => {
        const gen = byYear[year].general;
        const pri = byYear[year].primary;

        return (
          <div key={year} style={{ marginBottom: '3rem' }}>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--text)', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
              {year}
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: gen && pri ? '1fr 1fr' : '1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              {gen && <ElectionCard election={gen} label="General Election" />}
              {pri && <ElectionCard election={pri} label="Primary Election" />}
            </div>

            {/* Top finance races from general */}
            {gen && gen.finance_races_top50 && gen.finance_races_top50.length > 0 && (
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
                  Top Races by Fundraising — {year} General
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {gen.finance_races_top50.slice(0, 8).map((race, i) => (
                    <RaceRow key={i} race={race} />
                  ))}
                  {gen.finance_races_top50.length > 8 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', paddingLeft: '0.5rem' }}>
                      +{gen.finance_races_top50.length - 8} more races with finance data
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div style={{ marginTop: '2rem', padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text)' }}>Data notes:</strong> Results from Florida Division of Elections precinct-level files.
        Finance cross-references match candidate names against FL Division of Elections campaign finance records.
        Match rate ~15–17% due to name format differences between datasets (election results use &ldquo;LAST, FIRST&rdquo;; finance records use various formats).
        Cost-per-vote = total raised ÷ votes received. Results are official final certified totals.
        <br />
        <Link href="/methodology" style={{ color: 'var(--teal)' }}>Full methodology →</Link>
      </div>
    </main>
  );
}

function ElectionCard({ election, label }) {
  return (
    <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px' }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.5rem' }}>{label}</div>
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>
            {fmtCount(election.total_contests)}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>contests</div>
        </div>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--orange)', fontFamily: 'var(--font-mono)' }}>
            {fmtCount(election.contests_with_finance)}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>with finance data</div>
        </div>
      </div>
    </div>
  );
}

function RaceRow({ race }) {
  const top = race.candidates[0];
  const totalRaised = Math.max(...race.candidates.map(c => c.total_raised || 0));

  return (
    <div style={{ padding: '0.75rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.25rem' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>{race.contest_name}</div>
        {totalRaised > 0 && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            top raised: <span style={{ color: 'var(--orange)' }}>{fmtMoney(totalRaised)}</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {race.candidates.slice(0, 4).map((c, i) => (
          <CandidateRow key={i} candidate={c} />
        ))}
      </div>
    </div>
  );
}

function CandidateRow({ candidate: c }) {
  const isWinner = c.winner;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', flexWrap: 'wrap' }}>
      <span style={{
        display: 'inline-block', width: '18px', height: '18px', borderRadius: '3px',
        background: partyColor(c.party) + '22', color: partyColor(c.party),
        border: `1px solid ${partyColor(c.party)}44`,
        textAlign: 'center', lineHeight: '18px', fontSize: '0.65rem', fontWeight: 700, flexShrink: 0,
      }}>
        {partyLabel(c.party)}
      </span>
      <span style={{ color: isWinner ? 'var(--text)' : 'var(--text-dim)', fontWeight: isWinner ? 600 : 400 }}>
        {isWinner && <span style={{ color: 'var(--green)', marginRight: '0.25rem' }}>✓</span>}
        {c.candidate_name}
      </span>
      <span style={{ color: 'var(--text-dim)', marginLeft: 'auto' }}>
        {fmtCount(c.total_votes)} votes
      </span>
      {c.total_raised > 0 && (
        <span style={{ color: 'var(--orange)' }}>{fmtMoney(c.total_raised)}</span>
      )}
      {c.cost_per_vote > 0 && (
        <span style={{ color: 'var(--text-dim)' }}>
          ${c.cost_per_vote.toFixed(2)}/vote
        </span>
      )}
    </div>
  );
}
