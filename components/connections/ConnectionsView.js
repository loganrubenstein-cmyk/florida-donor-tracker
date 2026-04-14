'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import BackLinks from '@/components/BackLinks';
import DataTrustBlock from '@/components/shared/DataTrustBlock';

const FILTER_OPTIONS = [
  { value: 'all',              label: 'All' },
  { value: 'shared_treasurer', label: 'Shared Treasurer' },
  { value: 'shared_chair',     label: 'Shared Chair' },
  { value: 'shared_address',   label: 'Shared Address' },
  { value: 'donor_overlap',    label: 'Donor Overlap' },
];

const SORT_OPTIONS = [
  { value: 'connection_score', label: 'Score' },
  { value: 'donor_overlap_pct', label: 'Donor Overlap %' },
];

const CAPS_KEEP = new Set(['PAC', 'LLC', 'ECO', 'NOP', 'DBA', 'INC', 'II', 'III', 'IV', 'PC', 'LP', 'LLP']);
function toTitle(s) {
  if (!s) return s;
  return s.toLowerCase().replace(/\b\w+/g, w =>
    CAPS_KEEP.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)
  );
}

function fmt(n) {
  if (!n || n === 0) return null;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function ScoreBadge({ score }) {
  const color = score >= 80 ? 'var(--orange)' : score >= 60 ? 'var(--teal)' : 'var(--text-dim)';
  return (
    <span style={{
      display: 'inline-block', padding: '0.1rem 0.45rem',
      border: `1px solid ${color}`, color,
      borderRadius: '2px', fontSize: '0.65rem',
      fontFamily: 'var(--font-mono)', fontWeight: 700,
    }}>
      {score}
    </span>
  );
}

function EvidencePill({ label, value, color = 'var(--teal)' }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '0.15rem',
      padding: '0.35rem 0.6rem',
      background: `${color}0d`,
      border: `1px solid ${color}33`,
      borderRadius: '3px', minWidth: 0,
    }}>
      <span style={{ fontSize: '0.55rem', color, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      {value && (
        <span style={{ fontSize: '0.68rem', color: 'var(--text)', lineHeight: 1.3 }}>
          {value}
        </span>
      )}
    </div>
  );
}

