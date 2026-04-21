'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import BackLinks from '@/components/BackLinks';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import MoneyLens from '@/components/shared/MoneyLens';
import { fmtMoneyCompact as fmtCompact } from '@/lib/fmt';
import { slugify } from '@/lib/slugify';

const SORT_OPTIONS = [
  { value: 'total',  label: 'Total Influence' },
  { value: 'lobby',  label: 'Most Lobbying' },
  { value: 'donate', label: 'Most Donations' },
  { value: 'name',   label: 'Name A–Z' },
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

const chipStyle = (active) => ({
  padding: '0.25rem 0.65rem',
  fontSize: '0.72rem',
  borderRadius: '3px',
  border: `1px solid ${active ? 'var(--orange)' : 'var(--border)'}`,
  background: active ? 'rgba(255,176,96,0.08)' : 'transparent',
  color: active ? 'var(--orange)' : 'var(--text-dim)',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  transition: 'border-color 0.12s',
  whiteSpace: 'nowrap',
});

function SplitBar({ donate, lobby }) {
  const total = donate + lobby;
  if (total === 0) return null;
  const dPct = (donate / total) * 100;
  const lPct = (lobby  / total) * 100;
  return (
    <div style={{ display: 'flex', height: '6px', borderRadius: '2px', overflow: 'hidden', width: '80px' }}>
      {dPct > 0 && (
        <div
          title={`Campaign finance: ${fmtCompact(donate)} (${Math.round(dPct)}%)`}
          style={{ width: `${dPct}%`, background: 'var(--orange)', opacity: 0.75 }}
        />
      )}
      {lPct > 0 && (
        <div
          title={`Lobbying: ${fmtCompact(lobby)} (${Math.round(lPct)}%)`}
          style={{ width: `${lPct}%`, background: 'var(--blue)', opacity: 0.75 }}
        />
      )}
    </div>
  );
}

export default function InfluenceIndex() {
  const [results, setResults]   = useState({ data: [], total: 0, pages: 0 });
  const [loading, setLoading]   = useState(true);
  const [stats, setStats]       = useState(null);
  const [search, setSearch]     = useState('');
  const [debouncedQ, setDQ]     = useState('');
  const [industry, setIndustry] = useState('');
  const [sort, setSort]         = useState('total');
  const [page, setPage]         = useState(1);
  const [animKey, setAnimKey]   = useState(0);

  useEffect(() => {
    fetch('/api/influence/stats')
      .then(r => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedQ, industry, sort]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ q: debouncedQ, industry, sort, page });
    fetch(`/api/influence?${params}`)
      .then(r => r.json())
      .then(json => { setResults(json); setLoading(false); setAnimKey(k => k + 1); })
      .catch(() => setLoading(false));
  }, [debouncedQ, industry, sort, page]);

  const { data: orgs, total, pages: totalPages } = results;
  const topIndustries = (stats?.industryList || []).slice(0, 8);

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <BackLinks links={[{ href: '/', label: 'home' }]} />

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--orange)', marginBottom: '0.4rem' }}>
          Investigative Tool
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontWeight: 400, color: 'var(--text)', margin: 0, lineHeight: 1.15 }}>
          Florida Influence Index
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem', marginTop: '0.5rem', lineHeight: 1.6, maxWidth: '640px' }}>
          Which organizations spend the most on Florida politics — combining direct campaign contributions
          and paid lobbying? Ranked by total estimated political spending.
        </p>
      </div>

      {/* Stats strip */}
      {stats && (
        <div style={{
          display: 'flex', gap: '0', marginBottom: '1.5rem',
          border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden', flexWrap: 'wrap',
        }}>
          {[
            { label: 'Combined Political Spend', value: <MoneyLens value={stats.totalInfluence}>{fmtCompact(stats.totalInfluence)}</MoneyLens>, color: 'var(--orange)', sub: 'lobbying + campaign finance' },
            { label: 'Campaign Donations', value: fmtCompact(stats.totalDonations), color: 'var(--teal)', sub: 'direct contributions' },
            { label: 'Lobbying Comp', value: fmtCompact(stats.totalLobbying), color: 'var(--blue)', sub: 'paid to lobbyists' },
            { label: 'Organizations Tracked', value: (stats.totalOrgs).toLocaleString(), color: 'var(--text)', sub: 'with $100K+ combined spend' },
          ].map(({ label, value, color, sub }, i, arr) => (
            <div key={label} style={{
              flex: '1 1 140px', padding: '0.65rem 0.85rem',
              borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.2rem' }}>{label}</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 400, color, fontFamily: 'var(--font-serif)', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', marginTop: '0.1rem' }}>{sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ width: '10px', height: '8px', background: 'var(--orange)', opacity: 0.75, borderRadius: '1px', display: 'inline-block' }} />
          Campaign donations
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ width: '10px', height: '8px', background: 'var(--blue)', opacity: 0.75, borderRadius: '1px', display: 'inline-block' }} />
          Lobbying compensation
        </span>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.25rem' }}>
        <input
          type="search"
          placeholder="Search organizations…"
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

        {/* Industry chips */}
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          <button onClick={() => setIndustry('')} style={chipStyle(!industry)}>All</button>
          {topIndustries.map(({ industry: ind }) => (
            <button key={ind} onClick={() => setIndustry(industry === ind ? '' : ind)} style={chipStyle(industry === ind)}>
              {ind}
            </button>
          ))}
        </div>

        <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginLeft: 'auto' }}>
          {loading ? 'Loading…' : `${total.toLocaleString()} organizations`}
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {[
                { label: '#',         align: 'center', width: '2.5rem' },
                { label: 'Organization' },
                { label: 'Industry',  align: 'left' },
                { label: 'Split',     align: 'center' },
                { label: 'Lobbying',  align: 'right' },
                { label: 'Donations', align: 'right' },
                { label: 'Total',     align: 'right' },
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
              <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.78rem' }}>Loading…</td></tr>
            )}
            {!loading && orgs.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.78rem' }}>No organizations found.</td></tr>
            )}
            {!loading && orgs.map((org, i) => {
              const rank    = ((page - 1) * 50) + i + 1;
              const donate  = parseFloat(org.donation_total  || 0);
              const lobby   = parseFloat(org.total_lobby_comp || 0);
              const total   = parseFloat(org.total_influence  || 0);

              return (
                <tr
                  key={`${org.slug}-${animKey}`}
                  className="stagger-item"
                  style={{
                    borderBottom: '1px solid rgba(100,140,220,0.07)',
                    animationDelay: `${Math.min(i * 0.022, 0.4)}s`,
                  }}
                >
                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                    {rank}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <Link href={`/principal/${org.slug}`} style={{ color: 'var(--orange)', textDecoration: 'none', fontWeight: 500 }}>
                      {org.name}
                    </Link>
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    {org.industry
                      ? <Link href={`/industry/${slugify(org.industry)}`} style={{ fontSize: '0.72rem', color: 'var(--blue)', textDecoration: 'none' }}>{org.industry}</Link>
                      : <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>—</span>
                    }
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                    <SplitBar donate={donate} lobby={lobby} />
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'var(--blue)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                    {lobby > 0 ? fmtCompact(lobby) : <span style={{ opacity: 0.3 }}>—</span>}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'var(--orange)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                    {donate > 0 ? fmtCompact(donate) : <span style={{ opacity: 0.3 }}>—</span>}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {fmtCompact(total)}
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

      {/* Methodology note */}
      <div style={{
        marginTop: '2rem', padding: '1rem', background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: '3px',
        fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.6,
      }}>
        <strong style={{ color: 'var(--text)' }}>Methodology:</strong>{' '}
        "Total influence" combines estimated lobbying compensation (FL Lobbyist Registration Office quarterly reports,
        2007–present) and direct campaign contributions (FL Division of Elections). Figures are all-time totals.{' '}
        <strong style={{ color: 'var(--gold)' }}>Note on lobbying figures:</strong>{' '}
        FL disclosure requires each registered lobbyist to report the same firm-level compensation amount, so principal
        totals are inflated by the number of lobbyists per firm. Relative rankings are reliable; absolute dollar amounts are overstated.
      </div>

      <div style={{ marginTop: '1rem' }}>
        <DataTrustBlock
          source="FL Lobbyist Registration Office (lobbying comp) · FL Division of Elections (campaign finance)"
          direct={['contribution amounts', 'lobbyist compensation reports']}
          normalized={['organizations matched across datasets by name — some mismatches possible']}
          inferred={['total influence score (lobbying + donations combined)']}
          caveats={[
            'Lobbying compensation below $50K is reported in ranges — midpoints used.',
            'Lobbying totals are the sum of per-lobbyist compensation reports per principal. The FL disclosure system records each lobbyist at a firm as reporting the same (firm-level) amount — this inflates principal totals by roughly the number of lobbyists per firm. Rankings are directionally correct; absolute dollar figures are overstated.',
            'Name matching is not verified against any external registry — some false matches possible.',
            'Federal lobbying and federal campaign finance are excluded.',
            'Only organizations with $100K+ combined spend are shown.',
          ]}
        />
      </div>
    </main>
  );
}
