'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import BackLinks from '@/components/BackLinks';
import SectionHeader from '@/components/shared/SectionHeader';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import { fmtMoneyCompact as fmtMoney } from '@/lib/fmt';

const PARTY_COLOR = { R: 'var(--republican)', D: 'var(--democrat)' };
const PARTY_LABEL = { R: 'Republican', D: 'Democrat', NPA: 'NPA' };

const SORT_OPTIONS = [
  { value: 'display_name',       label: 'Name A–Z' },
  { value: 'district',           label: 'District' },
  { value: 'total_raised',       label: 'Most Raised' },
  { value: 'participation_rate', label: 'Participation %' },
  { value: 'term_limit_year',    label: 'Terms Out' },
];

const inputStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  padding: '0.4rem 0.6rem',
  fontSize: '0.72rem',
  borderRadius: '3px',
  fontFamily: 'var(--font-mono)',
  outline: 'none',
};

const chipStyle = (active) => ({
  padding: '0.3rem 0.7rem',
  fontSize: '0.68rem',
  borderRadius: '3px',
  border: `1px solid ${active ? 'var(--teal)' : 'var(--border)'}`,
  background: active ? 'rgba(77,216,240,0.08)' : 'transparent',
  color: active ? 'var(--teal)' : 'var(--text-dim)',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  transition: 'border-color 0.12s',
});

const fmtCompact = fmtMoney;