function ConnectionRow({ row }) {
  const pct = row.donor_overlap_pct ? parseFloat(row.donor_overlap_pct).toFixed(0) : null;

  return (
    <div style={{
      padding: '1rem 1.25rem',
      border: '1px solid rgba(100,140,220,0.12)',
      borderRadius: '4px',
      background: 'var(--surface)',
      display: 'flex', flexDirection: 'column', gap: '0.75rem',
    }}>
      {/* Header: two committee names + score */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
            <a href={`/committee/${row.entity_a_acct}`} style={{
              color: 'var(--teal)', textDecoration: 'none',
              fontSize: '0.85rem', fontWeight: 500,
            }}>
              {toTitle(row.entity_a)}
            </a>
            {row.entity_a_type && (
              <span style={{ fontSize: '0.55rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', border: '1px solid var(--border)', padding: '0.05rem 0.3rem', borderRadius: '2px' }}>
                {row.entity_a_type}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
            <a href={`/committee/${row.entity_b_acct}`} style={{
              color: 'var(--teal)', textDecoration: 'none',
              fontSize: '0.85rem', fontWeight: 500,
            }}>
              {toTitle(row.entity_b)}
            </a>
            {row.entity_b_type && (
              <span style={{ fontSize: '0.55rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', border: '1px solid var(--border)', padding: '0.05rem 0.3rem', borderRadius: '2px' }}>
                {row.entity_b_type}
              </span>
            )}
          </div>
        </div>
        <ScoreBadge score={row.connection_score} />
      </div>

      {/* Evidence pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {row.shared_treasurer && (
          <EvidencePill
            label="Shared Treasurer"
            value={row.shared_treasurer_name || 'Yes'}
            color="var(--orange)"
          />
        )}
        {row.shared_chair && (
          <EvidencePill
            label="Shared Chair"
            value={row.shared_chair_name || 'Yes'}
            color="var(--teal)"
          />
        )}
        {row.shared_address && (
          <EvidencePill
            label="Shared Address"
            value={row.shared_address_line || 'Yes'}
            color="var(--blue)"
          />
        )}
        {pct && parseInt(pct) > 0 && (
          <EvidencePill
            label="Donor Overlap"
            value={`${pct}% of donors in common`}
            color="var(--text-dim)"
          />
        )}
      </div>
    </div>
  );
}

export default function ConnectionsView() {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const committeeParam = searchParams?.get('committee') || '';

  const [results,      setResults]      = useState({ data: [], total: 0, pages: 0 });
  const [loading,      setLoading]      = useState(true);
  const [exporting,    setExporting]    = useState(false);
  const [search,       setSearch]       = useState('');
  const [debouncedQ,   setDebouncedQ]   = useState('');
  const [filter,       setFilter]       = useState(searchParams?.get('filter') || 'all');
  const [sort,         setSort]         = useState(searchParams?.get('sort') || 'connection_score');
  const [page,         setPage]         = useState(1);
  const abortRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedQ, filter, sort, committeeParam]);

  const load = useCallback(async (q, type, sortBy, pg, committee) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    try {
      const params = new URLSearchParams({ q, type, sort: sortBy, page: pg });
      if (committee) params.set('committee', committee);
      const res = await fetch(`/api/connections?${params}`, { signal: abortRef.current.signal });
      const json = await res.json();
      setResults(json);
    } catch (e) {
      if (e.name !== 'AbortError') setResults({ data: [], total: 0, pages: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(debouncedQ, filter, sort, page, committeeParam);
  }, [debouncedQ, filter, sort, page, committeeParam, load]);

  // Sync filter/sort to URL so views can be shared/bookmarked
  useEffect(() => {
    if (committeeParam) return; // ?committee= takes over the URL
    const params = new URLSearchParams();
    if (filter !== 'all')              params.set('filter', filter);
    if (sort !== 'connection_score')   params.set('sort', sort);
    if (debouncedQ)                    params.set('q', debouncedQ);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [filter, sort, debouncedQ, committeeParam]);

  async function handleExportCSV() {
    setExporting(true);
    try {
      const params = new URLSearchParams({ q: debouncedQ, type: filter, sort, page: 1, export: '1' });
      if (committeeParam) params.set('committee', committeeParam);
      const res = await fetch(`/api/connections?${params}`);
      const json = await res.json();
      const rows = json.data || [];
      const headers = ['entity_a', 'entity_a_acct', 'entity_a_type', 'entity_b', 'entity_b_acct', 'entity_b_type', 'score', 'shared_treasurer', 'shared_chair', 'shared_address', 'donor_overlap_pct'];
      const lines = [
        headers.join(','),
        ...rows.map(r => [
          `"${(r.entity_a || '').replace(/"/g, '""')}"`,
          r.entity_a_acct || '',
          r.entity_a_type || '',
          `"${(r.entity_b || '').replace(/"/g, '""')}"`,
          r.entity_b_acct || '',
          r.entity_b_type || '',
          r.connection_score ?? '',
          r.shared_treasurer ? 1 : 0,
          r.shared_chair ? 1 : 0,
          r.shared_address ? 1 : 0,
          r.donor_overlap_pct ?? '',
        ].join(','))
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fl-connections-${filter}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const inputStyle = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '0.4rem 0.6rem',
    fontSize: '0.72rem', borderRadius: '3px',
    fontFamily: 'var(--font-mono)', outline: 'none',
  };

  const btnStyle = (active, color = 'var(--teal)') => ({
    padding: '0.22rem 0.6rem', fontSize: '0.65rem',
    background: active ? `${color}18` : 'transparent',
    color: active ? color : 'var(--text-dim)',
    border: `1px solid ${active ? color : 'rgba(100,140,220,0.25)'}`,
    borderRadius: '2px', cursor: 'pointer',
    fontFamily: 'var(--font-mono)', transition: 'all 0.1s',
  });

  const { data, total, pages: totalPages } = results;

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      <BackLinks links={[{ href: '/', label: 'home' }]} />

      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ marginBottom: '0.4rem' }}>
          <span style={{
            fontSize: '0.65rem', padding: '0.15rem 0.5rem',
            border: '1px solid var(--teal)', color: 'var(--teal)',
            borderRadius: '2px', fontFamily: 'var(--font-mono)', fontWeight: 'bold',
          }}>
            CONNECTIONS
          </span>
        </div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.5rem, 4vw, 2.2rem)',
          fontWeight: 400, color: 'var(--text)', marginBottom: '0.4rem', lineHeight: 1.1,
        }}>
          Committee Connections
        </h1>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.7, maxWidth: '560px' }}>
          Political committees linked by shared treasurers, chairs, or addresses — evidence of coordinated networks.
          All signals are exact matches from FL Division of Elections filings.
        </p>
      </div>

      {/* Committee filter banner */}
      {committeeParam && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.5rem 0.85rem', marginBottom: '0.75rem',
          background: 'rgba(77,216,240,0.05)', border: '1px solid rgba(77,216,240,0.25)',
          borderRadius: '3px', fontSize: '0.68rem', fontFamily: 'var(--font-mono)',
        }}>
          <span style={{ color: 'var(--text-dim)' }}>Filtered to committee</span>
          <span style={{ color: 'var(--teal)' }}>#{committeeParam}</span>
          <a href="/connections" style={{ marginLeft: 'auto', color: 'var(--text-dim)', textDecoration: 'none' }}>
            ✕ clear
          </a>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search committee name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          disabled={!!committeeParam}
          style={{ ...inputStyle, minWidth: '200px', flexGrow: 1, opacity: committeeParam ? 0.4 : 1 }}
        />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>Filter:</span>
        {FILTER_OPTIONS.map(({ value, label }) => (
          <button key={value} onClick={() => setFilter(value)} style={btnStyle(filter === value)}>
            {label}
          </button>
        ))}
        <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginLeft: '0.5rem' }}>Sort:</span>
        {SORT_OPTIONS.map(({ value, label }) => (
          <button key={value} onClick={() => setSort(value)} style={btnStyle(sort === value, 'var(--orange)')}>
            {label}
          </button>
        ))}
        <button
          onClick={handleExportCSV}
          disabled={exporting || loading}
          style={{
            marginLeft: 'auto', padding: '0.22rem 0.65rem',
            fontSize: '0.65rem', background: 'transparent',
            color: 'var(--text-dim)', border: '1px solid rgba(100,140,220,0.25)',
            borderRadius: '2px', cursor: exporting ? 'wait' : 'pointer',
            fontFamily: 'var(--font-mono)', opacity: exporting ? 0.5 : 1,
          }}
        >
          {exporting ? 'Exporting…' : '↓ Export CSV'}
        </button>
      </div>

      <div style={{
        fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.08em', marginBottom: '1rem',
      }}>
        {loading ? 'Loading…' : `${total.toLocaleString()} connection${total !== 1 ? 's' : ''}`}
      </div>

      {/* Results */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '0.6rem',
        opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s',
      }}>
        {!loading && data.length === 0 && (
          <div style={{
            padding: '2.5rem', textAlign: 'center',
            color: 'var(--text-dim)', fontSize: '0.78rem',
            border: '1px solid var(--border)', borderRadius: '4px',
          }}>
            No connections match the current filters
          </div>
        )}
        {data.map(row => <ConnectionRow key={row.id} row={row} />)}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', alignItems: 'center' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ ...btnStyle(false), opacity: page === 1 ? 0.4 : 1, cursor: page === 1 ? 'default' : 'pointer' }}>
            ← prev
          </button>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            page {page} / {totalPages}
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ ...btnStyle(false), opacity: page === totalPages ? 0.4 : 1, cursor: page === totalPages ? 'default' : 'pointer' }}>
            next →
          </button>
        </div>
      )}

      <div style={{ marginTop: '3rem' }}>
        <DataTrustBlock
          source="Florida Division of Elections — Committee Registration Filings"
          sourceUrl="https://dos.elections.myflorida.com/committees/"
          
          direct={['treasurer name', 'chair name', 'registered address', 'phone']}
          normalized={['shared signals derived from exact-match on normalized names and addresses']}
          caveats={[
            'All connections use exact name/address matching from DOE committee filings — no fuzzy inference.',
            'Donor overlap % is based on the smaller committee\'s donor list.',
            'A shared treasurer or address does not by itself indicate illegal coordination — only proximity.',
          ]}
        />
      </div>
    </main>
  );
}
