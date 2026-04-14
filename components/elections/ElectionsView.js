'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

const PARTY_COLOR = { REP: 'var(--republican)', DEM: 'var(--democrat)', NPA: 'var(--text-dim)' };
const PARTY_LABEL = { REP: 'R', DEM: 'D', NPA: 'I' };

const STATEWIDE_CONTESTS = new Set([
  'Governor', 'GOVERNOR AND  LT.GOVERNOR',
  'United States Senator', 'U.S. Senator',
  'Attorney General', 'ATTORNEY GENERAL',
  'Chief Financial Officer', 'CHIEF FINANCIAL OFFICER',
  'Commissioner of Agriculture', 'COMMISSIONER OF AGRICULTURE',
]);

const LEGISLATIVE_CONTESTS = new Set([
  'State Representative', 'STATE REPRESENTATIVE',
  'State Senator', 'STATE SENATOR',
]);

function fmtMoney(n) {
  if (!n) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

function fmtNum(n) {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function PartyDot({ party }) {
  return (
    <span style={{
      display: 'inline-block', width: '7px', height: '7px',
      borderRadius: '50%', background: PARTY_COLOR[party] || 'var(--text-dim)',
      marginRight: '5px', flexShrink: 0,
    }} />
  );
}

function StatewideRaceCard({ race }) {
  const realCandidates = race.candidates.filter(c => c.candidate_name !== 'UnderVotes' && c.finance_acct_num);
  if (!realCandidates.length) return null;

  const winner = realCandidates.find(c => c.winner);
  const sorted = [...realCandidates].sort((a, b) => (b.total_raised || 0) - (a.total_raised || 0));
  const maxRaised = sorted[0]?.total_raised || 1;

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '1rem 1.1rem', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {race.contest_name.replace('GOVERNOR AND  LT.GOVERNOR', 'Governor')}
        </div>
        {winner && (
          <div style={{ fontSize: '0.6rem', color: PARTY_COLOR[winner.party] || 'var(--green)', fontFamily: 'var(--font-mono)' }}>
            ✓ {winner.candidate_name}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {sorted.map(c => (
          <div key={c.candidate_name}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
              <PartyDot party={c.party} />
              <div style={{ fontSize: '0.72rem', color: c.winner ? 'var(--text)' : 'var(--text-dim)', flex: 1, fontWeight: c.winner ? 600 : 400 }}>
                {c.winner && <span style={{ color: 'var(--green)', marginRight: '4px', fontSize: '0.6rem' }}>✓</span>}
                {c.candidate_name}
                <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}> ({PARTY_LABEL[c.party] || c.party})</span>
              </div>
              <div style={{ fontSize: '0.66rem', fontFamily: 'var(--font-mono)', color: 'var(--orange)', textAlign: 'right' }}>
                {fmtMoney(c.total_raised)}
              </div>
              {c.total_votes > 0 && (
                <div style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', textAlign: 'right', minWidth: '60px' }}>
                  {fmtNum(c.total_votes)} votes
                </div>
              )}
              {c.cost_per_vote > 0 && (
                <div style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: 'var(--teal)', textAlign: 'right', minWidth: '55px' }}>
                  ${c.cost_per_vote.toFixed(2)}/v
                </div>
              )}
            </div>
            <div style={{
              height: '3px', borderRadius: '2px',
              background: PARTY_COLOR[c.party] || 'var(--text-dim)',
              width: `${Math.max(2, (c.total_raised / maxRaised) * 100)}%`,
              opacity: c.winner ? 0.8 : 0.35,
            }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function LegLeaderboard({ leaderboard, title, chamber }) {
  const [sortBy, setSortBy] = useState('raised');
  const data = leaderboard.filter(c =>
    chamber === 'all' ? true :
    chamber === 'house' ? c.contest_name === 'State Representative' || c.contest_name === 'STATE REPRESENTATIVE' :
    c.contest_name === 'State Senator' || c.contest_name === 'STATE SENATOR'
  );

  const sorted = useMemo(() => {
    return [...data].sort((a, b) =>
      sortBy === 'raised' ? (b.finance_total_raised || 0) - (a.finance_total_raised || 0) :
      sortBy === 'cpv' ? (b.cost_per_vote || 0) - (a.cost_per_vote || 0) :
      (b.total_votes || 0) - (a.total_votes || 0)
    ).slice(0, 20);
  }, [data, sortBy]);

  if (!sorted.length) return null;

  const SortBtn = ({ val, label }) => (
    <button
      onClick={() => setSortBy(val)}
      style={{
        fontSize: '0.58rem', padding: '0.2rem 0.5rem', borderRadius: '3px', cursor: 'pointer',
        border: `1px solid ${sortBy === val ? 'var(--orange)' : 'var(--border)'}`,
        background: sortBy === val ? 'rgba(255,176,96,0.1)' : 'transparent',
        color: sortBy === val ? 'var(--orange)' : 'var(--text-dim)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '0.62rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 600 }}>
          {title}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <SortBtn val="raised" label="by raised" />
          <SortBtn val="cpv" label="cost/vote" />
          <SortBtn val="votes" label="by votes" />
        </div>
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 90px 90px 70px', gap: '0', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)', padding: '0.4rem 0.85rem' }}>
          {['Candidate', 'Party', 'Raised', 'Votes', '$/Vote'].map(h => (
            <div key={h} style={{ fontSize: '0.55rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</div>
          ))}
        </div>
        {sorted.map((c, i) => (
          <div key={c.finance_acct_num || c.candidate_name} style={{
            display: 'grid', gridTemplateColumns: '1fr 50px 90px 90px 70px',
            padding: '0.45rem 0.85rem',
            borderBottom: i < sorted.length - 1 ? '1px solid rgba(100,140,220,0.08)' : 'none',
            background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
              <PartyDot party={c.party} />
              {c.finance_acct_num ? (
                <Link href={`/candidate/${c.finance_acct_num}`} style={{ fontSize: '0.72rem', color: 'var(--text)', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.candidate_name}
                </Link>
              ) : (
                <span style={{ fontSize: '0.72rem', color: 'var(--text)' }}>{c.candidate_name}</span>
              )}
            </div>
            <div style={{ fontSize: '0.65rem', color: PARTY_COLOR[c.party] || 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              {PARTY_LABEL[c.party] || c.party || '—'}
            </div>
            <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--orange)' }}>
              {fmtMoney(c.finance_total_raised)}
            </div>
            <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
              {fmtNum(c.total_votes)}
            </div>
            <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--teal)' }}>
              {c.cost_per_vote > 0 ? `$${c.cost_per_vote.toFixed(2)}` : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ElectionsView({ cycles, legLeaderboards = {} }) {
  const generals = cycles.filter(c => c.election_type === 'general').sort((a, b) => b.year - a.year);
  const [selectedYear, setSelectedYear] = useState(2024);

  const cycle = generals.find(c => c.year === selectedYear) || generals[0];

  const statewideRaces = useMemo(() => {
    const seen = new Set();
    return (cycle?.finance_races_top50 || []).filter(r => {
      if (!STATEWIDE_CONTESTS.has(r.contest_name)) return false;
      if (!r.candidates.some(c => c.finance_acct_num && c.candidate_name !== 'UnderVotes')) return false;
      const normalized = r.contest_name.toLowerCase().replace(/[^a-z]/g, '').replace('andlt', '');
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  }, [cycle]);

  const legLeaderboard = legLeaderboards[String(selectedYear)] || [];

  return (
    <div>
      {/* Cycle selector */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        {generals.map(c => (
          <button
            key={c.year}
            onClick={() => setSelectedYear(c.year)}
            style={{
              fontSize: '0.68rem', padding: '0.35rem 0.75rem', borderRadius: '3px', cursor: 'pointer',
              border: `1px solid ${selectedYear === c.year ? 'var(--orange)' : 'var(--border)'}`,
              background: selectedYear === c.year ? 'rgba(255,176,96,0.12)' : 'transparent',
              color: selectedYear === c.year ? 'var(--orange)' : 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {c.year}
          </button>
        ))}
      </div>

      {/* Cycle stats */}
      {cycle && (
        <div style={{ display: 'flex', gap: '0', border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden', marginBottom: '2rem' }}>
          {[
            { label: 'Total Contests', value: cycle.total_contests.toLocaleString(), color: 'var(--text)' },
            { label: 'Finance Matched', value: cycle.contests_with_finance.toLocaleString(), color: 'var(--green)' },
            { label: 'Match Rate', value: `${Math.round(cycle.contests_with_finance / cycle.total_contests * 100)}%`, color: 'var(--teal)' },
          ].map(({ label, value, color }, i, arr) => (
            <div key={label} style={{ flex: 1, padding: '0.65rem 1rem', borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>{label}</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Statewide races */}
      {statewideRaces.length > 0 && (
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 600, marginBottom: '1rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)' }}>
            Statewide Races — {selectedYear} General
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
            {statewideRaces.map(race => (
              <StatewideRaceCard key={race.contest_name} race={race} />
            ))}
          </div>
        </div>
      )}

      {/* FL Legislative leaderboard — 2024 only since we only load that flat file */}
      {legLeaderboard.length > 0 && (
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 600, marginBottom: '1rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)' }}>
            FL House + Senate — Finance-Matched Candidates · {selectedYear} General
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: '1rem', lineHeight: 1.6 }}>
            Individual campaign finance records matched to FL Division of Elections results.
            District-level grouping not available — sorted by total raised across all matched races.
          </div>
          <LegLeaderboard leaderboard={legLeaderboard} title="House + Senate Combined" chamber="all" />
        </div>
      )}

      {/* For non-2024 years: show top50 races as fallback */}
      {statewideRaces.length === 0 && legLeaderboard.length === 0 && cycle?.finance_races_top50?.length > 0 && (
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 600, marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)' }}>
            Top Finance Races · {selectedYear} General
          </div>
          {cycle.finance_races_top50.slice(0, 12).map(race => {
            const top = [...race.candidates].filter(c => c.finance_acct_num).sort((a, b) => (b.total_raised || 0) - (a.total_raised || 0))[0];
            if (!top) return null;
            return (
              <div key={race.contest_name} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px', gap: '0.5rem', padding: '0.5rem 0', borderBottom: '1px solid rgba(100,140,220,0.08)', alignItems: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text)' }}>{race.contest_name}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  <PartyDot party={top.party} />{top.candidate_name.split(' ').pop()}
                </div>
                <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--orange)', textAlign: 'right' }}>{fmtMoney(top.total_raised)}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* No data at all */}
      {statewideRaces.length === 0 && legLeaderboard.length === 0 && !cycle?.finance_races_top50?.length && (
        <div style={{ padding: '2rem', border: '1px solid var(--border)', borderRadius: '4px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.75rem' }}>
          Finance data for {selectedYear} general election not available at this time.
        </div>
      )}

      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '1.5rem', lineHeight: 1.7 }}>
        Source: FL Division of Elections results matched to campaign finance records.
        Finance data reflects hard-money contributions. Not all races have finance matches.
      </div>
    </div>
  );
}
