'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import BackLinks from '@/components/BackLinks';
import DataTrustBlock from '@/components/shared/DataTrustBlock';

const TYPE_COLOR = {
  donor:         'var(--orange)',
  committee:     'var(--teal)',
  candidate:     'var(--blue)',
  lobbyist:      'var(--purple)',
  principal:     'var(--green)',
  legislator:    'var(--gold)',
  lobbying_firm: 'var(--blue)',
  ld_principal:  'var(--green)',
};

const TYPE_LABEL = {
  donor:         'Donor',
  committee:     'Committee',
  candidate:     'Candidate',
  lobbyist:      'Lobbyist',
  principal:     'Principal',
  legislator:    'Legislator',
  lobbying_firm: 'Firm',
  ld_principal:  'Lobbying Client',
};

const TYPE_OPTIONS = [
  { value: 'all',       label: 'All Types' },
  { value: 'donor',     label: 'Donors' },
  { value: 'committee', label: 'Committees' },
  { value: 'candidate', label: 'Candidates' },
  { value: 'lobbyist',  label: 'Lobbyists' },
  { value: 'principal', label: 'Principals' },
  { value: 'legislator', label: 'Legislators' },
];

export default function SearchView() {
  const searchParams = useSearchParams();
  const initQ = searchParams?.get('q') || '';

  const [metaIndex,    setMetaIndex]    = useState(null);   // fast: ~0.8MB
  const [donorIndex,   setDonorIndex]   = useState(null);   // lazy: ~7MB
  const [donorsLoaded, setDonorsLoaded] = useState(false);
  const [query,        setQuery]        = useState(initQ);
  const [debouncedQ,   setDebouncedQ]   = useState(initQ);
  const [typeFilter,   setTypeFilter]   = useState('all');
  const inputRef = useRef(null);

  // Debounce query so the 64K+ entry index isn't filtered on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 180);
    return () => clearTimeout(t);
  }, [query]);

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
    fetch('/api/search/donors')
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
    if (!index || !debouncedQ.trim()) return [];
    const tokens = debouncedQ.trim().toUpperCase().split(/\s+/).filter(Boolean);
    const q      = tokens.join(' ');
    const filtered = index.filter(e => {
      if (typeFilter !== 'all' && e.t !== typeFilter) return false;
      const name = e.n.toUpperCase();
      return tokens.every(tok => name.includes(tok));
    });
    // Sort: exact prefix matches first, then any-token prefix, then contains; prominence as tiebreaker
    filtered.sort((a, b) => {
      const an = a.n.toUpperCase();
      const bn = b.n.toUpperCase();
      const aExact = an.startsWith(q) ? 0 : tokens.some(t => an.startsWith(t)) ? 1 : 2;
      const bExact = bn.startsWith(q) ? 0 : tokens.some(t => bn.startsWith(t)) ? 1 : 2;
      if (aExact !== bExact) return aExact - bExact;
      return (b.p || 0) - (a.p || 0);
    });
    return filtered.slice(0, 200);
  }, [index, debouncedQ, typeFilter]);

  const inputStyle = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '0.4rem 0.6rem',
    fontSize: '0.82rem', borderRadius: '3px',
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
          fontWeight: 400, color: 'var(--text)', marginBottom: '0.4rem',
        }}>
          Search
        </h1>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {loading
            ? 'Loading index…'
            : <><span>{totalEntities.toLocaleString()} entities — donors, committees, candidates, lobbyists, principals, legislators</span>
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
        <button
          disabled={!metaIndex}
          onClick={() => {
            const pool = metaIndex || [];
            if (!pool.length) return;
            const pick = pool[Math.floor(Math.random() * pool.length)];
            if (pick?.u) window.location.href = pick.u;
          }}
          style={{
            ...inputStyle,
            cursor: metaIndex ? 'pointer' : 'default',
            opacity: metaIndex ? 1 : 0.4,
            whiteSpace: 'nowrap',
            border: '1px solid rgba(77,216,240,0.3)',
            color: 'var(--teal)',
            padding: '0.55rem 0.9rem',
          }}
        >
          ✦ Surprise me
        </button>
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
        <div style={{ padding: '1.5rem 0 2.5rem' }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
            Notable profiles
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: 'var(--border)', border: '1px solid var(--border)', borderRadius: '3px', overflow: 'hidden', marginBottom: '1.5rem' }}>
            {[
              { href: '/politician/ron-desantis', label: 'Ron DeSantis', sub: 'Governor · 2022 · Republican', type: 'candidate', color: 'var(--blue)' },
              { href: '/donor/florida-power-light-company', label: 'Florida Power & Light', sub: 'Corporate donor', type: 'donor', color: 'var(--orange)' },
              { href: '/committee/4700', label: 'Republican Party of Florida', sub: 'Committee · party org', type: 'committee', color: 'var(--republican)' },
              { href: '/principal/florida-medical-association', label: 'Florida Medical Association', sub: 'Lobbying principal · Healthcare', type: 'principal', color: 'var(--green)' },
              { href: '/lobbyist/rubin-jeff', label: 'Jeff Rubin', sub: 'Lobbyist · top earner', type: 'lobbyist', color: 'var(--purple)' },
              { href: '/legislator/11', label: 'Daniel Perez', sub: 'FL House Speaker · District 116', type: 'legislator', color: 'var(--teal)' },
            ].map(({ href, label, sub, type, color }) => (
              <a key={href} href={href} style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.65rem 1rem', background: 'var(--bg)',
                textDecoration: 'none', transition: 'background 0.1s',
              }}
                onMouseEnter={ev => ev.currentTarget.style.background = 'rgba(100,140,220,0.06)'}
                onMouseLeave={ev => ev.currentTarget.style.background = 'var(--bg)'}
              >
                <span style={{
                  fontSize: '0.62rem', padding: '0.1rem 0.45rem',
                  border: `1px solid ${color}`, color,
                  borderRadius: '2px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {type.toUpperCase()}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text)', lineHeight: 1.3 }}>{label}</div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: '0.1rem' }}>{sub}</div>
                </div>
                <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: 'var(--text-dim)', flexShrink: 0 }}>→</span>
              </a>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {[
              { href: '/candidates', label: 'Browse Candidates', color: 'var(--blue)',   border: 'rgba(160,192,255,0.3)' },
              { href: '/committees', label: 'Browse Committees', color: 'var(--teal)',   border: 'rgba(77,216,240,0.3)'  },
              { href: '/donors',     label: 'Browse Donors',     color: 'var(--orange)', border: 'rgba(255,176,96,0.3)'  },
              { href: '/lobbyists',  label: 'Browse Lobbyists',  color: 'var(--purple)', border: 'rgba(192,132,252,0.3)' },
              { href: '/principals', label: 'Browse Principals', color: 'var(--green)',  border: 'rgba(128,255,160,0.3)' },
              { href: '/explorer',   label: 'All Transactions',  color: 'var(--text-dim)', border: 'var(--border)'       },
            ].map(({ href, label, color, border }) => (
              <a key={href} href={href} style={{
                fontSize: '0.72rem', color, textDecoration: 'none',
                border: `1px solid ${border}`, borderRadius: '3px', padding: '0.3rem 0.7rem',
              }}>
                {label}
              </a>
            ))}
          </div>
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
                fontSize: '0.62rem', padding: '0.1rem 0.45rem',
                border: `1px solid ${TYPE_COLOR[e.t] || 'var(--border)'}`,
                color: TYPE_COLOR[e.t] || 'var(--text-dim)',
                borderRadius: '2px', fontFamily: 'var(--font-mono)',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {(TYPE_LABEL[e.t] || e.t).toUpperCase()}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text)', lineHeight: 1.3, wordBreak: 'break-word' }}>
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
          fontSize: '0.82rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
        }}>
          No results for "{query}"
        </div>
      )}

      <div style={{ marginTop: '3rem' }}>
        <DataTrustBlock
          source="Florida Division of Elections · FL Legislature Lobbyist Registration"
          
          direct={['entity name', 'entity type']}
          normalized={['search index built at deploy time from Supabase tables']}
          caveats={[
            'Donor index (~7MB) loads in the background — donors may not appear immediately.',
            'Names are matched by substring across all tokens — "smith john" finds "John Smith".',
          ]}
        />
      </div>
    </main>
  );
}
