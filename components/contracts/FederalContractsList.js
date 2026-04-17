'use client';

import { useState, useEffect } from 'react';
import BackLinks from '@/components/BackLinks';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import { fmtMoneyCompact } from '@/lib/fmt';

function fmt(n) {
  if (!n || n === 0) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Number(n).toFixed(0)}`;
}

function slugToName(slug) {
  return (slug || '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const SORT_OPTIONS = [
  { value: 'total_obligation', label: 'Award Amount'  },
  { value: 'recipient_name',   label: 'Name A–Z'      },
];

const FILTER_OPTIONS = [
  { value: 'all',     label: 'All Recipients'   },
  { value: 'matched', label: 'Has FL Connection' },
];

const PAGE_SIZE = 50;

export default function FederalContractsList() {
  const [results, setResults]       = useState({ data: [], total: 0, pages: 0 });
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [filter, setFilter]         = useState('all');
  const [sortBy, setSortBy]         = useState('total_obligation');
  const [page, setPage]             = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedQ, filter, sortBy]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ q: debouncedQ, filter, sort: sortBy, page });
    fetch(`/api/federal-contracts?${params}`)
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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
          <h1 style={{
            fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.4rem, 3vw, 2rem)',
            fontWeight: 400, color: 'var(--text)', margin: 0,
          }}>
            Florida Federal Contracts
          </h1>
          <span style={{
            fontSize: '0.6rem', fontFamily: 'var(--font-mono)',
            color: 'var(--green)', border: '1px solid var(--green)',
            borderRadius: '2px', padding: '0.1rem 0.3rem',
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>USASpending.gov</span>
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <span>{loading ? '…' : (total ?? 0).toLocaleString()} awards</span>
          <span style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>$219B total obligation</span>
          <span>Federal fiscal years 2020–2025</span>
        </div>
        <p style={{
          marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--text-dim)',
          maxWidth: '640px', lineHeight: 1.5,
        }}>
          Federal contracts and grants awarded to Florida-based recipients by U.S. government agencies.{' '}
          Recipients marked <span style={{ color: 'var(--green)', fontWeight: 700 }}>FL</span> also
          appear in Florida campaign finance records or state contract data.
        </p>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.5rem',
        marginBottom: '1.25rem', alignItems: 'center',
      }}>
        <input
          type="text"
          placeholder="Search by recipient name..."
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
                { label: '#',         align: 'center', width: '2rem'  },
                { label: 'Recipient', align: 'left'                   },
                { label: 'Agency',    align: 'left'                   },
                { label: 'Industry',  align: 'left'                   },
                { label: 'Period',    align: 'center'                 },
                { label: 'Amount',    align: 'right', sortKey: 'total_obligation' },
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
                    {isActive && <span style={{ color: 'var(--green)', marginLeft: '0.25rem' }}>↓</span>}
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
                  No awards match the current filters
                </td>
              </tr>
            )}
            {pageItems.map((a, i) => {
              const stateLinks  = a.cross_links?.filter(l => l.entity_type === 'state_vendor') || [];
              const donorLinks  = a.cross_links?.filter(l => l.entity_type === 'donor') || [];
              const yr1 = a.period_start ? a.period_start.slice(0, 4) : null;
              const yr2 = a.period_end   ? a.period_end.slice(0, 4)   : null;
              const period = yr1 && yr2 && yr1 !== yr2 ? `${yr1}–${yr2}` : (yr1 || '—');

              return (
                <tr key={a.award_id || i} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{
                    padding: '0.45rem 0.6rem', color: 'var(--text-dim)',
                    textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                  }}>
                    {(page - 1) * PAGE_SIZE + i + 1}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', wordBreak: 'break-word', maxWidth: '220px' }}>
                    <span style={{ color: 'var(--text)' }}>{a.recipient_name || '—'}</span>
                    {a.has_match && (
                      <span style={{
                        marginLeft: '0.4rem', fontSize: '0.56rem', color: 'var(--green)',
                        border: '1px solid var(--green)', borderRadius: '2px',
                        padding: '0.05rem 0.2rem', verticalAlign: 'middle',
                      }}>FL</span>
                    )}
                    {(stateLinks.length > 0 || donorLinks.length > 0) && (
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>
                        {stateLinks.length > 0 && (
                          <span>
                            <a href="/contracts" style={{ color: 'var(--gold)', textDecoration: 'none' }}>
                              state vendor
                            </a>
                            {donorLinks.length > 0 && ' · '}
                          </span>
                        )}
                        {donorLinks.slice(0, 1).map(l => (
                          <a key={l.entity_slug}
                            href={`/donor/${l.entity_slug}`}
                            style={{ color: 'var(--orange)', textDecoration: 'none' }}>
                            {slugToName(l.entity_slug)}
                          </a>
                        ))}
                        {donorLinks.length > 1 && (
                          <span style={{ color: 'var(--text-dim)' }}> +{donorLinks.length - 1} more</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={{
                    padding: '0.45rem 0.6rem', color: 'var(--text-dim)',
                    fontSize: '0.68rem', maxWidth: '160px', wordBreak: 'break-word',
                  }}>
                    {a.awarding_agency || '—'}
                  </td>
                  <td style={{
                    padding: '0.45rem 0.6rem', color: 'var(--text-dim)',
                    fontSize: '0.65rem', maxWidth: '140px', wordBreak: 'break-word',
                  }}>
                    {a.naics_description
                      ? a.naics_description.length > 40
                        ? a.naics_description.slice(0, 38) + '…'
                        : a.naics_description
                      : '—'}
                  </td>
                  <td style={{
                    padding: '0.45rem 0.6rem', textAlign: 'center',
                    color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                    whiteSpace: 'nowrap',
                  }}>
                    {period}
                  </td>
                  <td style={{
                    padding: '0.45rem 0.6rem', textAlign: 'right',
                    color: a.total_obligation > 0 ? 'var(--green)' : 'var(--text-dim)',
                    fontFamily: 'var(--font-mono)', fontWeight: 700, whiteSpace: 'nowrap',
                  }}>
                    {fmt(a.total_obligation)}
                  </td>
                </tr>
              );
            })}
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
          source="USASpending.gov — U.S. federal contract awards"
          sourceUrl="https://www.usaspending.gov/search/?filters[place_of_performance_scope]=domestic&filters[place_of_performance_locations][0][state]=FL"
          lastUpdated="2026"
          direct={['recipient_name', 'total_obligation', 'awarding_agency', 'period']}
          normalized={['fl_connection']}
          caveats={[
            'FL connections are matched by recipient name similarity — not a confirmed legal entity match.',
            'Covers top 10,000 FL-based federal awards by obligation amount from USASpending.gov.',
            'Dollar amounts reflect total obligated value, not necessarily disbursed.',
          ]}
        />
      </div>

    </main>
  );
}
