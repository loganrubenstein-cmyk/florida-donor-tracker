'use client';

import { useState, useEffect } from 'react';
import BackLinks from '@/components/BackLinks';

function fmt(n) {
  if (!n || n === 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const SORT_OPTIONS = [
  { value: 'total_combined', label: 'Total (Combined)' },
  { value: 'total_soft',     label: 'Soft Money (PACs)' },
  { value: 'total_hard',     label: 'Hard Money (Direct)' },
  { value: 'name',           label: 'Name A–Z' },
];

const TYPE_OPTIONS = [
  { value: 'all',        label: 'All Donors' },
  { value: 'corporate',  label: 'Corporate / Org' },
  { value: 'individual', label: 'Individual' },
  { value: 'lobbyist',   label: 'Has Lobbyist Link' },
];

const INDUSTRY_OPTIONS = [
  { value: 'all',                         label: 'All Industries' },
  { value: 'Legal',                       label: 'Legal' },
  { value: 'Real Estate',                 label: 'Real Estate' },
  { value: 'Healthcare',                  label: 'Healthcare' },
  { value: 'Finance & Insurance',         label: 'Finance & Insurance' },
  { value: 'Agriculture',                 label: 'Agriculture' },
  { value: 'Construction',                label: 'Construction' },
  { value: 'Education',                   label: 'Education' },
  { value: 'Technology / Engineering',    label: 'Tech / Engineering' },
  { value: 'Retail & Hospitality',        label: 'Retail & Hospitality' },
  { value: 'Business & Consulting',       label: 'Business & Consulting' },
  { value: 'Government & Public Service', label: 'Government' },
  { value: 'Political / Lobbying',        label: 'Political / Lobbying' },
  { value: 'Retired',                     label: 'Retired' },
  { value: 'Not Employed',                label: 'Not Employed' },
  { value: 'Other',                       label: 'Other' },
];

const PAGE_SIZE = 50;

export default function DonorsList() {
  const [results, setResults]       = useState({ data: [], total: 0, pages: 0 });
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [type, setType]             = useState('all');
  const [industry, setIndustry]     = useState('all');
  const [sortBy, setSortBy]         = useState('total_combined');
  const [page, setPage]             = useState(1);

  // Debounce search input by 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [debouncedQ, type, industry, sortBy]);

  // Fetch from API
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ q: debouncedQ, type, industry, sort: sortBy, page });
    fetch(`/api/donors?${params}`)
      .then(r => r.json())
      .then(json => { setResults(json); setLoading(false); })
      .catch(() => setLoading(false));
  }, [debouncedQ, type, industry, sortBy, page]);

  const inputStyle = {
    background: '#0d0d22', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '0.4rem 0.6rem',
    fontSize: '0.72rem', borderRadius: '3px',
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
          fontWeight: 400, color: '#fff', marginBottom: '0.4rem',
        }}>
          Donors
        </h1>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <span>Donors with $1K+ in contributions · Florida Division of Elections</span>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.5rem',
        marginBottom: '1.25rem', alignItems: 'center',
      }}>
        <input
          type="text"
          placeholder="Search by donor name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, minWidth: '220px', flexGrow: 1 }}
        />
        <select value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
          {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={industry} onChange={e => setIndustry(e.target.value)} style={inputStyle}>
          {INDUSTRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
                { label: '#',          align: 'center', width: '2rem' },
                { label: 'Donor',      align: 'left'   },
                { label: 'Type',       align: 'center' },
                { label: 'Location',   align: 'left'   },
                { label: 'Committees', align: 'right'  },
                { label: 'Soft Money', align: 'right', sortKey: 'total_soft'     },
                { label: 'Hard Money', align: 'right', sortKey: 'total_hard'     },
                { label: 'Combined',   align: 'right', sortKey: 'total_combined' },
              ].map(({ label, align, width, sortKey }) => (
                <th key={label} style={{
                  padding: '0.4rem 0.6rem', textAlign: align, width,
                  fontSize: '0.6rem',
                  color: sortKey && sortBy === sortKey ? 'var(--text)' : 'var(--text-dim)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                }}>
                  {label}{sortKey && sortBy === sortKey && (
                    <span style={{ color: 'var(--orange)', marginLeft: '0.25rem' }}>↓</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && pageItems.length === 0 && (
              <tr>
                <td colSpan={8} style={{
                  padding: '2.5rem 0.6rem', color: 'var(--text-dim)',
                  fontSize: '0.72rem', textAlign: 'center', fontFamily: 'var(--font-mono)',
                }}>
                  No donors match the current filters
                </td>
              </tr>
            )}
            {pageItems.map((d, i) => {
              const typeColor = d.is_corporate ? 'var(--orange)' : 'var(--teal)';
              const typeLabel = d.is_corporate ? 'CORP' : 'IND';
              const loc = d.top_location
                ? d.top_location.replace(/,\s*\d{5}(-\d{4})?$/, '').trim()
                : '—';
              return (
                <tr key={d.slug} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                    {(page - 1) * PAGE_SIZE + i + 1}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', wordBreak: 'break-word', maxWidth: '260px' }}>
                    <a href={`/donor/${d.slug}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                      {d.name}
                    </a>
                    <a
                      href={`/explorer?donor_slug=${d.slug}`}
                      style={{ marginLeft: '0.4rem', fontSize: '0.58rem', color: 'var(--text-dim)', textDecoration: 'none', verticalAlign: 'middle' }}
                      title="View contributions in explorer"
                    >
                      ↗
                    </a>
                    {d.has_lobbyist_link && (
                      <span style={{
                        marginLeft: '0.4rem', fontSize: '0.58rem', color: 'var(--blue)',
                        border: '1px solid var(--blue)', borderRadius: '2px',
                        padding: '0.05rem 0.25rem', verticalAlign: 'middle',
                      }}>LOBBY</span>
                    )}
                    {d.industry && d.industry !== 'Not Employed' && d.industry !== 'Other' && (
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.1rem' }}>
                        {d.industry}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center' }}>
                    <span style={{
                      fontSize: '0.58rem', padding: '0.05rem 0.3rem',
                      border: `1px solid ${typeColor}`, color: typeColor,
                      borderRadius: '2px', fontWeight: 'bold',
                    }}>
                      {typeLabel}
                    </span>
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.68rem' }}>
                    {loc}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                    {d.num_committees}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                    {d.total_soft > 0 ? fmt(d.total_soft) : '—'}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                    {d.total_hard > 0 ? fmt(d.total_hard) : '—'}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--orange)', whiteSpace: 'nowrap', fontWeight: 700 }}>
                    {fmt(d.total_combined)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: '0.25rem 0.65rem', fontSize: '0.65rem',
              background: 'transparent', border: '1px solid rgba(100,140,220,0.25)',
              color: page === 1 ? 'var(--text-dim)' : 'var(--text)', cursor: page === 1 ? 'default' : 'pointer',
              borderRadius: '2px', fontFamily: 'var(--font-mono)', opacity: page === 1 ? 0.4 : 1,
            }}
          >← prev</button>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            page {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              padding: '0.25rem 0.65rem', fontSize: '0.65rem',
              background: 'transparent', border: '1px solid rgba(100,140,220,0.25)',
              color: page === totalPages ? 'var(--text-dim)' : 'var(--text)', cursor: page === totalPages ? 'default' : 'pointer',
              borderRadius: '2px', fontFamily: 'var(--font-mono)', opacity: page === totalPages ? 0.4 : 1,
            }}
          >next →</button>
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
