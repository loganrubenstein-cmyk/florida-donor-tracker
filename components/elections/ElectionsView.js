'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { fmtMoneyCompact as fmtMoney, fmtCountCompact as fmtNum } from '@/lib/fmt';
import { PARTY_COLOR } from '@/lib/partyUtils';

const PARTY_LABEL = { REP: 'R', DEM: 'D', NPA: 'I', LPF: 'L', IND: 'I' };
const SKIP_NAMES = new Set(['UnderVotes', 'OverVotes', 'WriteinVotes', 'Write-ins', 'WriteinVotes', 'WRITE-IN']);

const STATEWIDE_CONTESTS = new Set([
  'Governor and Lieutenant Governor', 'GOVERNOR AND  LT.GOVERNOR', 'Governor',
  'United States Senator', 'U.S. Senator',
  'Attorney General', 'ATTORNEY GENERAL',
  'Chief Financial Officer', 'CHIEF FINANCIAL OFFICER',
  'Commissioner of Agriculture', 'COMMISSIONER OF AGRICULTURE',
]);

const CONTEST_DISPLAY = {
  'Governor and Lieutenant Governor': 'Governor / Lt. Governor',
  'GOVERNOR AND  LT.GOVERNOR': 'Governor / Lt. Governor',
  'United States Senator': 'U.S. Senate',
  'Attorney General': 'Attorney General',
  'Chief Financial Officer': 'Chief Financial Officer',
  'Commissioner of Agriculture': 'Commissioner of Agriculture',
};

const LEG_CONTESTS = new Set(['State Representative', 'State Senator']);

function PartyDot({ party }) {
  return (
    <span style={{
      display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%',
      background: PARTY_COLOR[party] || 'var(--text-dim)',
      flexShrink: 0,
    }} />
  );
}

