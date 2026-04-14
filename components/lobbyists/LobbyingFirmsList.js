'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import BackLinks from '@/components/BackLinks';
import SectionHeader from '@/components/shared/SectionHeader';
import DataTrustBlock from '@/components/shared/DataTrustBlock';

const QuarterlyChart = dynamic(() => import('@/components/candidate/QuarterlyChart'), { ssr: false });

function fmtCompact(n) {
  if (!n || n === 0) return '$0';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

const SORT_OPTIONS = [
  { value: 'comp',    label: 'Most Paid' },
  { value: 'clients', label: 'Most Clients' },
  { value: 'name',    label: 'Name A–Z' },
  { value: 'years',   label: 'Most Active' },
];

const inputStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  padding: '0.4rem 0.6rem',
  fontSize: '0.82rem',
  borderRadius: '3px',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
};

export default function LobbyingFirmsList() {
  const [results, setResults] = useState({ data: [], total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [sort, setSort] = useState('comp');
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch('/api/lobbying-firms/stats')
      .then(r => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedQ, sort]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ q: debouncedQ, sort, page });
    fetch(`/api/lobbying-firms?${params}`)
      .then(r => r.json())
      .then(json => { setResults(json); setLoading(false); })
      .catch(() => setLoading(false));
  }, [debouncedQ, sort, page]);

  const { data: firms, total, pages: totalPages } = results;

  return (
    <main style={{ maxWidth: '1040px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <BackLinks links={[{ href: '/', label: 'home' }, { href: '/lobbying', label: 'lobbying' }]} />

      <SectionHeader title="Lobbying Firms" eyebrow="FL Lobbying · 2007–present" />
      <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: '-0.75rem', marginBottom: '1.25rem' }}>
        Registered Florida lobbying firms ranked by estimated compensation · 2007–2025
      </div>

      {/* Stats strip */}
      {stats && (
        <div style={{
          display: 'flex', gap: '0', marginBottom: '1.5rem',
          border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden',
          flexWrap: 'wrap',
        }}>
          {[
            { label: 'Total Industry Comp', value: fmtCompact(stats.totalComp), color: 'var(--blue)', sub: '19-year all-firms total' },
            { label: 'Firms Tracked', value: stats.totalFirms.toLocaleString(), color: 'var(--teal)', sub: 'unique registered firms' },
            { label: 'Peak Year', value: stats.peakYear, color: 'var(--orange)', sub: `${fmtCompact(stats.peakComp)} paid out` },
            { label: 'Avg Clients / Firm', value: stats.avgClients.toLocaleString(), color: 'var(--green)', sub: 'principals per firm' },
          ].map(({ label, value, color, sub }, i, arr) => (
            <div key={label} style={{
              flex: '1 1 140px', padding: '0.65rem 0.85rem',
              borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.2rem' }}>{label}</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color, fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>{value}</div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', marginTop: '0.1rem' }}>{sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Annual trend chart */}
      {stats?.annualTrend?.length > 1 && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '3px', padding: '1rem 1.25rem', marginBottom: '1.5rem',
        }}>
          <div style={{
            fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: '0.75rem',
          }}>
            Annual Lobbying Compensation — All Firms
          </div>
          <div style={{ height: '120px' }}>
            <QuarterlyChart data={stats.annualTrend} />
          </div>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
            2026 excluded — partial year. Compensation below $50K is a midpoint estimate; amounts $50K+ are exact.
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.25rem' }}>
        <input
          type="search"
          placeholder="Search by firm name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, width: '220px' }}
        />
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginLeft: 'auto' }}>
          {loading ? 'Loading…' : `${total.toLocaleString()} firms`}
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {[
                { label: '#', align: 'center', width: '2.5rem' },
                { label: 'Firm' },
                { label: 'Active', align: 'right' },
                { label: 'Clients', align: 'right' },
                { label: 'Est. Compensation', align: 'right' },
              ].map(({ label, align, width }) => (
                <th key={label} style={{
                  padding: '0.4rem 0.75rem',
                  textAlign: align || 'left',
                  fontSize: '0.6rem', color: 'var(--text-dim)',
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                  fontWeight: 600, whiteSpace: 'nowrap',
                  width: width || undefined,
                }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.78rem' }}>Loading…</td></tr>
            )}
            {!loading && firms.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.78rem' }}>No firms found.</td></tr>
            )}
            {!loading && firms.map((f, i) => {
              const rank = ((page - 1) * 50) + i + 1;
              const yearsLabel = f.first_year && f.last_year
                ? f.first_year === f.last_year
                  ? String(f.first_year)
                  : `${f.first_year}–${f.last_year}`
                : '—';

              return (
                <tr key={f.slug} style={{ borderBottom: '1px solid rgba(100,140,220,0.07)' }}>
                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                    {rank}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <Link href={`/lobbying-firm/${f.slug}`} style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 500 }}>
                      {f.firm_name}
                    </Link>
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                    {yearsLabel}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                    {(f.num_principals || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'var(--blue)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {fmtCompact(f.total_comp)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '1.5rem', justifyContent: 'center' }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ ...inputStyle, cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1 }}
          >← Prev</button>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{ ...inputStyle, cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.4 : 1 }}
          >Next →</button>
        </div>
      )}

      {/* Sibling pages */}
      <div style={{ marginTop: '2.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: '0.25rem' }}>Also in Lobbying:</span>
        {[
          { href: '/lobbyists',      label: 'Lobbyists' },
          { href: '/principals',     label: 'Principals' },
          { href: '/lobbying/bills', label: 'Most Lobbied Bills' },
          { href: '/influence',      label: 'Influence Index' },
        ].map(({ href, label }) => (
          <a key={href} href={href} style={{ fontSize: '0.72rem', color: 'var(--teal)', textDecoration: 'none', border: '1px solid rgba(77,216,240,0.2)', borderRadius: '3px', padding: '0.2rem 0.55rem' }}>
            {label}
          </a>
        ))}
      </div>

      <div style={{ marginTop: '2rem' }}>
        <DataTrustBlock
          source="Florida Lobbyist Registration Office — Quarterly Compensation Reports"
          sourceUrl="https://www.floridalobbyist.gov"
          direct={['firm name', 'client list', 'quarterly compensation reports (2007–present)']}
          normalized={['compensation totals (midpoints for amounts under $50K; exact amounts above $50K)']}
          caveats={[
            'Compensation below $50,000 is reported in ranges — we use midpoints for aggregation.',
            'Amounts of $50,000+ are exact figures reported by the principal.',
            'Both legislative and executive branch lobbying are included.',
            '2026 figures are partial-year only.',
          ]}
        />
      </div>
    </main>
  );
}
