'use client';

import { useState, useMemo, useEffect } from 'react';
import BackLinks from '@/components/BackLinks';

const PARTY_COLOR = { REP: 'var(--republican)', DEM: 'var(--democrat)' };
const PARTY_LABEL = {
  REP: 'Republican', DEM: 'Democrat',
  NPA: 'No Party', IND: 'Independent',
  LPF: 'Libertarian', GRE: 'Green',
  NOP: 'No Party', WRI: 'Write-in',
  CPF: 'CPF', ASP: 'ASP',
};

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

function partyGroup(code) {
  if (code === 'REP') return 'REP';
  if (code === 'DEM') return 'DEM';
  if (code === 'NPA' || code === 'IND' || code === 'NOP') return 'NPA/IND';
  return 'Other';
}

function officeGroup(office) {
  return MAJOR_OFFICES.includes(office) ? office : 'Other';
}

const SORT_OPTIONS = [
  { value: 'total_combined', label: 'Combined Total' },
  { value: 'hard_money_total', label: 'Hard Money' },
  { value: 'soft_money_total', label: 'Soft Money' },
  { value: 'candidate_name', label: 'Name A–Z' },
];

export default function CandidatesList() {
  const [candidates, setCandidates] = useState(null);
  const [search, setSearch]       = useState('');
  const [party, setParty]         = useState('all');
  const [office, setOffice]       = useState('all');
  const [year, setYear]           = useState('all');
  const [sortBy, setSortBy]       = useState('total_combined');

  useEffect(() => {
    fetch('/data/candidate_stats.json')
      .then(r => r.json())
      .then(setCandidates)
      .catch(() => setCandidates([]));
  }, []);

  // Derive filter option lists
  const years   = useMemo(() => {
    if (!candidates) return [];
    const s = [...new Set(candidates.map(c => c.election_year).filter(Boolean))].sort().reverse();
    return s;
  }, [candidates]);

  const offices = useMemo(() => {
    if (!candidates) return [];
    const groups = [...new Set(candidates.map(c => officeGroup(c.office_desc)))];
    return MAJOR_OFFICES.filter(o => groups.includes(o)).concat(groups.includes('Other') ? ['Other'] : []);
  }, [candidates]);

  const filtered = useMemo(() => {
    if (!candidates) return [];
    let list = candidates;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(c => (c.candidate_name || '').toLowerCase().includes(q));
    }
    if (party !== 'all') {
      list = list.filter(c => partyGroup(c.party_code) === party);
    }
    if (office !== 'all') {
      list = list.filter(c => officeGroup(c.office_desc) === office);
    }
    if (year !== 'all') {
      list = list.filter(c => c.election_year === year);
    }

    list = [...list].sort((a, b) => {
      if (sortBy === 'candidate_name') {
        return (a.candidate_name || '').localeCompare(b.candidate_name || '');
      }
      return (b[sortBy] || 0) - (a[sortBy] || 0);
    });

    return list;
  }, [candidates, search, party, office, year, sortBy]);

  const inputStyle = {
    background: '#0d0d22', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '0.4rem 0.6rem',
    fontSize: '0.72rem', borderRadius: '3px',
    fontFamily: 'var(--font-mono)', outline: 'none',
  };

  if (!candidates) {
    return (
      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '4rem 2rem', textAlign: 'center' }}>
        <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
          Loading candidates…
        </div>
      </main>
    );
  }

  return (
    <main className="m-padx" style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      {/* Back */}
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
          {(candidates?.length || 0).toLocaleString()} candidates with campaign finance data · Florida Division of Elections
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
          <option value="NPA/IND">NPA / Independent</option>
          <option value="Other">Other</option>
        </select>
        <select value={office} onChange={e => setOffice(e.target.value)} style={inputStyle}>
          <option value="all">All Offices</option>
          {offices.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={year} onChange={e => setYear(e.target.value)} style={inputStyle}>
          <option value="all">All Years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
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
                { label: '#',           align: 'center', width: '2rem' },
                { label: 'Candidate',   align: 'left',   sortKey: 'candidate_name'   },
                { label: 'Office',      align: 'left'   },
                { label: 'Party',       align: 'center' },
                { label: 'Year',        align: 'center' },
                { label: 'Hard Money',  align: 'right',  sortKey: 'hard_money_total'  },
                { label: 'Soft Money',  align: 'right',  sortKey: 'soft_money_total'  },
                { label: 'Combined',    align: 'right',  sortKey: 'total_combined'    },
                { label: 'PCs',         align: 'center' },
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{
                  padding: '2.5rem 0.6rem', color: 'var(--text-dim)',
                  fontSize: '0.72rem', textAlign: 'center', fontFamily: 'var(--font-mono)',
                }}>
                  No candidates match the current filters
                </td>
              </tr>
            )}
            {filtered.slice(0, 500).map((c, i) => {
              const pColor = PARTY_COLOR[c.party_code] || 'var(--text-dim)';
              return (
                <tr key={c.acct_num} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', wordBreak: 'break-word' }}>
                    <a href={`/candidate/${c.acct_num}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                      {c.candidate_name || `#${c.acct_num}`}
                    </a>
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                    {officeGroup(c.office_desc) === 'Other'
                      ? c.office_desc || '—'
                      : c.office_desc || '—'}
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

      {filtered.length > 500 && (
        <div style={{
          fontSize: '0.68rem', color: 'var(--text-dim)', textAlign: 'center',
          padding: '1rem', fontFamily: 'var(--font-mono)',
        }}>
          Showing top 500 of {filtered.length.toLocaleString()} — use filters to narrow results
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