function BallotRaceCard({ title, subtitle, candidates, useWinnerFlag = false }) {
  const valid = candidates.filter(c => !SKIP_NAMES.has(c.candidate_name));
  if (!valid.length) return null;
  const sorted = [...valid].sort((a, b) => (b.total_votes || 0) - (a.total_votes || 0));
  const totalVotes = sorted.reduce((s, c) => s + (c.total_votes || 0), 0);
  const maxVotes = sorted[0]?.total_votes || 1;

  function isWinner(c, idx) {
    if (useWinnerFlag) return !!c.winner;
    return idx === 0 && totalVotes > 0;
  }

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: '5px',
      background: 'var(--surface)', overflow: 'hidden',
    }}>
      <div style={{
        padding: '0.6rem 0.9rem', borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem',
      }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 400, color: 'var(--text)', fontFamily: 'var(--font-serif)' }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', flexShrink: 0 }}>{subtitle}</div>
        )}
      </div>
      <div style={{ padding: '0.5rem 0' }}>
        {sorted.map((c, idx) => {
          const won = isWinner(c, idx);
          const votePct = totalVotes > 0 ? Math.round(c.total_votes / totalVotes * 100) : null;
          const barPct = maxVotes > 0 ? (c.total_votes / maxVotes * 100) : 0;
          const pColor = PARTY_COLOR[c.party] || 'var(--text-dim)';
          return (
            <div key={`${c.candidate_name}-${idx}`} style={{ padding: '0.45rem 0.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                <PartyDot party={c.party} />
                <div style={{
                  flex: 1, fontSize: '0.83rem', minWidth: 0,
                  color: won ? 'var(--text)' : 'var(--text-dim)',
                  fontWeight: won ? 600 : 400,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {won && <span style={{ color: 'var(--green)', marginRight: '0.3rem', fontSize: '0.75rem' }}>✓</span>}
                  {c.finance_acct_num ? (
                    <a href={`/candidate/${c.finance_acct_num}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                      {c.candidate_name}
                    </a>
                  ) : c.candidate_name}
                  <span style={{ marginLeft: '0.35rem', fontSize: '0.68rem', color: pColor, fontWeight: 400 }}>
                    ({PARTY_LABEL[c.party] || c.party || '?'})
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexShrink: 0 }}>
                  {votePct !== null && (
                    <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: won ? 'var(--text)' : 'var(--text-dim)', minWidth: '28px', textAlign: 'right' }}>
                      {votePct}%
                    </span>
                  )}
                  {c.total_votes > 0 && (
                    <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', minWidth: '52px', textAlign: 'right' }}>
                      {fmtNum(c.total_votes)}
                    </span>
                  )}
                  {c.finance_total_raised > 0 && (
                    <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--orange)', minWidth: '50px', textAlign: 'right' }}>
                      {fmtMoney(c.finance_total_raised)}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ height: '3px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', marginLeft: '1.1rem' }}>
                <div style={{
                  height: '100%', borderRadius: '2px',
                  width: `${Math.max(1, barPct)}%`,
                  background: won ? (pColor || 'var(--green)') : 'rgba(255,255,255,0.15)',
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>
          );
        })}
      </div>
      {totalVotes > 0 && (
        <div style={{ padding: '0.3rem 0.9rem 0.55rem', fontSize: '0.6rem', color: 'rgba(90,106,136,0.6)', fontFamily: 'var(--font-mono)' }}>
          {totalVotes.toLocaleString()} votes cast
        </div>
      )}
    </div>
  );
}

function MoneyWinsBanner() { return null; }

function SkeletonRace() {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '5px', background: 'var(--surface)', padding: '0.6rem 0.9rem' }}>
      <div className="skeleton-row" style={{ height: '16px', width: '40%', marginBottom: '0.75rem' }} />
      {[75, 50, 30].map((w, i) => (
        <div key={i} className="skeleton-row" style={{ height: '28px', width: `${w}%`, marginBottom: '0.4rem' }} />
      ))}
    </div>
  );
}

export default function ElectionsView({ cycles, districtMap = {} }) {
  const [electionType, setElectionType] = useState('general');
  const [selectedYear, setSelectedYear] = useState(2024);
  const [activeTab, setActiveTab] = useState('statewide');
  const [search, setSearch] = useState('');
  const [flatData, setFlatData] = useState(null);
  const [fetching, setFetching] = useState(false);

  const filteredCycles = useMemo(() =>
    cycles.filter(c => c.election_type === electionType).sort((a, b) => b.year - a.year),
    [cycles, electionType]
  );
  const availableYears = useMemo(() => filteredCycles.map(c => c.year), [filteredCycles]);
  const resolvedYear = availableYears.includes(selectedYear) ? selectedYear : (availableYears[0] || 2024);
  const cycle = filteredCycles.find(c => c.year === resolvedYear) || filteredCycles[0];

  useEffect(() => {
    setFetching(true);
    setFlatData(null);
    fetch(`/data/elections/${resolvedYear}_${electionType}.json`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setFlatData(data); setFetching(false); })
      .catch(() => setFetching(false));
  }, [resolvedYear, electionType]);

  function getDistrict(c) {
    const acct = c.finance_acct_num;
    if (!acct || !districtMap[acct]) return null;
    const yearMap = districtMap[acct];
    return (
      yearMap[String(resolvedYear)] ||
      yearMap['2024'] || yearMap['2022'] || yearMap['2020'] || yearMap['2018'] ||
      Object.values(yearMap)[0] || null
    );
  }

  const { statewideRaces, legRaces, flatStats } = useMemo(() => {
    if (!flatData) return { statewideRaces: [], legRaces: [], flatStats: null };
    const candidates = flatData.candidates || [];

    // Statewide - group by contest_name
    const swMap = {};
    for (const c of candidates) {
      if (SKIP_NAMES.has(c.candidate_name)) continue;
      if (STATEWIDE_CONTESTS.has(c.contest_name)) {
        const key = CONTEST_DISPLAY[c.contest_name] || c.contest_name;
        if (!swMap[key]) swMap[key] = [];
        swMap[key].push(c);
      }
    }

    // Legislature - group by district
    const legMap = {};
    for (const c of candidates) {
      if (SKIP_NAMES.has(c.candidate_name)) continue;
      if (!LEG_CONTESTS.has(c.contest_name)) continue;
      const district = getDistrict(c);
      if (!district) continue;
      const prefix = c.contest_name === 'State Representative' ? 'HD' : 'SD';
      const key = `${prefix}_${district}`;
      if (!legMap[key]) legMap[key] = { prefix, district, contestName: c.contest_name, candidates: [] };
      legMap[key].candidates.push(c);
    }

    const statewideRaces = Object.entries(swMap).map(([name, cands]) => ({ name, candidates: cands }));
    const legRaces = Object.values(legMap).sort((a, b) => {
      if (a.prefix !== b.prefix) return a.prefix === 'HD' ? -1 : 1;
      return parseInt(a.district || '999') - parseInt(b.district || '999');
    });

    const flatStats = {
      total: candidates.filter(c => !SKIP_NAMES.has(c.candidate_name)).length,
      matched: candidates.filter(c => c.finance_acct_num && !SKIP_NAMES.has(c.candidate_name)).length,
    };

    return { statewideRaces, legRaces, flatStats };
  }, [flatData, districtMap, resolvedYear]);

  const filteredLegRaces = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return legRaces;

    const hdMatch = s.match(/(?:hd|house|h\.d\.|state\s+rep)[\s#.]*(\d+)/);
    const sdMatch = s.match(/(?:sd|senate|s\.d\.|state\s+sen)[\s#.]*(\d+)/);
    const numOnly = !hdMatch && !sdMatch && s.match(/^(\d+)$/);

    if (hdMatch || sdMatch || numOnly) {
      const num = ((hdMatch || sdMatch || numOnly)[1]).padStart(3, '0');
      const type = hdMatch ? 'HD' : sdMatch ? 'SD' : null;
      return legRaces.filter(r => {
        const rNum = String(parseInt(r.district || '0')).padStart(3, '0');
        return (!type || r.prefix === type) && rNum === num;
      });
    }

    return legRaces.filter(r =>
      r.candidates.some(c => c.candidate_name.toLowerCase().includes(s))
    );
  }, [legRaces, search]);

  const filteredStatewideRaces = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return statewideRaces;
    return statewideRaces.filter(r =>
      r.name.toLowerCase().includes(s) ||
      r.candidates.some(c => c.candidate_name.toLowerCase().includes(s))
    );
  }, [statewideRaces, search]);

  function TabBtn({ val, label, count }) {
    const active = activeTab === val;
    return (
      <button onClick={() => setActiveTab(val)} style={{
        fontSize: '0.78rem', padding: '0.35rem 0.85rem', borderRadius: '3px',
        cursor: 'pointer', fontFamily: 'var(--font-mono)',
        border: `1px solid ${active ? 'var(--teal)' : 'var(--border)'}`,
        background: active ? 'rgba(77,216,240,0.1)' : 'transparent',
        color: active ? 'var(--teal)' : 'var(--text-dim)',
        fontWeight: active ? 600 : 400,
      }}>
        {label}
        {count !== undefined && (
          <span style={{ marginLeft: '0.4rem', fontSize: '0.6rem', opacity: 0.7 }}>
            ({count})
          </span>
        )}
      </button>
    );
  }

  const showingLeg = activeTab === 'legislature';
  const racesToShow = showingLeg ? filteredLegRaces : filteredStatewideRaces;

  return (
    <div>
      {/* General / Primary toggle */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {['general', 'primary'].map(type => (
          <button key={type} onClick={() => setElectionType(type)} style={{
            fontSize: '0.72rem', padding: '0.3rem 0.8rem', borderRadius: '3px', cursor: 'pointer',
            border: `1px solid ${electionType === type ? 'var(--orange)' : 'var(--border)'}`,
            background: electionType === type ? 'rgba(255,176,96,0.12)' : 'transparent',
            color: electionType === type ? 'var(--orange)' : 'var(--text-dim)',
            fontFamily: 'var(--font-mono)', fontWeight: electionType === type ? 700 : 400,
          }}>
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>

      {/* Year selector */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {filteredCycles.map(c => (
          <button key={c.year} onClick={() => setSelectedYear(c.year)} style={{
            fontSize: '0.72rem', padding: '0.3rem 0.7rem', borderRadius: '3px', cursor: 'pointer',
            border: `1px solid ${resolvedYear === c.year ? 'var(--teal)' : 'var(--border)'}`,
            background: resolvedYear === c.year ? 'rgba(77,216,240,0.1)' : 'transparent',
            color: resolvedYear === c.year ? 'var(--teal)' : 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
          }}>
            {c.year}
          </button>
        ))}
      </div>

      {/* Cycle stats row */}
      {cycle && (
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', padding: '0.75rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', marginBottom: '1.25rem' }}>
          {[
            { label: 'Year', value: `${resolvedYear} ${electionType.charAt(0).toUpperCase() + electionType.slice(1)}`, color: 'var(--text)', href: `/cycle/${resolvedYear}` },
            { label: 'Total Contests', value: cycle.total_contests?.toLocaleString(), color: 'var(--text)' },
            { label: 'Finance Matched', value: cycle.contests_with_finance?.toLocaleString(), color: 'var(--green)' },
            flatStats && { label: 'Candidates', value: flatStats.total.toLocaleString(), color: 'var(--text-dim)' },
          ].filter(Boolean).map(({ label, value, color, href }) => (
            <div key={label}>
              <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.15rem' }}>{label}</div>
              {href ? (
                <Link href={href} style={{ fontSize: '0.92rem', fontWeight: 400, color, fontFamily: 'var(--font-serif)', fontVariantNumeric: 'tabular-nums', textDecoration: 'none' }}>{value || '—'}</Link>
              ) : (
                <div style={{ fontSize: '0.92rem', fontWeight: 400, color, fontFamily: 'var(--font-serif)', fontVariantNumeric: 'tabular-nums' }}>{value || '—'}</div>
              )}
            </div>
          ))}
        </div>
      )}

      <MoneyWinsBanner cycle={cycle} />

      {/* Search */}
      <div style={{ marginBottom: '1.25rem' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder='Search races, candidates, or districts — e.g. "HD 96" or "DeSantis"'
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--surface)', border: '1px solid var(--border)',
            color: 'var(--text)', padding: '0.5rem 0.75rem',
            fontSize: '0.82rem', borderRadius: '3px',
            fontFamily: 'var(--font-mono)', outline: 'none',
            transition: 'border-color 0.12s',
          }}
          onFocus={e => e.target.style.borderColor = 'rgba(77,216,240,0.45)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <TabBtn val="statewide" label="Statewide" count={fetching ? null : statewideRaces.length} />
        <TabBtn val="legislature" label="Legislature" count={fetching ? null : legRaces.length} />
      </div>

      {/* Content */}
      {fetching ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {[1, 2, 3].map(i => <SkeletonRace key={i} />)}
        </div>
      ) : !flatData ? (
        <div style={{ padding: '1.75rem 2rem', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-dim)', fontSize: '0.78rem', lineHeight: 1.8 }}>
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '0.5rem' }}>
            Race-by-race detail isn't available for {resolvedYear} {electionType === 'general' ? 'General' : 'Primary'} yet.
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            Finance data for this cycle is available in the Candidates and Cycles directories, where you can filter by year, office, and party.
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <a href={`/candidates?year=${resolvedYear}`} style={{ color: 'var(--orange)', textDecoration: 'none', border: '1px solid rgba(255,176,96,0.3)', borderRadius: '3px', padding: '0.3rem 0.7rem', fontSize: '0.72rem' }}>
              → Candidates ({resolvedYear})
            </a>
            <a href={`/cycle/${resolvedYear}`} style={{ color: 'var(--orange)', textDecoration: 'none', border: '1px solid rgba(255,176,96,0.3)', borderRadius: '3px', padding: '0.3rem 0.7rem', fontSize: '0.72rem' }}>
              → {resolvedYear} Cycle overview
            </a>
            <a href="/elections?year=2022" style={{ color: 'var(--text-dim)', textDecoration: 'none', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.3rem 0.7rem', fontSize: '0.72rem' }}>
              → View 2022 results
            </a>
          </div>
        </div>
      ) : activeTab === 'statewide' ? (
        <>
          {filteredStatewideRaces.length === 0 && search ? (
            <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem', padding: '1rem 0' }}>
              No statewide races match "{search}"
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1rem' }}>
              {filteredStatewideRaces.map(race => (
                <BallotRaceCard
                  key={race.name}
                  title={race.name}
                  candidates={race.candidates}
                  useWinnerFlag
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Legislature header / context */}
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '1rem', lineHeight: 1.6 }}>
            Showing <strong style={{ color: 'var(--text)' }}>{filteredLegRaces.length}</strong> of{' '}
            <strong style={{ color: 'var(--text)' }}>{legRaces.length}</strong> districts with finance-matched candidates.
            {search && legRaces.length > 0 && filteredLegRaces.length === 0 && (
              <span style={{ color: 'var(--text-dim)' }}> No results for "{search}" — try "HD 11" or a candidate name.</span>
            )}
          </div>

          {filteredLegRaces.length === 0 && !search ? (
            <div style={{ padding: '2rem', border: '1px solid var(--border)', borderRadius: '4px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.78rem' }}>
              No legislative race data available for {resolvedYear} {electionType}.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {filteredLegRaces.map(race => (
                <BallotRaceCard
                  key={`${race.prefix}_${race.district}`}
                  title={`${race.prefix} ${parseInt(race.district)} — ${race.contestName}`}
                  candidates={race.candidates}
                  useWinnerFlag={false}
                />
              ))}
            </div>
          )}

          <div style={{ marginTop: '1.25rem', fontSize: '0.65rem', color: 'var(--text-dim)', lineHeight: 1.7, padding: '0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px' }}>
            <strong style={{ color: 'var(--text)' }}>Note on legislative data:</strong> Districts are matched by linking election candidates to FL Division of Elections finance records.
            Only candidates with a finance account match appear here — unmatched candidates (those who raised no reportable money) are not shown.
            Winners in district races are inferred as the highest vote-getter among matched candidates.
          </div>
        </>
      )}

      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '2rem', lineHeight: 1.7, borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
        Source:{' '}
        <a href="https://dos.elections.myflorida.com/election-results/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>
          FL Division of Elections
        </a>{' '}
        results matched to campaign finance records. Finance totals reflect hard-money contributions. Not all candidates have finance matches.
      </div>
    </div>
  );
}
