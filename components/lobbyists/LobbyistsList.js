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
  { value: 'total_donation_influence', label: 'Donation Influence' },
  { value: 'num_principals',           label: 'Principals (Most)' },
  { value: 'name',                     label: 'Name A–Z' },
];

const TYPE_OPTIONS = [
  { value: 'all',     label: 'All Lobbyists' },
  { value: 'matched', label: 'Has Donation Match' },
];

export default function LobbyistsList() {
  const [lobbyists, setLobbyists] = useState(null);
  const [search, setSearch]       = useState('');
  const [type, setType]           = useState('all');
  const [sortBy, setSortBy]       = useState('total_donation_influence');

  useEffect(() => {
    fetch('/data/lobbyists/index.json')
      .then(r => r.json())
      .then(setLobbyists)
      .catch(() => setLobbyists([]));
  }, []);

  const filtered = useMemo(() => {
    if (!lobbyists) return [];
    let list = lobbyists;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(l =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.firm || '').toLowerCase().includes(q) ||
        (l.top_principal || '').toLowerCase().includes(q)
      );
    }

    if (type === 'matched') list = list.filter(l => l.has_donation_match);

    list = [...list].sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'num_principals') return (b.num_principals || 0) - (a.num_principals || 0);
      return (b.total_donation_influence || 0) - (a.total_donation_influence || 0);
    });

    return list;
  }, [lobbyists, search, type, sortBy]);

  const totals = useMemo(() => {
    if (!lobbyists) return null;
    const withMatch = lobbyists.filter(l => l.has_donation_match).length;
    const totalInfluence = lobbyists.reduce((s, l) => s + (l.total_donation_influence || 0), 0);
    return { total: lobbyists.length, withMatch, totalInfluence };
  }, [lobbyists]);

  const inputStyle = {
    background: '#0d0d22', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '0.4rem 0.6rem',
    fontSize: '0.72rem', borderRadius: '3px',
    fontFamily: 'var(--font-mono)', outline: 'none',
  };

  if (!lobbyists) {
    return (
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '4rem 2rem', textAlign: 'center' }}>
        <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
          Loading lobbyists…
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
          Lobbyists
        </h1>
        {totals && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <span>{totals.total.toLocaleString()} registered lobbyists</span>
            <span style={{ color: 'var(--teal)' }}>{totals.withMatch.toLocaleString()} with donation match</span>
            <span style={{ color: 'var(--orange)' }}>{fmt(totals.totalInfluence)} total matched donations</span>
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
        {filtered.length.toLocaleString()} result{filtered.length !== 1 ? 's' : ''}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {[
                { label: '#',                 align: 'center', width: '2rem' },
                { label: 'Lobbyist',          align: 'left'  },
                { label: 'Firm',              align: 'left'  },
                { label: 'Location',          align: 'left'  },
                { label: 'Principals',        align: 'right', sortKey: 'num_principals'           },
                { label: 'Active',            align: 'right'                                      },
                { label: 'Donation Influence',align: 'right', sortKey: 'total_donation_influence' },
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
                <td colSpan={7} style={{
                  padding: '2.5rem 0.6rem', color: 'var(--text-dim)',
                  fontSize: '0.72rem', textAlign: 'center', fontFamily: 'var(--font-mono)',
                }}>
                  No lobbyists match the current filters
                </td>
              </tr>
            )}
            {filtered.slice(0, 500).map((l, i) => (
              <tr key={l.slug} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center' }}>
                  {i + 1}
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
                <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                  {[l.city, l.state].filter(Boolean).join(', ') || '—'}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                  {(l.num_principals || 0).toLocaleString()}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--teal)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                  {(l.num_active || 0).toLocaleString()}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: l.total_donation_influence > 0 ? 'var(--orange)' : 'var(--text-dim)', fontWeight: l.total_donation_influence > 0 ? 700 : 400, whiteSpace: 'nowrap' }}>
                  {fmt(l.total_donation_influence)}
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
