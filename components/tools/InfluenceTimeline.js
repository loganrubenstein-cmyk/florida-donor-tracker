'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { fmtMoney, fmtMoneyCompact } from '@/lib/fmt';
import { PARTY_COLOR } from '@/lib/partyUtils';
import DataTrustBlock from '@/components/shared/DataTrustBlock';

export default function InfluenceTimeline() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const timerRef = useRef(null);

  // Auto-load if ?acct= is in URL; pre-fill if ?q= is in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const acct = params.get('acct');
    const q    = params.get('q');
    if (acct) loadTimeline(acct, '');
    else if (q) handleSearch(q);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch(val) {
    setQuery(val);
    clearTimeout(timerRef.current);
    if (val.trim().length < 2) { setResults([]); setShowDropdown(false); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/timeline?q=${encodeURIComponent(val.trim())}`);
        const json = await res.json();
        setResults(json.results || []);
        setShowDropdown(true);
      } catch (e) { /* ignore */ }
    }, 300);
  }

  async function loadTimeline(acct, name) {
    setQuery(name);
    setShowDropdown(false);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/timeline?acct=${acct}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Failed'); return; }
      setData(json);
    } catch (e) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  // Suggested candidates
  const suggestions = [
    { acct: '79799', name: 'Ron DeSantis (Gov 2022)' },
    { acct: '88746', name: 'Michelle Salzman (House)' },
    { acct: '79408', name: 'Charlie Crist (Gov 2022)' },
  ];

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
      <div style={{ marginBottom: '0.75rem', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/tools" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Tools</Link>
        {' / '}
        <span>Influence Timeline</span>
      </div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.6rem', color: 'var(--orange)', margin: 0 }}>
          Influence Timeline
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.78rem', marginTop: '0.35rem' }}>
          Visualize any candidate's fundraising over time — spot pre-election surges, PAC formations, and donation spikes.
        </p>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', maxWidth: '500px', marginBottom: '1rem' }}>
        <input
          type="text" value={query} placeholder="Search a candidate…"
          onChange={e => handleSearch(e.target.value)}
          style={{
            width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.82rem', fontFamily: 'var(--font-mono)',
            background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)',
            borderRadius: '3px', boxSizing: 'border-box',
          }}
        />
        {showDropdown && results.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
            maxHeight: '250px', overflowY: 'auto', marginTop: '2px',
          }}>
            {results.map((r, i) => (
              <button key={`${r.acct_num}-${i}`} onClick={() => loadTimeline(r.acct_num, r.name)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem',
                  background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer',
                  fontSize: '0.75rem', fontFamily: 'var(--font-mono)',
                  borderBottom: i < results.length - 1 ? '1px solid rgba(100,140,220,0.08)' : 'none',
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(100,140,220,0.08)'}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                <div>{r.name}</div>
                <div style={{ fontSize: '0.62rem', color: 'var(--teal)', marginTop: '0.1rem' }}>{r.detail}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Suggestions */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {suggestions.map(s => (
          <button key={s.acct} onClick={() => loadTimeline(s.acct, s.name.split(' (')[0])}
            style={{
              padding: '0.25rem 0.6rem', fontSize: '0.68rem', fontFamily: 'var(--font-mono)',
              background: 'transparent', color: 'var(--text-dim)', border: '1px solid var(--border)',
              borderRadius: '3px', cursor: 'pointer',
            }}>
            {s.name}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>Loading timeline…</div>}
      {error && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '3px', color: 'var(--republican)', fontSize: '0.78rem' }}>
          {error}
        </div>
      )}

      {data && <TimelineView data={data} />}

      <div style={{ marginTop: '2rem' }}>
        <DataTrustBlock
          source="Florida Division of Elections — Campaign Finance Database"
          sourceUrl="https://dos.elections.myflorida.com/campaign-finance/contributions/"
          
          direct={['quarterly contribution totals', 'candidate name and office', 'election year']}
          normalized={['connected PAC linkages (Statement of Organization filings)']}
          inferred={['donation spikes (quarters exceeding 2.5x the median)', 'PAC formation dates']}
          caveats={[
            'Quarterly totals are aggregated from individual contribution records filed with FL DOE.',
            'Spike detection uses a 2.5x-median threshold — a statistical heuristic, not an official designation.',
            'Connected PACs are derived from FL DOE Statement of Organization filings and may not capture all relationships.',
          ]}
        />
      </div>
    </div>
  );
}

function TimelineView({ data }) {
  const { candidate, quarters, pacs, stats } = data;
  const maxAmount = Math.max(...quarters.map(q => q.amount), 1);
  const partyColor = PARTY_COLOR[candidate.party] || 'var(--text)';

  return (
    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
      {/* Candidate header */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
        padding: '1rem', marginBottom: '1rem', borderLeft: `3px solid ${partyColor}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem',
      }}>
        <div>
          <Link href={`/candidate/${candidate.acct_num}`} style={{ color: 'var(--text)', textDecoration: 'none', fontSize: '1.1rem', fontFamily: 'var(--font-serif)' }}>
            {candidate.name}
          </Link>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>
            {candidate.office} · {candidate.year} · {candidate.party}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: '1rem' }}>{fmtMoneyCompact(candidate.total)}</div>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>total raised</div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem',
      }}>
        {stats.peak_quarter && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.75rem', textAlign: 'center' }}>
            <div style={{ color: 'var(--orange)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>{fmtMoneyCompact(stats.peak_quarter.amount)}</div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Peak ({stats.peak_quarter.quarter})</div>
          </div>
        )}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.75rem', textAlign: 'center' }}>
          <div style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>{stats.total_quarters}</div>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Active Quarters</div>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.75rem', textAlign: 'center' }}>
          <div style={{ color: 'var(--republican)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>{stats.spike_count}</div>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Donation Spikes</div>
        </div>
      </div>

      {/* Bar chart */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
        padding: '1rem', marginBottom: '1rem', overflowX: 'auto',
      }}>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
          Quarterly Fundraising
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', minHeight: '180px', minWidth: `${quarters.length * 28}px` }}>
          {quarters.map((q, i) => {
            const height = maxAmount > 0 ? Math.max((q.amount / maxAmount) * 160, q.amount > 0 ? 2 : 0) : 0;
            const barColor = q.is_spike ? 'var(--republican)' : q.annotation ? 'var(--orange)' : 'var(--teal)';
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '1 0 24px', position: 'relative' }}>
                {/* Annotation marker */}
                {q.annotation && (
                  <div style={{
                    position: 'absolute', top: '-18px', fontSize: '0.52rem', color: 'var(--orange)',
                    whiteSpace: 'nowrap', transform: 'rotate(-30deg)', transformOrigin: 'bottom left',
                  }}>
                    {q.annotation}
                  </div>
                )}
                {/* Tooltip on hover via title */}
                <div
                  title={`${q.quarter}: ${fmtMoneyCompact(q.amount)}${q.annotation ? ` (${q.annotation})` : ''}${q.is_spike ? ' ⚡ SPIKE' : ''}`}
                  style={{
                    width: '18px', height: `${height}px`, background: barColor,
                    opacity: 0.75, borderRadius: '2px 2px 0 0', cursor: 'default',
                    transition: 'height 0.3s ease-out',
                  }}
                />
                {/* Quarter label — show every 4th */}
                {i % 4 === 0 && (
                  <div style={{ fontSize: '0.5rem', color: 'var(--text-dim)', marginTop: '4px', whiteSpace: 'nowrap', transform: 'rotate(-45deg)', transformOrigin: 'top left' }}>
                    {q.quarter}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Legend */}
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', fontSize: '0.62rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: '10px', height: '10px', background: 'var(--teal)', opacity: 0.75, borderRadius: '2px', display: 'inline-block' }} />
            <span style={{ color: 'var(--text-dim)' }}>Normal</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: '10px', height: '10px', background: 'var(--republican)', opacity: 0.75, borderRadius: '2px', display: 'inline-block' }} />
            <span style={{ color: 'var(--text-dim)' }}>Spike (&gt;2.5x median)</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: '10px', height: '10px', background: 'var(--orange)', opacity: 0.75, borderRadius: '2px', display: 'inline-block' }} />
            <span style={{ color: 'var(--text-dim)' }}>Annotated Event</span>
          </span>
        </div>
      </div>

      {/* Connected PACs */}
      {pacs.length > 0 && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
          padding: '1rem',
        }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
            Connected Political Committees
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {pacs.sort((a, b) => b.total - a.total).map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0', borderBottom: i < pacs.length - 1 ? '1px solid rgba(100,140,220,0.08)' : 'none' }}>
                <div>
                  <Link href={`/committee/${p.acct_num}`} style={{ color: 'var(--text)', textDecoration: 'none', fontSize: '0.75rem' }}>
                    {p.name || p.acct_num}
                  </Link>
                  {p.formed && <span style={{ color: 'var(--text-dim)', fontSize: '0.62rem', marginLeft: '0.5rem' }}>formed {p.formed}</span>}
                </div>
                <span style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                  {fmtMoneyCompact(p.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
