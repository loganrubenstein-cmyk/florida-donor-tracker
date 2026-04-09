'use client';

import { useState, useMemo, useEffect } from 'react';

const R_KW = ['REPUBLICAN', 'GOP', 'CONSERVATIVES FOR', 'AMERICANS FOR PROSPERITY'];
const D_KW = ['DEMOCRAT', 'SEIU', 'AFSCME', 'AFL-CIO', 'LABOR ', 'UNION ', 'PROGRESSIVE'];

function partyOf(name, acct) {
  const OVERRIDES = { '4700': 'R', '80335': 'R', '61265': 'D', '61018': 'D' };
  if (OVERRIDES[String(acct)]) return OVERRIDES[String(acct)];
  const u = (name || '').toUpperCase();
  if (R_KW.some(k => u.includes(k))) return 'R';
  if (D_KW.some(k => u.includes(k))) return 'D';
  return null;
}

function fmt(n) {
  if (!n) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

const PAGE_SIZE = 50;

export default function CommitteesList() {
  const [committees, setCommittees] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [sort, setSort]             = useState('total');
  const [party, setParty]           = useState('all');
  const [page, setPage]             = useState(1);

  useEffect(() => {
    fetch('/data/committees/index.json')
      .then(r => r.json())
      .then(d => { setCommittees(d); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    let list = committees;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(c => c.committee_name.toLowerCase().includes(q));
    }
    if (party !== 'all') {
      list = list.filter(c => partyOf(c.committee_name, c.acct_num) === party);
    }
    if (sort === 'total') {
      list = [...list].sort((a, b) => b.total_received - a.total_received);
    } else if (sort === 'contributions') {
      list = [...list].sort((a, b) => b.num_contributions - a.num_contributions);
    } else if (sort === 'name') {
      list = [...list].sort((a, b) => a.committee_name.localeCompare(b.committee_name));
    }
    return list;
  }, [committees, search, sort, party]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset to page 1 when filters change
  useMemo(() => setPage(1), [search, sort]);

  if (loading) {
    return (
      <div style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
        Loading committees...
      </div>
    );
  }

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search committees..."
          style={{
            flex: '1 1 220px', padding: '0.4rem 0.7rem',
            background: 'var(--surface)', border: '1px solid rgba(100,140,220,0.2)',
            color: 'var(--text)', fontSize: '0.75rem', borderRadius: '3px',
            fontFamily: 'var(--font-mono)', outline: 'none',
          }}
        />
        <select
          value={party}
          onChange={e => setParty(e.target.value)}
          style={{
            padding: '0.4rem 0.6rem', background: 'var(--surface)',
            border: '1px solid rgba(100,140,220,0.2)', color: 'var(--text)',
            fontSize: '0.72rem', borderRadius: '3px', fontFamily: 'var(--font-mono)',
          }}
        >
          <option value="all">All Parties</option>
          <option value="R">Republican</option>
          <option value="D">Democrat</option>
        </select>
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          style={{
            padding: '0.4rem 0.6rem', background: 'var(--surface)',
            border: '1px solid rgba(100,140,220,0.2)', color: 'var(--text)',
            fontSize: '0.72rem', borderRadius: '3px', fontFamily: 'var(--font-mono)',
          }}
        >
          <option value="total">Sort: Total Received</option>
          <option value="contributions">Sort: Contributions</option>
          <option value="name">Sort: Name A–Z</option>
        </select>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
          {filtered.length.toLocaleString()} committees
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['#', 'Committee', 'Contributions', 'Total Received'].map((h, j) => (
                <th key={h} style={{
                  padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                  textAlign: j === 0 ? 'center' : j >= 2 ? 'right' : 'left',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageItems.map((c, i) => (
              <tr key={c.acct_num} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '3rem', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                  {(page - 1) * PAGE_SIZE + i + 1}
                </td>
                <td style={{ padding: '0.4rem 0.6rem', wordBreak: 'break-word', maxWidth: '340px' }}>
                  <a href={`/committee/${c.acct_num}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                    {c.committee_name}
                  </a>
                  {(() => { const p = partyOf(c.committee_name, c.acct_num); return p ? (
                    <span style={{
                      marginLeft: '0.4rem', fontSize: '0.54rem', padding: '0.05rem 0.25rem',
                      border: `1px solid ${p === 'R' ? 'var(--republican)' : 'var(--democrat)'}`,
                      color: p === 'R' ? 'var(--republican)' : 'var(--democrat)',
                      borderRadius: '2px', fontWeight: 'bold', verticalAlign: 'middle',
                    }}>{p}</span>
                  ) : null; })()}
                </td>
                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                  {fmtCount(c.num_contributions)}
                </td>
                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--orange)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                  {fmt(c.total_received)}
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

      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: '1.5rem' }}>
        Data: Florida Division of Elections · Not affiliated with the State of Florida. All data from public records.
      </div>
    </div>
  );
}
