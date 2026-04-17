'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import BackLinks from '@/components/BackLinks';
import SectionHeader from '@/components/shared/SectionHeader';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import GlossaryTerm from '@/components/shared/GlossaryTerm';
import { slugify } from '@/lib/slugify';

function fmt(n) {
  if (!n || n === 0) return '$0';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
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

const INDUSTRY_OPTIONS = [
  { value: 'all',                         label: 'All Industries' },
  { value: 'Legal',                       label: 'Legal' },
  { value: 'Real Estate',                 label: 'Real Estate' },
  { value: 'Healthcare',                  label: 'Healthcare' },
  { value: 'Finance & Insurance',         label: 'Finance & Insurance' },
  { value: 'Agriculture',                 label: 'Agriculture' },
  { value: 'Construction',                label: 'Construction' },
  { value: 'Education',                   label: 'Education' },
  { value: 'Technology / Engineering',    label: 'Tech / Engineering' },
  { value: 'Retail & Hospitality',        label: 'Retail & Hospitality' },
  { value: 'Business & Consulting',       label: 'Business & Consulting' },
  { value: 'Government & Public Service', label: 'Government' },
  { value: 'Political / Lobbying',        label: 'Political / Lobbying' },
  { value: 'Retired',                     label: 'Retired' },
  { value: 'Not Employed',                label: 'Not Employed' },
  { value: 'Other',                       label: 'Other' },
];

const PAGE_SIZE = 50;

export default function DonorsList() {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const didMount     = useRef(false);

  const [results, setResults]       = useState({ data: [], total: 0, pages: 0 });
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState(() => searchParams?.get('q') || '');
  const [debouncedQ, setDebouncedQ] = useState(() => searchParams?.get('q') || '');
  const [type, setType]             = useState(() => searchParams?.get('type') || 'all');
  const [industry, setIndustry]     = useState(() => searchParams?.get('industry') || 'all');
  const [sortBy, setSortBy]         = useState(() => searchParams?.get('sort') || 'total_combined');
  const [sortDir, setSortDir]       = useState('desc');
  const [page, setPage]             = useState(1);
  const [exporting, setExporting]   = useState(false);

  // Debounce search input by 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [debouncedQ, type, industry, sortBy, sortDir]);

  // Sync filter state to URL (skip on first mount to avoid replacing initial params)
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    const params = new URLSearchParams();
    if (debouncedQ)     params.set('q', debouncedQ);
    if (type !== 'all') params.set('type', type);
    if (industry !== 'all') params.set('industry', industry);
    if (sortBy !== 'total_combined') params.set('sort', sortBy);
    const qs = params.toString();
    router.replace(`${pathname}${qs ? '?' + qs : ''}`, { scroll: false });
  }, [debouncedQ, type, industry, sortBy]);

  // Fetch from API
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ q: debouncedQ, type, industry, sort: sortBy, sort_dir: sortDir, page });
    fetch(`/api/donors?${params}`)
      .then(r => r.json())
      .then(json => { setResults(json); setLoading(false); })
      .catch(() => setLoading(false));
  }, [debouncedQ, type, industry, sortBy, sortDir, page]);

  async function handleExportCSV() {
    setExporting(true);
    try {
      const params = new URLSearchParams({ q: debouncedQ, type, industry, sort: sortBy, sort_dir: sortDir, export: '1' });
      const res = await fetch(`/api/donors?${params}`);
      const json = await res.json();
      const rows = json.data || [];
      const headers = ['Name', 'Type', 'Location', 'Industry', 'Soft Money', 'Hard Money', 'Combined', 'Committees', 'Contributions'];
      const lines = [
        headers.join(','),
        ...rows.map(d => [
          `"${(d.name || '').replace(/"/g, '""')}"`,
          d.is_corporate ? 'Corporate/Org' : 'Individual',
          `"${(d.top_location || '').replace(/"/g, '""')}"`,
          `"${(d.industry || '').replace(/"/g, '""')}"`,
          d.total_soft || 0,
          d.total_hard || 0,
          d.total_combined || 0,
          d.num_committees || 0,
          d.num_contributions || 0,
        ].join(','))
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fl-donors-${new Date().toISOString().slice(0, 10)}.csv`;
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
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      <BackLinks links={[{ href: '/', label: 'home' }]} />

      <SectionHeader title="Donors" eyebrow="FL Donors · 1996–2026" patch="donors" />
      <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: '-0.75rem', marginBottom: '1.25rem' }}>
        Filtered view: donors with $1K+ in aggregate contributions. Full underlying index covers every reported contributor. Source: Florida Division of Elections.
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
        <select value={industry} onChange={e => setIndustry(e.target.value)} style={inputStyle}>
          {INDUSTRY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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

      {/* Result count */}
      <div style={{
        fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.08em', marginBottom: '0.6rem',
      }}>
        {loading ? 'Loading…' : `${total.toLocaleString()} result${total !== 1 ? 's' : ''}`}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
        <table className="dir-table" style={{ width: '100%', minWidth: '640px', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {[
                { label: '#',          align: 'center', width: '2rem' },
                { label: 'Donor',      align: 'left'   },
                { label: 'Type',       align: 'center' },
                { label: 'Location',   align: 'left'   },
                { label: 'Committees', align: 'right'  },
                { label: 'Soft Money', align: 'right', sortKey: 'total_soft',     glossary: 'SOFT'     },
                { label: 'Hard Money', align: 'right', sortKey: 'total_hard',     glossary: 'HARD'     },
                { label: 'Combined',   align: 'right', sortKey: 'total_combined', glossary: 'COMBINED' },
              ].map(({ label, align, width, sortKey, glossary }) => {
                const isActive = sortKey && sortBy === sortKey;
                return (
                  <th key={label}
                    onClick={sortKey ? () => {
                      if (sortBy === sortKey) {
                        setSortDir(d => d === 'desc' ? 'asc' : 'desc');
                      } else {
                        setSortBy(sortKey);
                        setSortDir('desc');
                      }
                    } : undefined}
                    style={{
                      padding: '0.4rem 0.6rem', textAlign: align, width,
                      fontSize: '0.6rem', fontWeight: 400,
                      textTransform: 'uppercase', letterSpacing: '0.08em',
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
                <td colSpan={8} style={{
                  padding: '2.5rem 0.6rem', color: 'var(--text-dim)',
                  fontSize: '0.82rem', textAlign: 'center', fontFamily: 'var(--font-mono)',
                }}>
                  No donors match the current filters
                </td>
              </tr>
            )}
            {pageItems.map((d, i) => {
              const typeColor = d.is_corporate ? 'var(--orange)' : 'var(--teal)';
              const typeLabel = d.is_corporate ? 'CORP' : 'IND';
              const loc = d.top_location
                ? d.top_location.replace(/,\s*\d{5}(-\d{4})?$/, '').trim()
                : '—';
              return (
                <tr key={d.slug} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                    {(page - 1) * PAGE_SIZE + i + 1}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', wordBreak: 'break-word', maxWidth: '260px' }}>
                    <a href={`/donor/${d.slug}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                      {d.name}
                    </a>
                    {d.name !== 'STATE OF FLORIDA' && (
                      <>
                        <a
                          href={`/explorer?donor_slug=${d.slug}`}
                          style={{ marginLeft: '0.4rem', fontSize: '0.58rem', color: 'var(--text-dim)', textDecoration: 'none', verticalAlign: 'middle' }}
                          title="View contributions in explorer"
                        >
                          ↗
                        </a>
                        <a
                          href={`/follow?donor=${d.slug}`}
                          style={{ marginLeft: '0.4rem', fontSize: '0.58rem', color: 'var(--teal)', textDecoration: 'none', verticalAlign: 'middle', opacity: 0.75 }}
                          title="Follow this donor's money"
                        >
                          follow
                        </a>
                      </>
                    )}
                    {d.has_lobbyist_link && (
                      <span style={{
                        marginLeft: '0.4rem', fontSize: '0.58rem', color: 'var(--blue)',
                        border: '1px solid var(--blue)', borderRadius: '2px',
                        padding: '0.05rem 0.25rem', verticalAlign: 'middle',
                      }}>LOBBY</span>
                    )}
                    {d.name === 'STATE OF FLORIDA' ? (
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.1rem' }}>
                        Public campaign matching funds — not a private donor
                      </div>
                    ) : d.industry && d.industry !== 'Not Employed' && d.industry !== 'Other' && (
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.1rem' }}>
                        <Link href={`/industry/${slugify(d.industry)}`} style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>{d.industry}</Link>
                      </div>
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
                  <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
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
          { href: '/candidates',  label: 'Candidates',         color: 'var(--blue)',   border: 'rgba(160,192,255,0.25)' },
          { href: '/committees',  label: 'Committees',         color: 'var(--teal)',   border: 'rgba(77,216,240,0.25)'  },
          { href: '/explorer',    label: 'All Transactions',   color: 'var(--text-dim)', border: 'var(--border)'        },
          { href: '/industries',    label: 'Industries',        color: 'var(--orange)', border: 'rgba(255,176,96,0.25)'  },
          { href: '/influence',    label: 'Influence Index',   color: 'var(--orange)', border: 'rgba(255,176,96,0.25)'  },
          { href: '/network/graph', label: 'Network Graph',   color: 'var(--teal)',   border: 'rgba(77,216,240,0.25)'  },
          { href: '/flow',          label: 'Money Flow',      color: 'var(--teal)',   border: 'rgba(77,216,240,0.25)'  },
        ].map(({ href, label, color, border }) => (
          <a key={href} href={href} style={{ fontSize: '0.72rem', color, textDecoration: 'none', border: `1px solid ${border}`, borderRadius: '3px', padding: '0.2rem 0.55rem' }}>
            {label}
          </a>
        ))}
      </div>

      <div style={{ marginTop: '2rem' }}>
        <DataTrustBlock
          source="Florida Division of Elections — Campaign Finance Filings"
          sourceUrl="https://dos.elections.myflorida.com/campaign-finance/"
          
          direct={['donor name', 'contribution amounts', 'employer / occupation']}
          normalized={['donors deduplicated by normalized name across committees', 'corporate flag derived from entity-type keywords']}
          inferred={['total combined = hard money + soft money from linked committees']}
          caveats={[
            'Donors are matched by normalized name — different spellings of the same person may appear as separate entries.',
            'Corporate / individual classification is automated and may be incorrect for some entities.',
          ]}
        />
      </div>
    </main>
  );
}
