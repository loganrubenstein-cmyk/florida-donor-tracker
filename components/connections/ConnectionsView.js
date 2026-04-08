'use client';

import { useState, useMemo, useEffect } from 'react';
import BackLinks from '@/components/BackLinks';

const FILTER_OPTIONS = [
  { value: 'all',               label: 'All Connections' },
  { value: 'shared_treasurer',  label: 'Shared Treasurer' },
  { value: 'shared_address',    label: 'Shared Address' },
  { value: 'shared_phone',      label: 'Shared Phone' },
  { value: 'shared_chair',      label: 'Shared Chair' },
  { value: 'donor_overlap',     label: 'Donor Overlap' },
  { value: 'money_between',     label: 'Money Flows' },
];

function ScoreBadge({ score }) {
  const color = score >= 70 ? 'var(--orange)'
    : score >= 45 ? 'var(--teal)'
    : 'var(--text-dim)';
  return (
    <span style={{
      display: 'inline-block', padding: '0.1rem 0.4rem',
      border: `1px solid ${color}`, color, borderRadius: '2px',
      fontSize: '0.65rem', fontFamily: 'var(--font-mono)', fontWeight: 700,
    }}>
      {score}
    </span>
  );
}

function ConnectionPips({ row }) {
  const pips = [
    { key: 'shared_treasurer', label: 'TRS', active: row.shared_treasurer },
    { key: 'shared_address',   label: 'ADR', active: row.shared_address   },
    { key: 'shared_phone',     label: 'PHN', active: row.shared_phone     },
    { key: 'shared_chair',     label: 'CHR', active: row.shared_chair     },
    { key: 'donor_overlap',    label: `${Math.round(row.donor_overlap_pct || 0)}%`, active: (row.donor_overlap_pct || 0) > 0 },
    { key: 'money_between',    label: '$→', active: (row.money_between || 0) > 0 },
  ];
  return (
    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
      {pips.map(p => (
        <span key={p.key} style={{
          fontSize: '0.55rem', padding: '0.05rem 0.25rem',
          borderRadius: '2px', fontFamily: 'var(--font-mono)',
          background: p.active ? 'rgba(77,216,240,0.12)' : 'transparent',
          color: p.active ? 'var(--teal)' : 'rgba(90,106,136,0.3)',
          border: `1px solid ${p.active ? 'rgba(77,216,240,0.3)' : 'rgba(90,106,136,0.15)'}`,
        }}>
          {p.label}
        </span>
      ))}
    </div>
  );
}

