'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import BackLinks from '@/components/BackLinks';

const TYPE_COLOR = {
  donor:     'var(--orange)',
  committee: 'var(--teal)',
  candidate: 'var(--blue)',
  lobbyist:  '#c084fc',
  principal: 'var(--green)',
};

const TYPE_LABEL = {
  donor:     'Donor',
  committee: 'Committee',
  candidate: 'Candidate',
  lobbyist:  'Lobbyist',
  principal: 'Principal',
};

const TYPE_OPTIONS = [
  { value: 'all',       label: 'All Types' },
  { value: 'donor',     label: 'Donors' },
  { value: 'committee', label: 'Committees' },
  { value: 'candidate', label: 'Candidates' },
  { value: 'lobbyist',  label: 'Lobbyists' },
  { value: 'principal', label: 'Principals' },
];

export default function SearchView() {
  const searchParams = useSearchParams();
  const initQ = searchParams?.get('q') || '';

  const [metaIndex,    setMetaIndex]    = useState(null);   // fast: ~0.8MB
  const [donorIndex,   setDonorIndex]   = useState(null);   // lazy: ~7MB
  const [donorsLoaded, setDonorsLoaded] = useState(false);
  const [query,        setQuery]        = useState(initQ);
  const [typeFilter,   setTypeFilter]   = useState('all');
  const inputRef = useRef(null);

  // Load meta index first (fast)
  useEffect(() => {
    fetch('/data/search_index_meta.json')
      .then(r => r.json())
      .then(data => { setMetaIndex(data); })
      .catch(() => setMetaIndex([]));
  }, []);

  // Load donor index in background after meta is ready
  useEffect(() => {
    if (!metaIndex) return;
    fetch('/data/search_index_donors.json')
      .then(r => r.json())
      .then(data => { setDonorIndex(data); setDonorsLoaded(true); })
      .catch(() => { setDonorIndex([]); setDonorsLoaded(true); });
  }, [metaIndex]);

  // Focus when meta is ready
  useEffect(() => {
    if (metaIndex && inputRef.current) inputRef.current.focus();
  }, [metaIndex]);

  const index = useMemo(() => {
    if (!metaIndex) return null;
    return donorIndex ? [...metaIndex, ...donorIndex] : metaIndex;
  }, [metaIndex, donorIndex]);

  const results = useMemo(() => {
    if (!index || !query.trim()) return [];
    const q = query.trim().toUpperCase();
    const filtered = index.filter(e => {
      if (typeFilter !== 'all' && e.t !== typeFilter) return false;
      return e.n.toUpperCase().includes(q);
    });
    // Sort: exact prefix matches first, then contains
    filtered.sort((a, b) => {
      const aStarts = a.n.toUpperCase().startsWith(q) ? 0 : 1;
      const bStarts = b.n.toUpperCase().startsWith(q) ? 0 : 1;
      return aStarts - bStarts;
    });
    return filtered.slice(0, 200);
  }, [index, query, typeFilter]);

  const inputStyle = {
    background: '#0d0d22', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '0.4rem 0.6rem',
    fontSize: '0.72rem', borderRadius: '3px',
    fontFamily: 'var(--font-mono)', outline: 'none',
  };

  const counts = useMemo(() => {
    if (!results.length) return null;
    const c = {};
    for (const e of results) c[e.t] = (c[e.t] || 0) + 1;
    return c;
  }, [results]);

  const totalEntities = (metaIndex?.length || 0) + (donorIndex?.length || 0);
  const loading = !metaIndex;

  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      <BackLinks links={[{ href: '/', label: 'home' }]} />

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.4rem, 3vw, 2rem)',
          fontWeight: 400, color: '#fff', marginBottom: '0.4rem',
        }}>
          Search
        </h1>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {loading
            ? 'Loading index…'
            : <><span>{totalEntities.toLocaleString()} entities — donors, committees, candidates, lobbyists, principals</span>
               {!donorsLoaded && (
                 <span style={{ color: 'rgba(100,140,220,0.5)', fontSize: '0.6rem' }}>loading donors…</span>
               )}</>
          }
        </div>
      </div>

      {/* Search bar + type filter */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <input
          ref={inputRef}
          type="text"
          placeholder={loading ? 'Loading…' : 'Search by name…'}
          value={query}
          disabled={loading}
          onChange={e => setQuery(e.target.value)}
          style={{ ...inputStyle, flexGrow: 1, minWidth: '240px', fontSize: '0.85rem', padding: '0.55rem 0.75rem' }}
        />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={inputStyle}>
          {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Result meta */}
      {query.trim() && !loading && (
        <div style={{
          display: 'flex', gap: '1rem', flexWrap: 'wrap',
          fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
          letterSpacing: '0.08em', marginBottom: '0.75rem', alignItems: 'center',
        }}>
          <span>{results.length === 200 ? '200+ results' : `${results.length} results`}</span>
          {!donorsLoaded && typeFilter !== 'committee' && typeFilter !== 'candidate' && typeFilter !== 'lobbyist' && typeFilter !== 'principal' && (
            <span style={{ color: 'rgba(100,140,220,0.4)' }}>donors loading…</span>
          )}
          {counts && Object.entries(counts)
            .sort(([,a],[,b]) => b-a)
            .map(([type, count]) => (
              <span key={type} style={{ color: TYPE_COLOR[type] || 'var(--text-dim)' }}>
                {count} {TYPE_LABEL[type] || type}
              </span>
            ))}
        </div>
      )}

      {/* Empty state */}
      {!query.trim() && !loading && (
        <div style={{
          padding: '3rem 0', textAlign: 'center',
          fontSize: '0.78rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
        }}>
          Type a name to search across all entities
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: 'var(--border)', border: '1px solid var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
          {results.map((e, i) => (
            <a key={`${e.t}-${e.id}-${i}`} href={e.u} style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.65rem 1rem', background: 'var(--bg)',
              textDecoration: 'none',
              transition: 'background 0.1s',
            }}
              onMouseEnter={ev => ev.currentTarget.style.background = 'rgba(100,140,220,0.06)'}
              onMouseLeave={ev => ev.currentTarget.style.background = 'var(--bg)'}
            >
              <span style={{
                fontSize: '0.55rem', padding: '0.1rem 0.4rem',
                border: `1px solid ${TYPE_COLOR[e.t] || 'var(--border)'}`,
                color: TYPE_COLOR[e.t] || 'var(--text-dim)',
                borderRadius: '2px', fontFamily: 'var(--font-mono)',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {(TYPE_LABEL[e.t] || e.t).toUpperCase()}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', color: '#fff', lineHeight: 1.3, wordBreak: 'break-word' }}>
                  {e.n}
                </div>
                {e.s && (
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: '0.1rem' }}>
                    {e.s}
                  </div>
                )}
              </div>
              <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: 'var(--text-dim)', flexShrink: 0 }}>
                →
              </span>
            </a>
          ))}
        </div>
      )}

      {query.trim() && !loading && results.length === 0 && (
        <div style={{
          padding: '2.5rem 0', textAlign: 'center',
          fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
        }}>
          No results for "{query}"
        </div>
      )}

      <div style={{
        fontSize: '0.62rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
        borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '2rem',
      }}>
        Data: Florida Division of Elections · Not affiliated with the State of Florida. All data from public records.
      </div>
    </main>
  );
}
