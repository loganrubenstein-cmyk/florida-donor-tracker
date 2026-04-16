'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { fmtMoneyCompact as fmtMoney, fmtCountCompact as fmtNum } from '@/lib/fmt';
import { PARTY_COLOR } from '@/lib/partyUtils';

const PARTY_LABEL = { REP: 'R', DEM: 'D', NPA: 'I' };

const STATEWIDE_CONTESTS = new Set([
  'Governor', 'GOVERNOR AND  LT.GOVERNOR',
  'United States Senator', 'U.S. Senator',
  'Attorney General', 'ATTORNEY GENERAL',
  'Chief Financial Officer', 'CHIEF FINANCIAL OFFICER',
  'Commissioner of Agriculture', 'COMMISSIONER OF AGRICULTURE',
]);

function PartyDot({ party }) {
  return (
    <span style={{
      display: 'inline-block', width: '7px', height: '7px',
      borderRadius: '50%', background: PARTY_COLOR[party] || 'var(--text-dim)',
      marginRight: '5px', flexShrink: 0,
    }} />
  );
}

function WinnerBadge() {
  return (
    <span style={{ color: 'var(--green)', fontSize: '0.58rem', marginRight: '4px' }}>✓</span>
  );
}

function StatewideRaceCard({ race }) {
  const realCandidates = race.candidates.filter(c => c.candidate_name !== 'UnderVotes' && c.finance_acct_num);
  if (!realCandidates.length) return null;

  const winner = realCandidates.find(c => c.winner);
  const sorted = [...realCandidates].sort((a, b) => (b.total_raised || 0) - (a.total_raised || 0));
  const maxRaised = sorted[0]?.total_raised || 1;
  const topFunded = sorted[0];
  const topFundedWon = topFunded?.winner;

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '1rem 1.1rem', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.85rem', gap: '0.5rem' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>
          {race.contest_name.replace('GOVERNOR AND  LT.GOVERNOR', 'Governor')}
        </div>
        {winner && (
          <div style={{ fontSize: '0.62rem', color: PARTY_COLOR[winner.party] || 'var(--green)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            ✓ {winner.candidate_name.split(' ').slice(-1)[0]}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {sorted.map(c => {
          const votePct = c.total_votes > 0 && realCandidates.reduce((s, x) => s + (x.total_votes || 0), 0) > 0
            ? Math.round(c.total_votes / realCandidates.reduce((s, x) => s + (x.total_votes || 0), 0) * 100)
            : null;
          return (
            <div key={c.candidate_name}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                <PartyDot party={c.party} />
                <div style={{ fontSize: '0.72rem', color: c.winner ? 'var(--text)' : 'var(--text-dim)', flex: 1, fontWeight: c.winner ? 600 : 400, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.winner && <WinnerBadge />}
                  {c.candidate_name}
                  <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}> ({PARTY_LABEL[c.party] || c.party})</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: '2px',
                    background: c.winner ? (PARTY_COLOR[c.party] || 'var(--green)') : 'rgba(255,255,255,0.15)',
                    width: `${Math.max(2, (c.total_raised / maxRaised) * 100)}%`,
                  }} />
                </div>
                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--orange)', minWidth: '55px', textAlign: 'right' }}>
                  {fmtMoney(c.total_raised)}
                </span>
                {votePct !== null && (
                  <span style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', minWidth: '36px', textAlign: 'right' }}>
                    {votePct}%
                  </span>
                )}
                {c.cost_per_vote > 0 && (
                  <span style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', color: 'var(--teal)', minWidth: '50px', textAlign: 'right' }}>
                    ${c.cost_per_vote.toFixed(2)}/v
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LegLeaderboard({ leaderboard, year }) {
  const [sortBy, setSortBy] = useState('raised');

  const sorted = useMemo(() => {
    return [...leaderboard].sort((a, b) =>
      sortBy === 'raised' ? (b.finance_total_raised || 0) - (a.finance_total_raised || 0) :
      sortBy === 'cpv' ? (b.cost_per_vote || 0) - (a.cost_per_vote || 0) :
      (b.total_votes || 0) - (a.total_votes || 0)
    ).slice(0, 25);
  }, [leaderboard, sortBy]);

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
          FL House + Senate — Finance-Matched · {year}
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <SortBtn val="raised" label="by raised" />
          <SortBtn val="cpv" label="cost/vote" />
          <SortBtn val="votes" label="by votes" />
        </div>
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1.8fr 40px 85px 80px 70px',
          background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)', padding: '0.4rem 0.85rem'
        }}>
          {['Candidate', 'Pty', 'Raised', 'Votes', '$/Vote'].map(h => (
            <div key={h} style={{ fontSize: '0.55rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</div>
          ))}
        </div>
        {sorted.map((c, i) => (
          <div key={c.finance_acct_num || c.candidate_name} style={{
            display: 'grid', gridTemplateColumns: '1.8fr 40px 85px 80px 70px',
            padding: '0.45rem 0.85rem',
            borderBottom: i < sorted.length - 1 ? '1px solid rgba(100,140,220,0.07)' : 'none',
            background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
              {c.winner && <WinnerBadge />}
              <PartyDot party={c.party} />
              {c.finance_acct_num ? (
                <Link href={`/candidate/${c.finance_acct_num}`} style={{ fontSize: '0.72rem', color: c.winner ? 'var(--text)' : 'var(--text-dim)', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: c.winner ? 600 : 400 }}>
                  {c.candidate_name}
                </Link>
              ) : (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{c.candidate_name}</span>
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

function MoneyWinsBanner({ cycle }) {
  const stat = useMemo(() => {
    const races = cycle?.finance_races_top50 || [];
    let total = 0, wins = 0;
    for (const race of races) {
      const financed = race.candidates.filter(c =>
        c.finance_acct_num && c.candidate_name !== 'UnderVotes' && (c.total_raised || 0) > 0
      );
      if (financed.length < 2) continue;
      const sorted = [...financed].sort((a, b) => (b.total_raised || 0) - (a.total_raised || 0));
      const top = sorted[0];
      if (top.winner !== undefined) {
        total++;
        if (top.winner) wins++;
      }
    }
    return total >= 3 ? { wins, total, pct: Math.round(wins / total * 100) } : null;
  }, [cycle]);

  if (!stat) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.65rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)',
      borderLeft: `3px solid var(--orange)`, borderRadius: '3px', marginBottom: '1.75rem',
    }}>
      <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--orange)', fontFamily: 'var(--font-mono)' }}>
        {stat.pct}%
      </span>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
        of the time, the top-funded candidate won — in {stat.wins} of {stat.total} finance-matched races
      </span>
    </div>
  );
}

export default function ElectionsView({ cycles, legLeaderboards = {}, legLeaderboardsPrimary = {} }) {
  const [electionType, setElectionType] = useState('general');
  const [selectedYear, setSelectedYear] = useState(2024);

  const filteredCycles = useMemo(() =>
    cycles.filter(c => c.election_type === electionType).sort((a, b) => b.year - a.year),
    [cycles, electionType]
  );

  const availableYears = useMemo(() => filteredCycles.map(c => c.year), [filteredCycles]);

  const resolvedYear = availableYears.includes(selectedYear) ? selectedYear : (availableYears[0] || 2024);
  const cycle = filteredCycles.find(c => c.year === resolvedYear) || filteredCycles[0];

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

  const leaderboardMap = electionType === 'general' ? legLeaderboards : legLeaderboardsPrimary;
  const legLeaderboard = leaderboardMap[String(resolvedYear)] || [];

  function TypeBtn({ val, label }) {
    const active = electionType === val;
    return (
      <button
        onClick={() => setElectionType(val)}
        style={{
          fontSize: '0.7rem', padding: '0.3rem 0.8rem', borderRadius: '3px', cursor: 'pointer',
          border: `1px solid ${active ? 'var(--orange)' : 'var(--border)'}`,
          background: active ? 'rgba(255,176,96,0.12)' : 'transparent',
          color: active ? 'var(--orange)' : 'var(--text-dim)',
          fontFamily: 'var(--font-mono)', fontWeight: active ? 700 : 400,
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <div>
      {/* General / Primary toggle */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <TypeBtn val="general" label="General" />
        <TypeBtn val="primary" label="Primary" />
      </div>

      {/* Year selector */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.75rem' }}>
        {filteredCycles.map(c => (
          <button
            key={c.year}
            onClick={() => setSelectedYear(c.year)}
            style={{
              fontSize: '0.68rem', padding: '0.3rem 0.7rem', borderRadius: '3px', cursor: 'pointer',
              border: `1px solid ${resolvedYear === c.year ? 'var(--teal)' : 'var(--border)'}`,
              background: resolvedYear === c.year ? 'rgba(77,216,240,0.1)' : 'transparent',
              color: resolvedYear === c.year ? 'var(--teal)' : 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {c.year}
          </button>
        ))}
      </div>

      {/* Cycle stats */}
      {cycle && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden', marginBottom: '1.5rem' }}>
          {[
            { label: 'Total Contests', value: cycle.total_contests.toLocaleString(), color: 'var(--text)' },
            { label: 'Finance Matched', value: cycle.contests_with_finance.toLocaleString(), color: 'var(--green)' },
            { label: 'Match Rate', value: `${Math.round(cycle.contests_with_finance / cycle.total_contests * 100)}%`, color: 'var(--teal)' },
          ].map(({ label, value, color }, i, arr) => (
            <div key={label} style={{ padding: '0.65rem 1rem', borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none', background: 'var(--surface)' }}>
              <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>{label}</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Money-wins banner */}
      <MoneyWinsBanner cycle={cycle} />

      {/* Statewide races */}
      {statewideRaces.length > 0 && (
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 600, marginBottom: '1rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)' }}>
            Statewide Races — {resolvedYear} {electionType === 'primary' ? 'Primary' : 'General'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
            {statewideRaces.map(race => (
              <StatewideRaceCard key={race.contest_name} race={race} />
            ))}
          </div>
        </div>
      )}

      {/* FL Legislative leaderboard */}
      {legLeaderboard.length > 0 && (
        <div style={{ marginBottom: '2.5rem' }}>
          <LegLeaderboard leaderboard={legLeaderboard} year={resolvedYear} />
        </div>
      )}

      {/* Fallback: top50 races for years without flat files */}
      {statewideRaces.length === 0 && legLeaderboard.length === 0 && cycle?.finance_races_top50?.length > 0 && (
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 600, marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)' }}>
            Top Finance Races · {resolvedYear} {electionType === 'primary' ? 'Primary' : 'General'}
          </div>
          {cycle.finance_races_top50.slice(0, 15).map(race => {
            const top = [...race.candidates].filter(c => c.finance_acct_num).sort((a, b) => (b.total_raised || 0) - (a.total_raised || 0))[0];
            if (!top) return null;
            const winner = race.candidates.find(c => c.winner && c.finance_acct_num);
            return (
              <div key={race.contest_name} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 80px', gap: '0.5rem', padding: '0.5rem 0', borderBottom: '1px solid rgba(100,140,220,0.08)', alignItems: 'center' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text)' }}>
                  {race.contest_name}
                </div>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center' }}>
                  {winner && <WinnerBadge />}
                  <PartyDot party={(winner || top).party} />
                  {(winner || top).candidate_name.split(' ').slice(-1)[0]}
                </div>
                <div style={{ fontSize: '0.66rem', fontFamily: 'var(--font-mono)', color: 'var(--orange)', textAlign: 'right' }}>{fmtMoney(top.total_raised)}</div>
              </div>
            );
          })}
        </div>
      )}

      {statewideRaces.length === 0 && legLeaderboard.length === 0 && !cycle?.finance_races_top50?.length && (
        <div style={{ padding: '2rem', border: '1px solid var(--border)', borderRadius: '4px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.75rem' }}>
          No finance data available for {resolvedYear} {electionType}.
        </div>
      )}

      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '1.5rem', lineHeight: 1.7, borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
        Source: <a href="https://dos.elections.myflorida.com/election-results/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>FL Division of Elections</a> results matched to campaign finance records.
        Finance totals reflect hard-money contributions only. Not all candidates have finance matches.
        District-level grouping not available for legislative races.
      </div>
    </div>
  );
}
