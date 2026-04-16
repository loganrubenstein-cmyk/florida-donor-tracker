'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import BackLinks from '@/components/BackLinks';
import SectionHeader from '@/components/shared/SectionHeader';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import GlossaryTerm from '@/components/shared/GlossaryTerm';
import { PARTY_COLOR } from '@/lib/partyUtils';

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
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
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
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const didMount     = useRef(false);

  const [results, setResults]       = useState({ data: [], total: 0, pages: 0 });
  const [loading, setLoading]       = useState(true);
  const [explainerOpen, setExplainerOpen] = useState(false);
  const [search, setSearch]         = useState(() => searchParams?.get('q') || '');
  const [debouncedQ, setDebouncedQ] = useState(() => searchParams?.get('q') || '');
  const [party, setParty]           = useState(() => searchParams?.get('party') || 'all');
  const [office, setOffice]         = useState(() => searchParams?.get('office') || 'all');
  const [year, setYear]             = useState(() => searchParams?.get('year') || 'all');
  const [sortBy, setSortBy]         = useState(() => searchParams?.get('sort') || 'total_combined_all');
  const [sortDir, setSortDir]       = useState('desc');
  const [page, setPage]             = useState(1);
  const [exporting, setExporting]   = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedQ, party, office, year, sortBy, sortDir]);

  // Sync filter state to URL
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    const params = new URLSearchParams();
    if (debouncedQ)        params.set('q', debouncedQ);
    if (party !== 'all')   params.set('party', party);
    if (office !== 'all')  params.set('office', office);
    if (year !== 'all')    params.set('year', year);
    if (sortBy !== 'total_combined_all') params.set('sort', sortBy);
    const qs = params.toString();
    router.replace(`${pathname}${qs ? '?' + qs : ''}`, { scroll: false });
  }, [debouncedQ, party, office, year, sortBy]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ q: debouncedQ, party, office, year, sort: sortBy, sort_dir: sortDir, page });
    fetch(`/api/politicians?${params}`)
      .then(r => r.json())
      .then(json => { setResults(json); setLoading(false); })
      .catch(() => setLoading(false));
  }, [debouncedQ, party, office, year, sortBy, sortDir, page]);

  async function handleExportCSV() {
    setExporting(true);
    try {
      const params = new URLSearchParams({ q: debouncedQ, party, office, year, sort: sortBy, sort_dir: sortDir, export: '1' });
      const res = await fetch(`/api/politicians?${params}`);
      const json = await res.json();
      const rows = json.data || [];
      const headers = ['Name', 'Party', 'Office', 'District', 'Cycles', 'Hard Money', 'Soft Money', 'Combined'];
      const lines = [
        headers.join(','),
        ...rows.map(p => [
          `"${(p.display_name || '').replace(/"/g, '""')}"`,
          p.party || '',
          `"${(p.latest_office || '').replace(/"/g, '""')}"`,
          p.latest_district || '',
          p.num_cycles || 0,
          p.hard_money_all || 0,
          p.soft_money_all || 0,
          p.total_combined_all || 0,
        ].join(','))
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fl-candidates-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const inputStyle = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '0.4rem 0.6rem',
    fontSize: '0.82rem', borderRadius: '3px',
    fontFamily: 'var(--font-mono)', outline: 'none',
  };

  const { data: pageItems, total, pages: totalPages } = results;

  return (
    <main className="m-padx" style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      <BackLinks links={[{ href: '/', label: 'home' }]} />

      <SectionHeader title="Candidates" eyebrow="FL Candidates · 1996–2026" patch="candidates" />
      <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: '-0.75rem', marginBottom: '1.25rem' }}>
        {loading ? 'Loading…' : `${total.toLocaleString()} people with Florida campaign finance data`} · Florida Division of Elections
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
        <button
          onClick={handleExportCSV}
          disabled={exporting || loading || results.total === 0}
          style={{
            ...inputStyle,
            border: '1px solid rgba(77,216,240,0.3)',
            color: exporting ? 'var(--text-dim)' : 'var(--teal)',
            cursor: exporting || loading || results.total === 0 ? 'default' : 'pointer',
            background: 'transparent', whiteSpace: 'nowrap',
          }}
        >
          {exporting ? 'Exporting…' : '↓ CSV'}
        </button>
      </div>

      {/* Hard vs Soft money explainer */}
      <div style={{
        border: '1px solid var(--border)', borderRadius: '4px', marginBottom: '1.25rem',
        background: 'var(--surface)', overflow: 'hidden',
      }}>
        <button
          onClick={() => setExplainerOpen(o => !o)}
          style={{
            width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '0.55rem 0.85rem', background: 'none', border: 'none',
            cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            What is hard money vs. soft money?
          </span>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {explainerOpen ? '▲' : '▼'}
          </span>
        </button>
        {explainerOpen && (
          <div style={{ padding: '0 0.85rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', paddingTop: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--orange)', marginBottom: '0.3rem', fontFamily: 'var(--font-mono)' }}>
                  Hard Money
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
                  Contributions made directly to a candidate's campaign committee. Subject to strict limits — individuals can give up to $3,000 per election in Florida state races. Goes directly to the candidate.
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--blue)', marginBottom: '0.3rem', fontFamily: 'var(--font-mono)' }}>
                  Soft Money
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
                  Money raised by linked political committees (PACs, ECOs, CCEs) associated with a candidate. Florida has no contribution limits for state-level PACs — a single donor can give millions. Tracked via committee connections.
                </div>
              </div>
            </div>
            <div style={{ fontSize: '0.68rem', color: 'rgba(90,106,136,0.7)', paddingTop: '0.25rem', borderTop: '1px solid var(--border)' }}>
              Combined = hard money raised + soft money from linked committees. Soft money links are inferred from shared treasurers and candidate-committee relationships — see individual profiles for confidence levels.
            </div>
          </div>
        )}
      </div>

      <div style={{
        fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.08em', marginBottom: '0.6rem',
      }}>
        {loading ? 'Loading…' : `${total.toLocaleString()} result${total !== 1 ? 's' : ''}`}
      </div>

      <div style={{ overflowX: 'auto', opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
        <table className="dir-table" style={{ width: '100%', minWidth: '650px', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
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
                <td colSpan={8} style={{ padding: '2.5rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.82rem', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
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
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                    {(page - 1) * PAGE_SIZE + i + 1}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem' }}>
                    <a href={href} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                      {displayName}
                    </a>
                    {p.num_cycles > 1 && (
                      <span style={{ marginLeft: '0.4rem', fontSize: '0.58rem', color: 'rgba(100,140,220,0.4)', fontFamily: 'var(--font-mono)' }}>
                        ×{p.num_cycles}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.82rem' }}>
                    {p.latest_office || '—'}
                    {p.latest_district ? ` · ${p.latest_district}` : ''}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                    }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: pColor, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.65rem', color: pColor, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                        {p.party === 'REP' ? 'R' : p.party === 'DEM' ? 'D' : p.party === 'NPA' ? 'I' : (p.party || '—')}
                      </span>
                    </span>
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                    {cycleRange}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text)', textAlign: 'right', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                    {fmt(p.hard_money_all)}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text)', textAlign: 'right', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                    {p.soft_money_all > 0 ? fmt(p.soft_money_all) : '—'}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--orange)', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
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

      {/* Sibling pages */}
      <div style={{ marginTop: '2.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: '0.25rem' }}>Also see:</span>
        {[
          { href: '/committees',  label: 'Committees',         color: 'var(--teal)',   border: 'rgba(77,216,240,0.25)'  },
          { href: '/donors',      label: 'Donors',             color: 'var(--orange)', border: 'rgba(255,176,96,0.25)'  },
          { href: '/explorer',    label: 'All Transactions',   color: 'var(--text-dim)', border: 'var(--border)'        },
          { href: '/cycles',        label: 'Election Cycles',  color: 'var(--green)',    border: 'rgba(128,255,160,0.25)' },
          { href: '/industries',    label: 'Industries',       color: 'var(--blue)',     border: 'rgba(160,192,255,0.25)' },
          { href: '/party-finance', label: 'Party Finance',    color: 'var(--text-dim)', border: 'var(--border)'          },
          { href: '/network/graph', label: 'Network Graph',    color: 'var(--teal)',     border: 'rgba(77,216,240,0.25)'  },
          { href: '/flow',          label: 'Money Flow',       color: 'var(--teal)',     border: 'rgba(77,216,240,0.25)'  },
        ].map(({ href, label, color, border }) => (
          <a key={href} href={href} style={{ fontSize: '0.72rem', color, textDecoration: 'none', border: `1px solid ${border}`, borderRadius: '3px', padding: '0.2rem 0.55rem' }}>
            {label}
          </a>
        ))}
      </div>

      <div style={{ marginTop: '2rem' }}>
        <DataTrustBlock
          source="Florida Division of Elections — Candidate Registration Filings"
          sourceUrl="https://dos.elections.myflorida.com/candidates/"
          
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
