'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { fmtMoney, fmtMoneyCompact } from '@/lib/fmt';
import DataTrustBlock from '@/components/shared/DataTrustBlock';

const PARTY_COLOR = { R: 'var(--republican)', D: 'var(--democrat)', I: 'var(--orange)', NPA: 'var(--text-dim)' };
const PARTY_LABEL = { R: 'Republican', D: 'Democrat', I: 'Independent', NPA: 'No Party Affiliation' };
const TYPE_COLOR = { individual: 'var(--green)', corporate: 'var(--blue)', committee: 'var(--orange)', unknown: 'var(--text-dim)' };
const TYPE_LABEL = { individual: 'Individual', corporate: 'Corporate', committee: 'Committee/PAC', unknown: 'Other' };

export default function DistrictLookup() {
  const [chamber, setChamber] = useState('House');
  const [district, setDistrict] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const didAutoLoad = useRef(false);

  const maxDistrict = chamber === 'Senate' ? 40 : 120;

  // Auto-load from URL params (e.g. ?chamber=House&district=1)
  useEffect(() => {
    if (didAutoLoad.current) return;
    const params = new URLSearchParams(window.location.search);
    const ch = params.get('chamber');
    const dist = params.get('district');
    if (ch && dist) {
      didAutoLoad.current = true;
      const validChamber = ch === 'Senate' ? 'Senate' : 'House';
      setChamber(validChamber);
      setDistrict(dist);
      // Trigger lookup after state is set
      setLoading(true);
      fetch(`/api/district?chamber=${validChamber}&district=${dist}`)
        .then(async r => {
          const json = await r.json();
          if (!r.ok) setError(json.error || 'Lookup failed');
          else setData(json);
        })
        .catch(() => setError('Network error'))
        .finally(() => setLoading(false));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLookup() {
    const num = parseInt(district, 10);
    if (!num || num < 1 || num > maxDistrict) {
      setError(`Enter a district number between 1 and ${maxDistrict}`);
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/district?chamber=${chamber}&district=${num}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Lookup failed'); return; }
      setData(json);
    } catch (e) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.6rem', color: 'var(--orange)', margin: 0 }}>
          Money in Your District
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.78rem', marginTop: '0.35rem' }}>
          Look up your Florida legislator — see who funds them, how they vote, and how their fundraising compares.
        </p>
      </div>

      {/* Input controls */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Chamber</label>
          <div style={{ display: 'flex', gap: 0 }}>
            {['House', 'Senate'].map(c => (
              <button key={c} onClick={() => { setChamber(c); setData(null); setError(null); }}
                style={{
                  padding: '0.5rem 1rem', fontSize: '0.78rem', fontFamily: 'var(--font-mono)',
                  background: chamber === c ? 'var(--orange)' : 'var(--surface)',
                  color: chamber === c ? '#000' : 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: c === 'House' ? '3px 0 0 3px' : '0 3px 3px 0',
                  cursor: 'pointer', transition: 'all 0.12s',
                }}>
                {c}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>District (1–{maxDistrict})</label>
          <input
            type="number" min={1} max={maxDistrict} value={district}
            onChange={e => setDistrict(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLookup()}
            placeholder={`e.g. ${Math.ceil(maxDistrict / 3)}`}
            style={{
              padding: '0.5rem 0.75rem', fontSize: '0.82rem', fontFamily: 'var(--font-mono)',
              background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)',
              borderRadius: '3px', width: '100px',
            }}
          />
        </div>
        <button onClick={handleLookup} disabled={loading}
          style={{
            padding: '0.5rem 1.25rem', fontSize: '0.82rem', fontFamily: 'var(--font-mono)',
            background: 'var(--orange)', color: '#000', border: 'none', borderRadius: '3px',
            cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
          }}>
          {loading ? 'Looking up…' : 'Look Up'}
        </button>
      </div>

      {/* Quick district selector */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '1.5rem' }}>
        {[1, 10, 20, 30, 40, ...(chamber === 'House' ? [50, 60, 80, 100, 120] : [])].map(n => (
          <button key={n} onClick={() => { setDistrict(String(n)); }}
            style={{
              padding: '0.2rem 0.5rem', fontSize: '0.65rem', fontFamily: 'var(--font-mono)',
              background: 'transparent', color: 'var(--text-dim)', border: '1px solid var(--border)',
              borderRadius: '3px', cursor: 'pointer',
            }}>
            {n}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '3px', color: 'var(--republican)', fontSize: '0.78rem' }}>
          {error}
        </div>
      )}

      {data && <DistrictResult data={data} />}

      <div style={{ marginTop: '2rem' }}>
        <DataTrustBlock
          source="Florida Division of Elections + LegiScan"
          sourceUrl="https://dos.elections.myflorida.com/campaign-finance/contributions/"
          
          direct={['legislator name', 'district', 'party', 'counties', 'total raised', 'voting record']}
          normalized={['donor names and types', 'chamber average/median fundraising']}
          caveats={[
            'Top donors shown are from direct campaign account only — PAC/soft money not included.',
            'Chamber averages include all current members with fundraising > $0.',
            'Voting record sourced from LegiScan roll call data for current legislative session.',
          ]}
        />
      </div>
    </div>
  );
}

function DistrictResult({ data }) {
  const { legislator: leg, top_donors, donor_type_breakdown, comparison, recent_votes } = data;
  const partyColor = PARTY_COLOR[leg.party] || 'var(--text)';
  const totalRaised = leg.total_raised;
  const topAmount = top_donors.length > 0 ? top_donors[0].amount : 1;

  return (
    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
      {/* Legislator header card */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
        padding: '1.25rem', marginBottom: '1rem', borderLeft: `3px solid ${partyColor}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
              {leg.chamber} District {leg.district}
            </div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: '1.3rem', color: 'var(--text)' }}>
              <Link href={`/legislator/${leg.people_id}`} style={{ color: 'var(--text)', textDecoration: 'none', borderBottom: '1px solid var(--border)' }}>
                {leg.name}
              </Link>
            </h2>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.4rem', fontSize: '0.72rem', flexWrap: 'wrap' }}>
              <span style={{ color: partyColor }}>{PARTY_LABEL[leg.party] || leg.party}</span>
              {leg.leadership && <span style={{ color: 'var(--orange)' }}>{leg.leadership}</span>}
              {leg.counties.length > 0 && (
                <span style={{ color: 'var(--text-dim)' }}>{leg.counties.join(', ')}</span>
              )}
              {leg.term_limit_year && (
                <span style={{ color: 'var(--text-dim)' }}>Term-limited {leg.term_limit_year}</span>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.2rem', fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>
              {fmtMoneyCompact(totalRaised)}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>total raised</div>
          </div>
        </div>
      </div>

      {/* Fundraising comparison bar */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
        padding: '1rem', marginBottom: '1rem',
      }}>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
          Fundraising vs. {leg.chamber} Average
        </div>
        <ComparisonBar
          raised={totalRaised}
          avg={comparison.chamber_avg}
          median={comparison.chamber_median}
          pctOfAvg={comparison.pct_of_avg}
        />
      </div>

      {/* Voting participation */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
        padding: '1rem', marginBottom: '1rem',
      }}>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
          Voting Record
        </div>
        <VotingBar voting={leg.voting} />
      </div>

      {/* Two-column: Top Donors + Donor Types */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        {/* Top Donors */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
          padding: '1rem', gridColumn: top_donors.length === 0 ? '1 / -1' : undefined,
        }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
            Top Donors
          </div>
          {top_donors.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>No donor data available</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {top_donors.slice(0, 10).map((d, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <div style={{
                    position: 'absolute', top: 0, left: 0, bottom: 0,
                    width: `${(d.amount / topAmount) * 100}%`,
                    background: TYPE_COLOR[d.type] || '#888', opacity: 0.1,
                    borderRadius: '2px',
                  }} />
                  <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0.4rem', fontSize: '0.72rem' }}>
                    <Link href={`/donor/${d.slug}`} style={{ color: 'var(--text)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                      {d.name}
                    </Link>
                    <span style={{ color: TYPE_COLOR[d.type] || 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
                      {fmtMoney(d.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Donor Type Breakdown */}
        {Object.keys(donor_type_breakdown).length > 0 && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
            padding: '1rem',
          }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
              Donor Types
            </div>
            <DonorTypeBar breakdown={donor_type_breakdown} />
          </div>
        )}
      </div>

      {/* Recent Votes */}
      {recent_votes.length > 0 && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
          padding: '1rem', marginBottom: '1rem',
        }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
            Recent Votes
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {recent_votes.map((v, i) => {
              const voteColor = v.vote === 'Yea' ? 'var(--green)' : v.vote === 'Nay' ? 'var(--republican)' : 'var(--text-dim)';
              return (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.3rem 0.4rem', fontSize: '0.72rem',
                  borderBottom: i < recent_votes.length - 1 ? '1px solid rgba(100,140,220,0.08)' : 'none',
                }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%', color: 'var(--text)' }}>
                    <span style={{ color: 'var(--teal)', marginRight: '0.4rem' }}>{v.bill}</span>
                    {v.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: voteColor, fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 600 }}>
                      {v.vote}
                    </span>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.62rem' }}>
                      {v.date}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Links */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.72rem' }}>
        <Link href={`/legislator/${leg.people_id}`} style={{ color: 'var(--orange)', textDecoration: 'none' }}>
          Full legislator profile →
        </Link>
        {leg.acct_num && (
          <Link href={`/candidate/${leg.acct_num}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
            Campaign finance details →
          </Link>
        )}
        {leg.twitter && (
          <a href={`https://twitter.com/${leg.twitter}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>
            @{leg.twitter}
          </a>
        )}
      </div>
    </div>
  );
}

function ComparisonBar({ raised, avg, median, pctOfAvg }) {
  const maxVal = Math.max(raised, avg, median) * 1.1;
  const raisedPct = (raised / maxVal) * 100;
  const avgPct = (avg / maxVal) * 100;
  const medianPct = (median / maxVal) * 100;

  const aboveAvg = pctOfAvg > 100;
  const diff = aboveAvg ? pctOfAvg - 100 : 100 - pctOfAvg;
  const diffColor = aboveAvg ? 'var(--republican)' : 'var(--green)';
  const diffLabel = aboveAvg ? `${diff}% above average` : `${diff}% below average`;

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {/* This legislator */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', marginBottom: '0.2rem' }}>
            <span style={{ color: 'var(--text)' }}>This legislator</span>
            <span style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>{fmtMoneyCompact(raised)}</span>
          </div>
          <div style={{ height: '10px', background: 'rgba(100,140,220,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${raisedPct}%`, background: 'var(--green)', borderRadius: '2px', transition: 'width 0.5s' }} />
          </div>
        </div>
        {/* Chamber average */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', marginBottom: '0.2rem' }}>
            <span style={{ color: 'var(--text-dim)' }}>Chamber average</span>
            <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{fmtMoneyCompact(avg)}</span>
          </div>
          <div style={{ height: '10px', background: 'rgba(100,140,220,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${avgPct}%`, background: 'var(--text-dim)', borderRadius: '2px', opacity: 0.5, transition: 'width 0.5s' }} />
          </div>
        </div>
        {/* Median */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', marginBottom: '0.2rem' }}>
            <span style={{ color: 'var(--text-dim)' }}>Chamber median</span>
            <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{fmtMoneyCompact(median)}</span>
          </div>
          <div style={{ height: '10px', background: 'rgba(100,140,220,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${medianPct}%`, background: 'var(--text-dim)', borderRadius: '2px', opacity: 0.3, transition: 'width 0.5s' }} />
          </div>
        </div>
      </div>
      <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: diffColor }}>
        {diffLabel}
      </div>
    </div>
  );
}

function VotingBar({ voting }) {
  const total = voting.yea + voting.nay + voting.nv + voting.absent;
  if (total === 0) return <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>No voting data available</div>;

  const segments = [
    { label: 'Yea', count: voting.yea, color: 'var(--green)' },
    { label: 'Nay', count: voting.nay, color: 'var(--republican)' },
    { label: 'NV', count: voting.nv, color: 'var(--text-dim)' },
    { label: 'Absent', count: voting.absent, color: 'var(--gold)' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', height: '14px', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.5rem' }}>
        {segments.map(s => s.count > 0 && (
          <div key={s.label} style={{
            width: `${(s.count / total) * 100}%`, background: s.color, opacity: 0.7,
            transition: 'width 0.5s',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.68rem', flexWrap: 'wrap' }}>
        {segments.map(s => (
          <span key={s.label} style={{ color: s.color }}>
            {s.label}: {s.count} ({total > 0 ? Math.round((s.count / total) * 100) : 0}%)
          </span>
        ))}
      </div>
      <div style={{ marginTop: '0.35rem', fontSize: '0.72rem', color: 'var(--teal)' }}>
        Participation rate: {voting.participation ? `${(voting.participation * 100).toFixed(1)}%` : 'N/A'}
      </div>
    </div>
  );
}

function DonorTypeBar({ breakdown }) {
  const total = Object.values(breakdown).reduce((s, v) => s + v, 0);
  if (total === 0) return null;

  const types = Object.entries(breakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([type, amount]) => ({
      type, amount,
      pct: Math.round((amount / total) * 1000) / 10,
      color: TYPE_COLOR[type] || '#888',
      label: TYPE_LABEL[type] || type,
    }));

  return (
    <div>
      {/* Stacked bar */}
      <div style={{ display: 'flex', height: '20px', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.75rem' }}>
        {types.map(t => (
          <div key={t.type} style={{
            width: `${t.pct}%`, background: t.color, opacity: 0.7,
            minWidth: t.pct > 0 ? '2px' : 0,
            transition: 'width 0.5s',
          }} />
        ))}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {types.map(t => (
          <div key={t.type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: t.color, display: 'inline-block' }} />
              <span style={{ color: 'var(--text)' }}>{t.label}</span>
            </span>
            <span style={{ color: t.color, fontFamily: 'var(--font-mono)' }}>
              {fmtMoneyCompact(t.amount)} ({t.pct}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
