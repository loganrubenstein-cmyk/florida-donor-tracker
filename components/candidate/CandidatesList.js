'use client';

import { useState, useEffect } from 'react';
import BackLinks from '@/components/BackLinks';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import GlossaryTerm from '@/components/shared/GlossaryTerm';

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
  { value: 'total_combined_all', label: 'Combined Total' },
  { value: 'hard_money_all',     label: 'Hard Money' },
  { value: 'soft_money_all',     label: 'Soft Money' },
  { value: 'display_name',       label: 'Name A–Z' },
  { value: 'latest_cycle',       label: 'Most Recent' },
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
  const [sortBy, setSortBy]         = useState('total_combined_all');
  const [sortDir, setSortDir]       = useState('desc');
  const [page, setPage]             = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedQ, party, office, year, sortBy, sortDir]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ q: debouncedQ, party, office, year, sort: sortBy, sort_dir: sortDir, page });
    fetch(`/api/politicians?${params}`)
      .then(r => r.json())
      .then(json => { setResults(json); setLoading(false); })
      .catch(() => setLoading(false));
  }, [debouncedQ, party, office, year, sortBy, sortDir, page]);

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

      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.4rem, 3vw, 2rem)',
          fontWeight: 400, color: '#fff', marginBottom: '0.4rem',
        }}>
          Candidates
        </h1>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
          {loading ? 'Loading…' : `${total.toLocaleString()} people with Florida campaign finance data`} · Florida Division of Elections
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem', alignItems: 'center' }}>
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
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={inputStyle}>
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div style={{
        fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.08em', marginBottom: '0.6rem',
      }}>
        {loading ? 'Loading…' : `${total.toLocaleString()} result${total !== 1 ? 's' : ''}`}
      </div>

      <div style={{ overflowX: 'auto', opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {[
                { label: '#',        align: 'center', width: '2rem' },
                { label: 'Name',     align: 'left',   sortKey: 'display_name'      },
                { label: 'Office',   align: 'left'   },
                { label: 'Party',    align: 'center' },
                { label: 'Cycles',   align: 'center' },
                { label: 'Hard',     align: 'right',  sortKey: 'hard_money_all',     glossary: 'HARD'     },
                { label: 'Soft',     align: 'right',  sortKey: 'soft_money_all',     glossary: 'SOFT'     },
                { label: 'Combined', align: 'right',  sortKey: 'total_combined_all', glossary: 'COMBINED' },
              ].map(({ label, align, width, sortKey, glossary }) => {
                const isActive = sortKey && sortBy === sortKey;
                return (
                  <th key={label}
                    onClick={sortKey ? () => {
                      if (sortBy === sortKey) {
                        setSortDir(d => d === 'desc' ? 'asc' : 'desc');
                      } else {
                        setSortBy(sortKey);
                        setSortDir(sortKey === 'display_name' ? 'asc' : 'desc');
                      }
                    } : undefined}
                    style={{
                      padding: '0.4rem 0.6rem', textAlign: align, width,
                      fontSize: '0.6rem', letterSpacing: '0.08em', fontWeight: 400,
                      textTransform: 'uppercase',
                      color: isActive ? 'var(--text)' : 'var(--text-dim)',
                      cursor: sortKey ? 'pointer' : 'default',
                      userSelect: 'none', whiteSpace: 'nowrap',
                    }}
                  >
                    {glossary ? <GlossaryTerm term={glossary}>{label}</GlossaryTerm> : label}
                    {isActive && <span style={{ color: 'var(--orange)', marginLeft: '0.25rem' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                    {!isActive && sortKey && <span style={{ color: 'rgba(90,106,136,0.3)', marginLeft: '0.25rem' }}>↕</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {!loading && pageItems.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '2.5rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.72rem', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                  No candidates match the current filters
                </td>
              </tr>
            )}
            {pageItems.map((p, i) => {
              const pColor = PARTY_COLOR[p.party] || 'var(--text-dim)';
              const displayName = p.display_name
                ? p.display_name.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')
                : `#${p.latest_acct_num}`;

              // Link to canonical politician page if slug known and not ambiguous,
              // otherwise fall back to raw /candidate/[acct_num]
              const href = !p.is_ambiguous && p.slug
                ? `/politician/${p.slug}`
                : `/candidate/${p.latest_acct_num}`;

              const cycleRange = p.num_cycles > 1
                ? `${p.earliest_cycle}–${p.latest_cycle}`
                : String(p.latest_cycle || '');

              return (
                <tr key={`${p.display_name}-${p.latest_acct_num}`} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                    {(page - 1) * PAGE_SIZE + i + 1}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', wordBreak: 'break-word' }}>
                    <a href={href} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                      {displayName}
                    </a>
                    {p.num_cycles > 1 && (
                      <span style={{ marginLeft: '0.4rem', fontSize: '0.58rem', color: 'rgba(100,140,220,0.4)', fontFamily: 'var(--font-mono)' }}>
                        ×{p.num_cycles}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                    {p.latest_office || '—'}
                    {p.latest_district ? ` · ${p.latest_district}` : ''}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center' }}>
                    <span style={{
                      fontSize: '0.62rem', padding: '0.1rem 0.35rem',
                      border: `1px solid ${pColor}`, color: pColor,
                      borderRadius: '2px', fontWeight: 'bold',
                    }}>
                      {p.party || '—'}
                    </span>
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                    {cycleRange}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {fmt(p.hard_money_all)}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {p.soft_money_all > 0 ? fmt(p.soft_money_all) : '—'}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--orange)', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>
                    {fmt(p.total_combined_all)}
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

      <div style={{ marginTop: '3rem' }}>
        <DataTrustBlock
          source="Florida Division of Elections — Candidate Registration Filings"
          sourceUrl="https://dos.elections.myflorida.com/candidates/"
          lastUpdated="April 2026"
          direct={['candidate name', 'party', 'office', 'district', 'election cycle']}
          normalized={['canonical politician grouping merges multiple-cycle candidates into one row', 'soft money linked from associated political committees']}
          inferred={['combined total = hard money raised + soft money from linked PACs']}
          caveats={[
            '28 candidates with name conflicts (same name, different people) are listed individually rather than grouped.',
            'Soft money links are based on shared treasurer/chair signals — see each profile for confidence level.',
            'Federal candidates (congressional, presidential) are excluded from this directory.',
          ]}
        />
      </div>
    </main>
  );
}
