'use client';

import { useState, useEffect } from 'react';
import BackLinks from '@/components/BackLinks';
import SectionHeader from '@/components/shared/SectionHeader';
import DataTrustBlock from '@/components/shared/DataTrustBlock';

function fmt(n) {
  if (!n || n === 0) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const SORT_OPTIONS = [
  { value: 'total_comp',              label: 'Est. Compensation' },
  { value: 'num_principals',           label: 'Principals (Most)' },
  { value: 'num_active',               label: 'Active (Most)' },
  { value: 'total_donation_influence', label: 'Donation Influence' },
  { value: 'name',                     label: 'Name A–Z' },
];

const TYPE_OPTIONS = [
  { value: 'all',     label: 'All Lobbyists' },
  { value: 'active',  label: 'Currently Active' },
  { value: 'matched', label: 'Has Donation Match' },
];

const PAGE_SIZE = 50;

export default function LobbyistsList() {
  const [results, setResults]       = useState({ data: [], total: 0, pages: 0 });
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [type, setType]             = useState('all');
  const [sortBy, setSortBy]         = useState('num_active');
  const [sortDir, setSortDir]       = useState('desc');
  const [page, setPage]             = useState(1);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [debouncedQ, type, sortBy, sortDir]);

  // Fetch from API
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ q: debouncedQ, type, sort: sortBy, sort_dir: sortDir, page });
    fetch(`/api/lobbyists?${params}`)
      .then(r => r.json())
      .then(json => { setResults(json); setLoading(false); })
      .catch(() => setLoading(false));
  }, [debouncedQ, type, sortBy, page]);

  const inputStyle = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '0.4rem 0.6rem',
    fontSize: '0.82rem', borderRadius: '3px',
    fontFamily: 'var(--font-mono)', outline: 'none',
  };

  const { data: pageItems, total, pages: totalPages } = results;

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      <BackLinks links={[{ href: '/', label: 'home' }]} />

      <SectionHeader title="Lobbyists" eyebrow="FL Lobbying · 2014–present" />
      <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginTop: '-0.75rem', marginBottom: '1.25rem' }}>
        <span>{loading ? '…' : total.toLocaleString()} registered lobbyists</span>
        <span>FL Legislature · 2014–present</span>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.5rem',
        marginBottom: '1.25rem', alignItems: 'center',
      }}>
        <input
          type="text"
          placeholder="Search by name or firm..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, minWidth: '220px', flexGrow: 1 }}
        />
        <select value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
          {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={inputStyle}>
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Result count */}
      <div style={{
        fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.08em', marginBottom: '0.6rem',
      }}>
        {loading ? 'Loading…' : `${total.toLocaleString()} result${total !== 1 ? 's' : ''}`}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
        <table className="dir-table" style={{ width: '100%', minWidth: '520px', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {[
                { label: '#',              align: 'center', width: '2rem' },
                { label: 'Lobbyist',       align: 'left'  },
                { label: 'Firm',           align: 'left'  },
                { label: 'Principals',     align: 'right', sortKey: 'num_principals' },
                { label: 'Active',         align: 'right'                            },
                { label: 'Est. Comp',      align: 'right', sortKey: 'total_comp'     },
              ].map(({ label, align, width, sortKey }) => {
                const isActive = sortKey && sortBy === sortKey;
                return (
                  <th key={label}
                    onClick={sortKey ? () => {
                      if (sortBy === sortKey) {
                        setSortDir(d => d === 'desc' ? 'asc' : 'desc');
                      } else {
                        setSortBy(sortKey);
                        setSortDir('desc');
                      }
                    } : undefined}
                    style={{
                      padding: '0.4rem 0.6rem', textAlign: align, width,
                      fontSize: '0.6rem', fontWeight: 400,
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                      color: isActive ? 'var(--text)' : 'var(--text-dim)',
                      cursor: sortKey ? 'pointer' : 'default',
                      userSelect: 'none', whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                    {isActive && <span style={{ color: 'var(--orange)', marginLeft: '0.25rem' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                    {!isActive && sortKey && <span style={{ color: 'rgba(90,106,136,0.3)', marginLeft: '0.25rem' }}>↕</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {!loading && pageItems.length === 0 && (
              <tr>
                <td colSpan={6} style={{
                  padding: '2.5rem 0.6rem', color: 'var(--text-dim)',
                  fontSize: '0.82rem', textAlign: 'center', fontFamily: 'var(--font-mono)',
                }}>
                  No lobbyists match the current filters
                </td>
              </tr>
            )}
            {pageItems.map((l, i) => (
              <tr key={l.slug} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                  {(page - 1) * PAGE_SIZE + i + 1}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', wordBreak: 'break-word', maxWidth: '200px' }}>
                  <a href={`/lobbyist/${l.slug}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                    {l.name}
                  </a>
                  {l.has_donation_match && (
                    <span style={{
                      marginLeft: '0.4rem', fontSize: '0.56rem', color: 'var(--orange)',
                      border: '1px solid var(--orange)', borderRadius: '2px',
                      padding: '0.05rem 0.2rem', verticalAlign: 'middle',
                    }}>$</span>
                  )}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.68rem', maxWidth: '180px', wordBreak: 'break-word' }}>
                  {l.firm || '—'}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                  {(l.num_principals || 0).toLocaleString()}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--teal)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                  {(l.num_active || 0).toLocaleString()}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: l.total_comp > 0 ? 'var(--blue)' : 'var(--text-dim)', fontWeight: l.total_comp > 0 ? 700 : 400, whiteSpace: 'nowrap' }}>
                  {fmt(l.total_comp)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: '0.25rem 0.65rem', fontSize: '0.72rem',
              background: 'transparent', border: '1px solid rgba(100,140,220,0.25)',
              color: page === 1 ? 'var(--text-dim)' : 'var(--text)', cursor: page === 1 ? 'default' : 'pointer',
              borderRadius: '2px', fontFamily: 'var(--font-mono)', opacity: page === 1 ? 0.4 : 1,
            }}
          >← prev</button>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            page {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              padding: '0.25rem 0.65rem', fontSize: '0.72rem',
              background: 'transparent', border: '1px solid rgba(100,140,220,0.25)',
              color: page === totalPages ? 'var(--text-dim)' : 'var(--text)', cursor: page === totalPages ? 'default' : 'pointer',
              borderRadius: '2px', fontFamily: 'var(--font-mono)', opacity: page === totalPages ? 0.4 : 1,
            }}
          >next →</button>
        </div>
      )}

      {/* Sibling pages */}
      <div style={{ marginTop: '2.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: '0.25rem' }}>Also in Lobbying:</span>
        {[
          { href: '/principals',     label: 'Principals' },
          { href: '/lobbying-firms', label: 'Lobbying Firms' },
          { href: '/lobbying/bills', label: 'Most Lobbied Bills' },
          { href: '/influence',      label: 'Influence Index' },
        ].map(({ href, label }) => (
          <a key={href} href={href} style={{ fontSize: '0.72rem', color: 'var(--teal)', textDecoration: 'none', border: '1px solid rgba(77,216,240,0.2)', borderRadius: '3px', padding: '0.2rem 0.55rem' }}>
            {label}
          </a>
        ))}
      </div>

      <div style={{ marginTop: '2rem' }}>
        <DataTrustBlock
          source="Florida Lobbyist Registration Office — Registration & Compensation Reports"
          sourceUrl="https://www.floridalobbyist.gov"
          
          direct={['lobbyist name', 'firm', 'principals (clients)', 'quarterly compensation reports (2007–present)']}
          normalized={['compensation totals (midpoints below $50K; exact amounts above $50K)']}
          caveats={[
            'Compensation below $50,000 is reported in ranges — we use midpoints for aggregation.',
            'Amounts of $50,000+ are exact figures reported by the principal.',
            'Compensation is aggregated across all clients and both legislative/executive branches.',
          ]}
        />
      </div>
    </main>
  );
}
