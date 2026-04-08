'use client';

import { useState, useMemo, useEffect } from 'react';
import BackLinks from '@/components/BackLinks';

function fmt(n) {
  if (!n || n === 0) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const SORT_OPTIONS = [
  { value: 'donation_total',  label: 'Donation Activity' },
  { value: 'total_lobbyists', label: 'Lobbyists (Most)' },
  { value: 'name',            label: 'Name A–Z' },
];

const TYPE_OPTIONS = [
  { value: 'all',     label: 'All Principals' },
  { value: 'matched', label: 'Has Donation Match' },
  { value: 'active',  label: 'Active Lobbyists' },
];

export default function PrincipalsList() {
  const [principals, setPrincipals] = useState(null);
  const [search, setSearch]         = useState('');
  const [type, setType]             = useState('all');
  const [sortBy, setSortBy]         = useState('donation_total');

  useEffect(() => {
    fetch('/data/principals/index.json')
      .then(r => r.json())
      .then(setPrincipals)
      .catch(() => setPrincipals([]));
  }, []);

  const filtered = useMemo(() => {
    if (!principals) return [];
    let list = principals;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.city || '').toLowerCase().includes(q)
      );
    }

    if (type === 'matched') list = list.filter(p => p.donation_total > 0);
    if (type === 'active')  list = list.filter(p => p.num_active > 0);

    list = [...list].sort((a, b) => {
      if (sortBy === 'name')            return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'total_lobbyists') return (b.total_lobbyists || 0) - (a.total_lobbyists || 0);
      return (b.donation_total || 0) - (a.donation_total || 0);
    });

    return list;
  }, [principals, search, type, sortBy]);

  const totals = useMemo(() => {
    if (!principals) return null;
    const withMatch = principals.filter(p => p.donation_total > 0).length;
    const totalDonated = principals.reduce((s, p) => s + (p.donation_total || 0), 0);
    return { total: principals.length, withMatch, totalDonated };
  }, [principals]);

  const inputStyle = {
    background: '#0d0d22', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '0.4rem 0.6rem',
    fontSize: '0.72rem', borderRadius: '3px',
    fontFamily: 'var(--font-mono)', outline: 'none',
  };

  if (!principals) {
    return (
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '4rem 2rem', textAlign: 'center' }}>
        <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
          Loading principals…
        </div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      <BackLinks links={[{ href: '/', label: 'home' }]} />

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.4rem, 3vw, 2rem)',
          fontWeight: 400, color: '#fff', marginBottom: '0.4rem',
        }}>
          Lobbying Principals
        </h1>
        {totals && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <span>{totals.total.toLocaleString()} registered principals</span>
            <span style={{ color: 'var(--teal)' }}>{totals.withMatch.toLocaleString()} with donation match</span>
            <span style={{ color: 'var(--orange)' }}>{fmt(totals.totalDonated)} total matched donations</span>
            <span>FL Legislature · 2014–present</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.5rem',
        marginBottom: '1.25rem', alignItems: 'center',
      }}>
        <input
          type="text"
          placeholder="Search by name or city..."
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
        {filtered.length.toLocaleString()} result{filtered.length !== 1 ? 's' : ''}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {[
                { label: '#',               align: 'center', width: '2rem' },
                { label: 'Principal',       align: 'left'  },
                { label: 'Location',        align: 'left'  },
                { label: 'Lobbyists',       align: 'right', sortKey: 'total_lobbyists' },
                { label: 'Active',          align: 'right' },
                { label: 'Donation Match',  align: 'right', sortKey: 'donation_total'  },
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{
                  padding: '2.5rem 0.6rem', color: 'var(--text-dim)',
                  fontSize: '0.72rem', textAlign: 'center', fontFamily: 'var(--font-mono)',
                }}>
                  No principals match the current filters
                </td>
              </tr>
            )}
            {filtered.slice(0, 500).map((p, i) => (
              <tr key={p.slug} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center' }}>
                  {i + 1}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', wordBreak: 'break-word', maxWidth: '260px' }}>
                  <a href={`/principal/${p.slug}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                    {p.name}
                  </a>
                  {p.donation_total > 0 && (
                    <span style={{
                      marginLeft: '0.4rem', fontSize: '0.56rem', color: 'var(--orange)',
                      border: '1px solid var(--orange)', borderRadius: '2px',
                      padding: '0.05rem 0.2rem', verticalAlign: 'middle',
                    }}>$</span>
                  )}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                  {[p.city, p.state].filter(Boolean).join(', ') || '—'}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                  {(p.total_lobbyists || 0).toLocaleString()}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--teal)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                  {(p.num_active || 0).toLocaleString()}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: p.donation_total > 0 ? 'var(--orange)' : 'var(--text-dim)', fontWeight: p.donation_total > 0 ? 700 : 400, whiteSpace: 'nowrap' }}>
                  {fmt(p.donation_total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > 500 && (
        <div style={{
          fontSize: '0.68rem', color: 'var(--text-dim)', textAlign: 'center',
          padding: '1rem', fontFamily: 'var(--font-mono)',
        }}>
          Showing top 500 of {filtered.length.toLocaleString()} — use filters to narrow results
        </div>
      )}

      <div style={{
        fontSize: '0.62rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
        borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '2rem',
      }}>
        Data: Florida Legislature Lobbyist Registration · Not affiliated with the State of Florida. All data from public records.
      </div>
    </main>
  );
}
