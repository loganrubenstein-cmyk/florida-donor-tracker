'use client';

import { useState, useEffect } from 'react';
import BackLinks from '@/components/BackLinks';
import DataTrustBlock from '@/components/shared/DataTrustBlock';

function slugToName(slug) {
  return (slug || '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fmt(n) {
  if (!n || n === 0) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const SORT_OPTIONS = [
  { value: 'total_amount',   label: 'Contract Amount' },
  { value: 'num_contracts',  label: 'Contract Count'  },
  { value: 'vendor_name',    label: 'Name A–Z'        },
];

const FILTER_OPTIONS = [
  { value: 'all',     label: 'All Vendors'        },
  { value: 'matched', label: 'Has Donor Match'    },
];

const PAGE_SIZE = 50;

export default function ContractsList() {
  const [results, setResults]       = useState({ data: [], total: 0, pages: 0 });
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [filter, setFilter]         = useState('all');
  const [sortBy, setSortBy]         = useState('total_amount');
  const [page, setPage]             = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedQ, filter, sortBy]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ q: debouncedQ, filter, sort: sortBy, page });
    fetch(`/api/contracts?${params}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) { setLoading(false); return; }
        setResults(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [debouncedQ, filter, sortBy, page]);

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

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.4rem, 3vw, 2rem)',
          fontWeight: 400, color: 'var(--text)', marginBottom: '0.4rem',
        }}>
          Florida State Contracts
        </h1>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span>{loading ? '…' : (total ?? 0).toLocaleString()} vendors</span>
          <span>FL Dept of Financial Services · FACTS system</span>
        </div>
        <p style={{
          marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--text-dim)',
          maxWidth: '620px', lineHeight: 1.5,
        }}>
          Companies and organizations that received Florida state contracts or purchase orders.{' '}
          Vendors marked <span style={{ color: 'var(--orange)', fontWeight: 700 }}>$</span> also
          appear in Florida campaign finance records.
        </p>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.5rem',
        marginBottom: '1.25rem', alignItems: 'center',
      }}>
        <input
          type="text"
          placeholder="Search by vendor name or agency..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, minWidth: '240px', flexGrow: 1 }}
        />
        <select value={filter} onChange={e => setFilter(e.target.value)} style={inputStyle}>
          {FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {[
                { label: '#',          align: 'center', width: '2rem'  },
                { label: 'Vendor',     align: 'left'                   },
                { label: 'Agency',     align: 'left'                   },
                { label: 'Contracts',  align: 'right', sortKey: 'num_contracts' },
                { label: 'Years',      align: 'center'                 },
                { label: 'Total',      align: 'right', sortKey: 'total_amount'  },
              ].map(({ label, align, width, sortKey }) => {
                const isActive = sortKey && sortBy === sortKey;
                return (
                  <th key={label}
                    onClick={sortKey ? () => setSortBy(sortKey) : undefined}
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
                    {isActive && <span style={{ color: 'var(--orange)', marginLeft: '0.25rem' }}>↓</span>}
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
                  fontSize: '0.82rem', textAlign: 'center',
                }}>
                  No vendors match the current filters
                </td>
              </tr>
            )}
            {pageItems.map((v, i) => (
              <tr key={v.vendor_slug} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                <td style={{
                  padding: '0.45rem 0.6rem', color: 'var(--text-dim)',
                  textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                }}>
                  {(page - 1) * PAGE_SIZE + i + 1}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', wordBreak: 'break-word', maxWidth: '220px' }}>
                  <span style={{ color: 'var(--text)' }}>{v.vendor_name}</span>
                  {v.has_donor_match && (
                    <span style={{
                      marginLeft: '0.4rem', fontSize: '0.56rem', color: 'var(--orange)',
                      border: '1px solid var(--orange)', borderRadius: '2px',
                      padding: '0.05rem 0.2rem', verticalAlign: 'middle',
                    }}>$</span>
                  )}
                  {v.donor_matches?.length > 0 && (
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>
                      {v.donor_matches.slice(0, 2).map((m, mi) => (
                        <span key={m.entity_slug}>
                          <a href={`/${m.entity_type === 'principal' ? 'principal' : 'donor'}/${m.entity_slug}`}
                            style={{ color: 'var(--orange)', textDecoration: 'none' }}>
                            {slugToName(m.entity_slug)}
                          </a>
                          {mi < Math.min(1, v.donor_matches.length - 1) && ', '}
                        </span>
                      ))}
                      {v.donor_matches.length > 2 && (
                        <span style={{ color: 'var(--text-dim)' }}> +{v.donor_matches.length - 2} more</span>
                      )}
                    </div>
                  )}
                </td>
                <td style={{
                  padding: '0.45rem 0.6rem', color: 'var(--text-dim)',
                  fontSize: '0.68rem', maxWidth: '180px', wordBreak: 'break-word',
                }}>
                  {v.top_agency || '—'}
                </td>
                <td style={{
                  padding: '0.45rem 0.6rem', textAlign: 'right',
                  color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem',
                }}>
                  {(v.num_contracts || 0).toLocaleString()}
                </td>
                <td style={{
                  padding: '0.45rem 0.6rem', textAlign: 'center',
                  color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                }}>
                  {v.year_range || '—'}
                </td>
                <td style={{
                  padding: '0.45rem 0.6rem', textAlign: 'right',
                  color: v.total_amount > 0 ? 'var(--blue)' : 'var(--text-dim)',
                  fontFamily: 'var(--font-serif)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                }}>
                  {fmt(v.total_amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', gap: '0.5rem', justifyContent: 'center',
          marginTop: '1.5rem', alignItems: 'center',
        }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              ...inputStyle, cursor: page === 1 ? 'not-allowed' : 'pointer',
              opacity: page === 1 ? 0.4 : 1, padding: '0.3rem 0.7rem',
            }}
          >←</button>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              ...inputStyle, cursor: page === totalPages ? 'not-allowed' : 'pointer',
              opacity: page === totalPages ? 0.4 : 1, padding: '0.3rem 0.7rem',
            }}
          >→</button>
        </div>
      )}

      <div style={{ marginTop: '3rem' }}>
        <DataTrustBlock
          source="Florida Accountability Contract Tracking System (FACTS)"
          sourceUrl="https://facts.fldfs.com/Search/ContractSearch.aspx"
          lastUpdated="2026"
          direct={['vendor_name', 'total_amount', 'agency', 'year_range']}
          normalized={['donor_match']}
          caveats={[
            'Donor matches are fuzzy-name matched — verify before drawing conclusions.',
            'Contract amounts reflect aggregate totals across all recorded fiscal years.',
          ]}
        />
      </div>

    </main>
  );
}
