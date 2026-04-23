'use client';

import { useState, useMemo, useEffect } from 'react';
import BackLinks from '@/components/BackLinks';
import DataTrustBlock from '@/components/shared/DataTrustBlock';

const PAGE_SIZE = 50;

const TYPE_OPTIONS = [
  { value: 'all',        label: 'All Types' },
  { value: 'active',     label: 'Active Only' },
  { value: 'withdrawn',  label: 'Withdrawn' },
  { value: 'website',    label: 'Has Website' },
];

const SORT_OPTIONS = [
  { value: 'id_desc',    label: 'Newest First' },
  { value: 'id_asc',     label: 'Oldest First' },
  { value: 'name',       label: 'Name A–Z' },
];

function normalizeUrl(url) {
  if (!url) return null;
  return url.startsWith('http') ? url : `https://${url}`;
}

function displayUrl(url) {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

export default function SolicitationsList() {
  const [records, setRecords] = useState(null);
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState('all');
  const [sortBy, setSortBy]   = useState('id_desc');
  const [page, setPage]       = useState(1);

  useEffect(() => {
    fetch('/data/solicitations/index.json')
      .then(r => r.json())
      .then(setRecords)
      .catch(() => setRecords([]));
  }, []);

  const filtered = useMemo(() => {
    if (!records) return [];
    let list = records;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r =>
        (r.organization || '').toLowerCase().includes(q) ||
        (r.solicitors || []).some(s => s.toLowerCase().includes(q)) ||
        (r.website || '').toLowerCase().includes(q)
      );
    }

    if (filter === 'active')    list = list.filter(r => !r.withdrawn);
    if (filter === 'withdrawn') list = list.filter(r => r.withdrawn);
    if (filter === 'website')   list = list.filter(r => r.website);

    list = [...list].sort((a, b) => {
      if (sortBy === 'name')    return (a.organization || '').localeCompare(b.organization || '');
      if (sortBy === 'id_asc')  return a.id - b.id;
      return b.id - a.id; // id_desc default
    });

    return list;
  }, [records, search, filter, sortBy]);

  useMemo(() => setPage(1), [search, filter, sortBy]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totals = useMemo(() => {
    if (!records) return null;
    return {
      total:     records.length,
      active:    records.filter(r => !r.withdrawn).length,
      withdrawn: records.filter(r => r.withdrawn).length,
      websites:  records.filter(r => r.website).length,
    };
  }, [records]);

  const inputStyle = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '0.4rem 0.6rem',
    fontSize: '0.82rem', borderRadius: '3px',
    fontFamily: 'var(--font-mono)', outline: 'none',
  };

  if (!records) {
    return (
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '4rem 2rem', textAlign: 'center' }}>
        <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
          Loading solicitations…
        </div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      <BackLinks links={[{ href: '/', label: 'home' }]} />

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{
            fontSize: '0.72rem', padding: '0.15rem 0.5rem',
            border: '1px solid var(--teal)', color: 'var(--teal)',
            borderRadius: '3px', textTransform: 'uppercase', letterSpacing: '0.06em',
            fontFamily: 'var(--font-mono)',
          }}>
            Registry
          </span>
        </div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.4rem, 3vw, 2rem)',
          fontWeight: 400, color: 'var(--text)', marginBottom: '0.4rem',
        }}>
          Public Solicitations
        </h1>
        {totals && (
          <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <span>{totals.total.toLocaleString()} registered organizations</span>
            <span style={{ color: 'var(--teal)' }}>{totals.active.toLocaleString()} active</span>
            <span style={{ color: 'var(--text-dim)' }}>{totals.withdrawn.toLocaleString()} withdrawn</span>
            <span style={{ color: 'var(--orange)' }}>{totals.websites.toLocaleString()} with websites</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search by name, solicitor, or website..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, minWidth: '240px', flexGrow: 1 }}
        />
        <select value={filter} onChange={e => setFilter(e.target.value)} style={inputStyle}>
          {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={inputStyle}>
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
          {filtered.length.toLocaleString()} results
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {[
                { label: '#',           align: 'center', width: '2rem' },
                { label: 'ID',          align: 'center', width: '3.5rem' },
                { label: 'Organization',align: 'left'  },
                { label: 'Type',        align: 'left'  },
                { label: 'Solicitor',   align: 'left'  },
                { label: 'Filed',       align: 'center'},
                { label: 'Status',      align: 'center'},
                { label: 'Website',     align: 'left'  },
              ].map(({ label, align, width }) => (
                <th key={label} style={{
                  padding: '0.35rem 0.6rem', textAlign: align, width,
                  fontSize: '0.6rem', color: 'var(--text-dim)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '2.5rem', color: 'var(--text-dim)', textAlign: 'center', fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>
                  No solicitations match the current filters
                </td>
              </tr>
            )}
            {pageItems.map((r, i) => {
              const url = normalizeUrl(r.website);
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                    {(page - 1) * PAGE_SIZE + i + 1}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                    {r.id}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', wordBreak: 'break-word', maxWidth: '260px' }}>
                    <span style={{ color: 'var(--text)', fontWeight: 500 }}>
                      {r.organization}
                    </span>
                    {r.org_type && (
                      <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', marginTop: '0.1rem', fontFamily: 'var(--font-mono)' }}>
                        {r.org_type.replace('Type: ', '')}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.72rem', maxWidth: '160px', wordBreak: 'break-word' }}>
                    {r.type || '—'}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.72rem', maxWidth: '160px', wordBreak: 'break-word' }}>
                    {(r.solicitors || []).length > 0
                      ? r.solicitors.join(', ')
                      : '—'}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                    {r.file_date || '—'}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center' }}>
                    <span style={{
                      fontSize: '0.58rem', padding: '0.05rem 0.3rem',
                      color: r.withdrawn ? 'var(--text-dim)' : 'var(--teal)',
                      border: `1px solid ${r.withdrawn ? 'rgba(90,106,136,0.3)' : 'var(--teal)'}`,
                      borderRadius: '2px', fontFamily: 'var(--font-mono)',
                    }}>
                      {r.withdrawn ? 'withdrawn' : 'active'}
                    </span>
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', maxWidth: '180px' }}>
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer"
                        style={{ color: 'var(--teal)', fontSize: '0.68rem', textDecoration: 'none', wordBreak: 'break-word' }}>
                        {displayUrl(r.website)}
                      </a>
                    ) : (
                      <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
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

      <div style={{ marginTop: '3rem' }}>
        <DataTrustBlock
          source="Florida Division of Elections — Public Solicitations Registry"
          sourceUrl="https://doesecure.dos.state.fl.us/PublicSolicitations/"
          
          direct={['organization name', 'website', 'solicitor names', 'registration / expiration dates', 'status']}
          caveats={[
            'Includes organizations registered to solicit political contributions in Florida — not a list of donors.',
            'Registration data is point-in-time; expired registrations may still appear.',
          ]}
        />
      </div>
    </main>
  );
}