export default function LegislatorsList() {
  const [results, setResults] = useState({ data: [], total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [chamber, setChamber] = useState('all');
  const [party, setParty] = useState('all');
  const [sortBy, setSortBy] = useState('display_name');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch('/api/legislators/stats')
      .then(r => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedQ, chamber, party, sortBy, sortDir]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      q: debouncedQ, chamber, party, sort: sortBy, sort_dir: sortDir, page,
    });
    fetch(`/api/legislators?${params}`)
      .then(r => r.json())
      .then(json => { setResults(json); setLoading(false); })
      .catch(() => setLoading(false));
  }, [debouncedQ, chamber, party, sortBy, sortDir, page]);

  const { data: items, total, pages: totalPages } = results;

  const houseCount = chamber === 'Senate' ? 0 : (chamber === 'all' ? total : total);
  const showingChamber = chamber === 'all' ? 'legislators' : `${chamber} members`;

  return (
    <main style={{ maxWidth: '1040px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <BackLinks links={[{ href: '/', label: 'home' }]} />

      <SectionHeader title="Florida Legislature" eyebrow="FL Legislature · 2024–2026 Term" />
      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '-0.75rem', marginBottom: '1.25rem' }}>
        Current 2024–2026 term · House (120) + Senate (40)
      </div>

      {/* Stats strip */}
      {stats && (
        <div style={{
          display: 'flex', gap: '0', marginBottom: '1.5rem',
          border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden',
          flexWrap: 'wrap',
        }}>
          {[
            { label: 'Combined Raised', value: fmtCompact(stats.totalRaised), color: 'var(--orange)', sub: `${stats.total} legislators` },
            { label: 'Republicans', value: fmtCompact(stats.byParty?.R?.raised || 0), color: 'var(--republican)', sub: `${stats.byParty?.R?.count || 0} members` },
            { label: 'Democrats', value: fmtCompact(stats.byParty?.D?.raised || 0), color: 'var(--democrat)', sub: `${stats.byParty?.D?.count || 0} members` },
            { label: 'Senate', value: `${stats.byChamber?.Senate?.count || 0} members`, color: 'var(--teal)', sub: fmtCompact(stats.byChamber?.Senate?.raised || 0) + ' raised' },
            { label: 'Avg Vote Participation', value: stats.avgParticipation != null ? `${Math.round(stats.avgParticipation * 100)}%` : '—', color: 'var(--green)', sub: 'floor votes' },
          ].map(({ label, value, color, sub }, i, arr) => (
            <div key={label} style={{ flex: '1 1 120px', padding: '0.65rem 0.85rem', borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.2rem' }}>{label}</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color, fontFamily: 'var(--font-mono)', lineHeight: 1.2 }}>{value}</div>
              {sub && <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', marginTop: '0.1rem' }}>{sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.25rem' }}>
        <input
          type="search"
          placeholder="Search by name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, width: '200px' }}
        />

        {/* Chamber toggle */}
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {['all', 'House', 'Senate'].map(c => (
            <button key={c} onClick={() => setChamber(c)} style={chipStyle(chamber === c)}>
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>

        {/* Party toggle */}
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {['all', 'R', 'D'].map(p => (
            <button key={p} onClick={() => setParty(p)} style={{
              ...chipStyle(party === p),
              color: party === p
                ? (p === 'R' ? 'var(--republican)' : p === 'D' ? 'var(--democrat)' : 'var(--teal)')
                : 'var(--text-dim)',
              borderColor: party === p
                ? (p === 'R' ? 'var(--republican)' : p === 'D' ? 'var(--democrat)' : 'var(--teal)')
                : 'var(--border)',
            }}>
              {p === 'all' ? 'All Parties' : p === 'R' ? 'Republican' : 'Democrat'}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={e => { setSortBy(e.target.value); setSortDir(e.target.value === 'display_name' || e.target.value === 'district' || e.target.value === 'term_limit_year' ? 'asc' : 'desc'); }}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginLeft: 'auto' }}>
          {loading ? 'Loading…' : `${total.toLocaleString()} ${showingChamber}`}
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Name', 'Chamber', 'District', 'Party', 'Leadership', 'Raised', 'Vote Part.', 'Terms Out'].map(h => (
                <th key={h} style={{
                  padding: '0.4rem 0.75rem', textAlign: 'left',
                  fontSize: '0.6rem', color: 'var(--text-dim)',
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                  fontWeight: 600, whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.78rem' }}>Loading…</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.78rem' }}>No legislators found.</td></tr>
            )}
            {!loading && items.map(leg => {
              const partyColor = PARTY_COLOR[leg.party] || 'var(--text-dim)';
              const total = (leg.votes_yea || 0) + (leg.votes_nay || 0) + (leg.votes_nv || 0) + (leg.votes_absent || 0);
              const partRate = leg.participation_rate != null
                ? Math.round(leg.participation_rate * 100)
                : null;
              const raised = fmtMoney(leg.total_raised);

              return (
                <tr key={leg.people_id} style={{ borderBottom: '1px solid rgba(100,140,220,0.07)' }}>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <Link href={`/legislator/${leg.people_id}`} style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 500 }}>
                      {leg.display_name}
                    </Link>
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{
                      fontSize: '0.65rem', padding: '0.15rem 0.4rem',
                      border: '1px solid var(--border)', borderRadius: '3px',
                      color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
                    }}>
                      {leg.chamber === 'House' ? 'H' : 'S'}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', color: 'var(--teal)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                    {leg.district}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{ color: partyColor, fontSize: '0.7rem', fontWeight: 600 }}>
                      {PARTY_LABEL[leg.party] || leg.party}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', color: 'var(--orange)', fontSize: '0.7rem' }}>
                    {leg.leadership_title || ''}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                    {raised || '—'}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    {partRate != null && total > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <div style={{ width: '48px', height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${partRate}%`, height: '100%', background: partRate >= 90 ? 'var(--green)' : partRate >= 70 ? 'var(--orange)' : 'var(--republican)', borderRadius: '2px' }} />
                        </div>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{partRate}%</span>
                      </div>
                    ) : <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>—</span>}
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    {leg.term_limit_year ? (
                      <span style={{
                        fontSize: '0.68rem', fontFamily: 'var(--font-mono)',
                        color: leg.term_limit_year <= 2026 ? 'var(--orange)' : 'var(--text-dim)',
                        fontWeight: leg.term_limit_year <= 2026 ? 600 : 400,
                      }}>
                        {leg.term_limit_year}
                        {leg.term_limit_year <= 2026 && <span style={{ fontSize: '0.55rem', marginLeft: '3px', color: 'var(--orange)' }}>↑</span>}
                      </span>
                    ) : <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>—</span>}
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
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{ ...inputStyle, cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.4 : 1 }}
          >Next →</button>
        </div>
      )}

      <div style={{ marginTop: '3rem' }}>
        <DataTrustBlock
          source="LobbyTools member export · LegiScan API · FL Division of Elections"
          
          direct={['name', 'party', 'district', 'chamber', 'leadership title', 'contact info']}
          normalized={['campaign finance totals matched from FL DoE candidate records by name + district']}
          caveats={[
            'Covers current 2024–2026 legislative term only.',
            'Vote participation rates cover floor votes (Third Reading / Final Passage) via LegiScan.',
            'Finance totals sourced from FL Division of Elections candidate filings.',
            '~13% of legislators had no matching FL DoE candidate record.',
          ]}
        />
      </div>
    </main>
  );
}
