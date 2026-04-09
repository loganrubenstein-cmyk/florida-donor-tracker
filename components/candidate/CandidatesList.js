'use client';

import { useState, useEffect } from 'react';
import BackLinks from '@/components/BackLinks';

const PARTY_COLOR = { REP: 'var(--republican)', DEM: 'var(--democrat)' };

const MAJOR_OFFICES = [
  'Governor',
  'State Senator',
  'State Representative',
  'Attorney General',
  'Chief Financial Officer',
  'Commissioner of Agriculture',
  'State Attorney',
  'Circuit Judge',
  'Public Defender',
];

function fmt(n) {
  if (!n || n === 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const SORT_OPTIONS = [
  { value: 'total_combined',   label: 'Combined Total' },
  { value: 'hard_money_total', label: 'Hard Money' },
  { value: 'soft_money_total', label: 'Soft Money' },
  { value: 'candidate_name',   label: 'Name A–Z' },
];

const YEARS = [2026, 2024, 2022, 2020, 2018, 2016, 2014, 2012, 2010, 2008, 2006];

const PAGE_SIZE = 50;

export default function CandidatesList() {
  const [results, setResults]       = useState({ data: [], total: 0, pages: 0 });
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [party, setParty]           = useState('all');
  const [office, setOffice]         = useState('all');
  const [year, setYear]             = useState('all');
  const [district, setDistrict]     = useState('');
  const [sortBy, setSortBy]         = useState('total_combined');
  const [page, setPage]             = useState(1);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [debouncedQ, party, office, year, district, sortBy]);

  // Fetch from API
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ q: debouncedQ, party, office, year, district, sort: sortBy, page });
    fetch(`/api/candidates?${params}`)
      .then(r => r.json())
      .then(json => { setResults(json); setLoading(false); })
      .catch(() => setLoading(false));
  }, [debouncedQ, party, office, year, sortBy, page]);

  const inputStyle = {
    background: '#0d0d22', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '0.4rem 0.6rem',
    fontSize: '0.72rem', borderRadius: '3px',
    fontFamily: 'var(--font-mono)', outline: 'none',
  };

  const { data: pageItems, total, pages: totalPages } = results;

  return (
    <main className="m-padx" style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      <BackLinks links={[{ href: '/', label: 'home' }]} />

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.4rem, 3vw, 2rem)',
          fontWeight: 400, color: '#fff', marginBottom: '0.4rem',
        }}>
          Candidates
        </h1>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
          {loading ? 'Loading…' : `${total.toLocaleString()} candidates with campaign finance data`} · Florida Division of Elections
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.5rem',
        marginBottom: '1.25rem', alignItems: 'center',
      }}>
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, minWidth: '180px', flexGrow: 1 }}
        />
        <select value={party} onChange={e => setParty(e.target.value)} style={inputStyle}>
          <option value="all">All Parties</option>
          <option value="REP">Republican</option>
          <option value="DEM">Democrat</option>
          <option value="NPA">NPA / No Party</option>
          <option value="IND">Independent</option>
          <option value="LPF">Libertarian</option>
        </select>
        <select value={office} onChange={e => setOffice(e.target.value)} style={inputStyle}>
          <option value="all">All Offices</option>
          {MAJOR_OFFICES.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={year} onChange={e => setYear(e.target.value)} style={inputStyle}>
          <option value="all">All Years</option>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <input
          type="text"
          placeholder="District #"
          value={district}
          onChange={e => setDistrict(e.target.value)}
          style={{ ...inputStyle, width: '80px' }}
        />
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
                { label: 'Candidate',  align: 'left',   sortKey: 'candidate_name'  },
                { label: 'Office',     align: 'left'   },
                { label: 'Party',      align: 'center' },
                { label: 'Year',       align: 'center' },
                { label: 'Hard Money', align: 'right',  sortKey: 'hard_money_total' },
                { label: 'Soft Money', align: 'right',  sortKey: 'soft_money_total' },
                { label: 'Combined',   align: 'right',  sortKey: 'total_combined'   },
                { label: 'PCs',        align: 'center' },
              ].map(({ label, align, width, sortKey }) => (
                <th key={label} style={{
                  padding: '0.4rem 0.6rem', textAlign: align, width,
                  fontSize: '0.6rem', color: sortKey && sortBy === sortKey ? 'var(--text)' : 'var(--text-dim)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                }}>
                  {label}{sortKey && sortBy === sortKey && (
                    <span style={{ color: 'var(--orange)', marginLeft: '0.25rem' }}>
                      {sortKey === 'candidate_name' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && pageItems.length === 0 && (
              <tr>
                <td colSpan={9} style={{
                  padding: '2.5rem 0.6rem', color: 'var(--text-dim)',
                  fontSize: '0.72rem', textAlign: 'center', fontFamily: 'var(--font-mono)',
                }}>
                  No candidates match the current filters
                </td>
              </tr>
            )}
            {pageItems.map((c, i) => {
              const pColor = PARTY_COLOR[c.party_code] || 'var(--text-dim)';
              return (
                <tr key={c.acct_num} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                    {(page - 1) * PAGE_SIZE + i + 1}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', wordBreak: 'break-word' }}>
                    <a href={`/candidate/${c.acct_num}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                      {c.candidate_name || `#${c.acct_num}`}
                    </a>
                    <a
                      href={`/explorer?recipient_acct=${c.acct_num}&recipient_type=candidate`}
                      style={{ marginLeft: '0.5rem', fontSize: '0.58rem', color: 'var(--text-dim)', textDecoration: 'none', verticalAlign: 'middle' }}
                      title="View contributions in explorer"
                    >
                      ↗
                    </a>
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                    {c.office_desc || '—'}
                    {c.district ? ` · ${c.district}` : ''}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center' }}>
                    <span style={{
                      fontSize: '0.62rem', padding: '0.1rem 0.35rem',
                      border: `1px solid ${pColor}`, color: pColor,
                      borderRadius: '2px', fontWeight: 'bold',
                    }}>
                      {c.party_code}
                    </span>
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                    {c.election_year || '—'}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {fmt(c.hard_money_total)}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {c.soft_money_total > 0 ? fmt(c.soft_money_total) : '—'}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--orange)', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>
                    {fmt(c.total_combined)}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                    {c.num_linked_pcs > 0 ? c.num_linked_pcs : '—'}
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

      {/* Attribution */}
      <div style={{
        fontSize: '0.62rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
        borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '2rem',
      }}>
        Data: Florida Division of Elections · Not affiliated with the State of Florida. All data from public records.
      </div>
    </main>
  );
}