export default function ConnectionsView() {
  const [data, setData]     = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetch('/data/entity_connections.json')
      .then(r => r.json())
      .then(setData)
      .catch(() => setData({ connections: [] }));
  }, []);

  const connections = data?.connections || [];
  const meta = data ? {
    total: data.total_connections,
    shown: data.shown,
    threshold: data.threshold,
  } : null;

  const filtered = useMemo(() => {
    let list = connections;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r =>
        (r.entity_a?.name || '').toLowerCase().includes(q) ||
        (r.entity_b?.name || '').toLowerCase().includes(q)
      );
    }

    if (filter === 'shared_treasurer') list = list.filter(r => r.shared_treasurer);
    else if (filter === 'shared_address') list = list.filter(r => r.shared_address);
    else if (filter === 'shared_phone')   list = list.filter(r => r.shared_phone);
    else if (filter === 'shared_chair')   list = list.filter(r => r.shared_chair);
    else if (filter === 'donor_overlap')  list = list.filter(r => (r.donor_overlap_pct || 0) > 0);
    else if (filter === 'money_between')  list = list.filter(r => (r.money_between || 0) > 0);

    return list;
  }, [connections, search, filter]);

  const inputStyle = {
    background: '#0d0d22', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '0.4rem 0.6rem',
    fontSize: '0.72rem', borderRadius: '3px',
    fontFamily: 'var(--font-mono)', outline: 'none',
  };

  if (!data) {
    return (
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '4rem 2rem', textAlign: 'center' }}>
        <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
          Loading connections…
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
          Committee Connections
        </h1>
        {meta && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <span>{meta.total.toLocaleString()} committee pairs with connection score ≥ {meta.threshold}</span>
            <span style={{ color: 'var(--orange)' }}>Showing top {meta.shown}</span>
            <span>Connections: shared treasurer · address · phone · chair · donor overlap · money flow</span>
          </div>
        )}
      </div>

      {/* Score legend */}
      <div style={{
        display: 'flex', gap: '1rem', flexWrap: 'wrap',
        marginBottom: '1.25rem', fontSize: '0.65rem', fontFamily: 'var(--font-mono)',
        color: 'var(--text-dim)', alignItems: 'center',
      }}>
        <span>Score legend:</span>
        <span><span style={{ color: 'var(--orange)', fontWeight: 700 }}>70+</span> High</span>
        <span><span style={{ color: 'var(--teal)',   fontWeight: 700 }}>45–69</span> Medium</span>
        <span><span style={{ color: 'var(--text-dim)' }}>{'<45'}</span> Low</span>
        <span style={{ marginLeft: '0.5rem' }}>TRS=treasurer ADR=address PHN=phone CHR=chair %=donor overlap $→=money flow</span>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.5rem',
        marginBottom: '1.25rem', alignItems: 'center',
      }}>
        <input
          type="text"
          placeholder="Search by committee name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, minWidth: '240px', flexGrow: 1 }}
        />
        <select value={filter} onChange={e => setFilter(e.target.value)} style={inputStyle}>
          {FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Result count */}
      <div style={{
        fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.08em', marginBottom: '0.6rem',
      }}>
        {filtered.length.toLocaleString()} pair{filtered.length !== 1 ? 's' : ''}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {[
                { label: '#',      align: 'center', width: '2rem' },
                { label: 'Score',  align: 'center', width: '4rem' },
                { label: 'Committee A', align: 'left' },
                { label: 'Committee B', align: 'left' },
                { label: 'Signals', align: 'left'  },
              ].map(({ label, align, width }) => (
                <th key={label} style={{
                  padding: '0.4rem 0.6rem', textAlign: align, width,
                  fontSize: '0.6rem', color: 'var(--text-dim)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{
                  padding: '2.5rem 0.6rem', color: 'var(--text-dim)',
                  fontSize: '0.72rem', textAlign: 'center', fontFamily: 'var(--font-mono)',
                }}>
                  No connections match the current filters
                </td>
              </tr>
            )}
            {filtered.map((row, i) => (
              <tr key={`${row.entity_a?.acct_num}-${row.entity_b?.acct_num}`}
                style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>
                  {i + 1}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center', width: '4rem' }}>
                  <ScoreBadge score={row.connection_score} />
                </td>
                <td style={{ padding: '0.45rem 0.6rem', maxWidth: '280px', wordBreak: 'break-word' }}>
                  <a href={`/committee/${row.entity_a?.acct_num}`}
                    style={{ color: 'var(--teal)', textDecoration: 'none', display: 'block', marginBottom: '0.1rem' }}>
                    {row.entity_a?.name}
                  </a>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    {row.entity_a?.type_code} · #{row.entity_a?.acct_num}
                  </span>
                </td>
                <td style={{ padding: '0.45rem 0.6rem', maxWidth: '280px', wordBreak: 'break-word' }}>
                  <a href={`/committee/${row.entity_b?.acct_num}`}
                    style={{ color: 'var(--teal)', textDecoration: 'none', display: 'block', marginBottom: '0.1rem' }}>
                    {row.entity_b?.name}
                  </a>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    {row.entity_b?.type_code} · #{row.entity_b?.acct_num}
                  </span>
                </td>
                <td style={{ padding: '0.45rem 0.6rem' }}>
                  <ConnectionPips row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{
        fontSize: '0.62rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
        borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '2rem',
      }}>
        Data: Florida Division of Elections · Not affiliated with the State of Florida. All data from public records.
      </div>
    </main>
  );
}
