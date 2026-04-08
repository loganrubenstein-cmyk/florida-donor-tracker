'use client';

import { useState, useMemo, useEffect } from 'react';
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

export default function DonorsList() {
  const [donors, setDonors] = useState(null);
  const [search, setSearch] = useState('');
  const [type, setType]     = useState('all');
  const [sortBy, setSortBy] = useState('total_combined');

  useEffect(() => {
    fetch('/data/donors/index.json')
      .then(r => r.json())
      .then(setDonors)
      .catch(() => setDonors([]));
  }, []);

  const filtered = useMemo(() => {
    if (!donors) return [];
    let list = donors;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(d => (d.name || '').toLowerCase().includes(q));
    }
    if (type === 'corporate')  list = list.filter(d => d.is_corporate);
    if (type === 'individual') list = list.filter(d => !d.is_corporate);
    if (type === 'lobbyist')   list = list.filter(d => d.has_lobbyist_link);

    list = [...list].sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      return (b[sortBy] || 0) - (a[sortBy] || 0);
    });

    return list;
  }, [donors, search, type, sortBy]);

  const inputStyle = {
    background: '#0d0d22', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '0.4rem 0.6rem',
    fontSize: '0.72rem', borderRadius: '3px',
    fontFamily: 'var(--font-mono)', outline: 'none',
  };

  const totals = useMemo(() => {
    if (!donors) return null;
    const corp = donors.filter(d => d.is_corporate).length;
    const withLobby = donors.filter(d => d.has_lobbyist_link).length;
    return { total: donors.length, corp, withLobby };
  }, [donors]);

  if (!donors) {
    return (
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '4rem 2rem', textAlign: 'center' }}>
        <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
          Loading donors…
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
          Donors
        </h1>
        {totals && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <span>{totals.total.toLocaleString()} unique donors</span>
            <span style={{ color: 'var(--orange)' }}>{totals.corp.toLocaleString()} corporate / org</span>
            <span style={{ color: 'var(--teal)' }}>{totals.withLobby.toLocaleString()} with lobbyist link</span>
            <span>Florida Division of Elections</span>
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
          placeholder="Search by donor name..."
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
                { label: '#',             align: 'center', width: '2rem' },
                { label: 'Donor',         align: 'left'  },
                { label: 'Type',          align: 'center'},
                { label: 'Location',      align: 'left'  },
                { label: 'Committees',    align: 'right' },
                { label: 'Soft Money',    align: 'right', sortKey: 'total_soft'     },
                { label: 'Hard Money',    align: 'right', sortKey: 'total_hard'     },
                { label: 'Combined',      align: 'right', sortKey: 'total_combined' },
              ].map(({ label, align, width, sortKey }) => (
                <th key={label} style={{
                  padding: '0.4rem 0.6rem', textAlign: align, width,
                  fontSize: '0.6rem',
                  color: sortKey && sortBy === sortKey ? 'var(--text)' : 'var(--text-dim)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                }}>
                  {label}{sortKey && sortBy === sortKey && (
                    <span style={{ color: 'var(--orange)', marginLeft: '0.25rem' }}>
                      {sortKey === 'name' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{
                  padding: '2.5rem 0.6rem', color: 'var(--text-dim)',
                  fontSize: '0.72rem', textAlign: 'center', fontFamily: 'var(--font-mono)',
                }}>
                  No donors match the current filters
                </td>
              </tr>
            )}
            {filtered.slice(0, 500).map((d, i) => {
              const typeColor = d.is_corporate ? 'var(--orange)' : 'var(--teal)';
              const typeLabel = d.is_corporate ? 'CORP' : 'IND';
              const hasFull   = d.total_combined >= 1000;
              const loc = d.top_location
                ? d.top_location.replace(/,\s*\d{5}(-\d{4})?$/, '').trim()
                : '—';
              return (
                <tr key={d.slug} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center' }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', wordBreak: 'break-word', maxWidth: '260px' }}>
                    {hasFull ? (
                      <a href={`/donor/${d.slug}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                        {d.name}
                      </a>
                    ) : (
                      <span style={{ color: 'var(--text)' }}>{d.name}</span>
                    )}
                    {d.has_lobbyist_link && (
                      <span style={{
                        marginLeft: '0.4rem', fontSize: '0.58rem', color: 'var(--blue)',
                        border: '1px solid var(--blue)', borderRadius: '2px',
                        padding: '0.05rem 0.25rem', verticalAlign: 'middle',
                      }}>LOBBY</span>
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
        Data: Florida Division of Elections · Not affiliated with the State of Florida. All data from public records.
      </div>
    </main>
  );
}
