'use client';

import { useState, useEffect } from 'react';
import { fmtMoneyCompact as fmt, fmtCountCompact as fmtCount } from '@/lib/fmt';

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

const PAGE_SIZE = 50;

export default function CommitteesList() {
  const [results, setResults]       = useState({ data: [], total: 0, pages: 0 });
  const [loading, setLoading]       = useState(true);
  const [explainerOpen, setExplainerOpen] = useState(false);
  const [search, setSearch]         = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [sort, setSort]             = useState('total');
  const [sortDir, setSortDir]       = useState('desc');
  const [party, setParty]           = useState('all');
  const [page, setPage]             = useState(1);
  const [exporting, setExporting]   = useState(false);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [debouncedQ, sort, sortDir, party]);

  // Fetch from API
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ q: debouncedQ, sort, sort_dir: sortDir, party, page });
    fetch(`/api/committees?${params}`)
      .then(r => r.json())
      .then(json => { setResults(json.data ? json : { data: [], total: 0, pages: 0 }); setLoading(false); })
      .catch(() => setLoading(false));
  }, [debouncedQ, sort, sortDir, party, page]);

  async function handleExportCSV() {
    setExporting(true);
    try {
      const params = new URLSearchParams({ q: debouncedQ, sort, sort_dir: sortDir, party, export: '1' });
      const res = await fetch(`/api/committees?${params}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fl-committees-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const { data: pageItems, total, pages: totalPages } = results;

  if (loading && pageItems.length === 0) {
    return (
      <div style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
        Loading committees...
      </div>
    );
  }

  return (
    <div>
      {/* Committee type explainer */}
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
            What are PACs, ECOs, and CCEs in Florida?
          </span>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {explainerOpen ? '▲' : '▼'}
          </span>
        </button>
        {explainerOpen && (
          <div style={{ padding: '0 0.85rem 0.85rem', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', paddingTop: '0.75rem' }}>
              {[
                { abbr: 'PAC', name: 'Political Action Committee', color: 'var(--teal)', desc: 'Raises and spends money to elect or defeat candidates. No contribution limits in Florida state races — one donor can give millions. Can donate directly to candidates.' },
                { abbr: 'ECO', name: 'Electioneering Comm. Org.', color: 'var(--orange)', desc: 'Runs ads or communications about candidates within 60 days of an election. Cannot coordinate directly with candidates. Unlimited contributions allowed.' },
                { abbr: 'CCE', name: 'Candidate Campaign Ext.', color: 'var(--blue)', desc: 'The main campaign account for a candidate. Hard-money contributions — limited to $3,000 per individual per election. Most transparent type.' },
                { abbr: 'PTY', name: 'Political Party', color: 'var(--gold)', desc: 'Statewide or local party organizations (Republican Party of Florida, Florida Democratic Party). Raise money for party operations and candidate support.' },
              ].map(({ abbr, name, color, desc }) => (
                <div key={abbr}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color, marginBottom: '0.2rem', fontFamily: 'var(--font-mono)' }}>
                    {abbr} — {name}
                  </div>
                  <div style={{ fontSize: '0.73rem', color: 'var(--text-dim)', lineHeight: 1.55 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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
            fontSize: '0.82rem', borderRadius: '3px', fontFamily: 'var(--font-mono)',
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
            fontSize: '0.82rem', borderRadius: '3px', fontFamily: 'var(--font-mono)',
          }}
        >
          <option value="total">Sort: Total Received</option>
          <option value="contributions">Sort: Contributions</option>
          <option value="name">Sort: Name A–Z</option>
        </select>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
          {loading ? '…' : `${pageItems.length.toLocaleString()} committees`}
        </span>
        <button
          onClick={handleExportCSV}
          disabled={exporting || loading}
          style={{
            padding: '0.4rem 0.85rem', background: 'transparent',
            border: '1px solid rgba(100,140,220,0.3)',
            color: exporting ? 'var(--text-dim)' : 'var(--teal)',
            fontSize: '0.7rem', borderRadius: '3px',
            fontFamily: 'var(--font-mono)', cursor: exporting || loading ? 'default' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {exporting ? 'Exporting…' : '↓ CSV'}
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
        <table className="dir-table" style={{ width: '100%', minWidth: '400px', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {[
                { label: '#',              align: 'center' },
                { label: 'Committee',      align: 'left',  sortKey: 'name'          },
                { label: 'Contributions',  align: 'right', sortKey: 'contributions' },
                { label: 'Total Received', align: 'right', sortKey: 'total'         },
              ].map(({ label, align, sortKey }) => {
                const isActive = sortKey && sort === sortKey;
                return (
                  <th key={label}
                    onClick={sortKey ? () => {
                      if (sort === sortKey) {
                        setSortDir(d => d === 'desc' ? 'asc' : 'desc');
                      } else {
                        setSort(sortKey);
                        setSortDir(sortKey === 'name' ? 'asc' : 'desc');
                      }
                    } : undefined}
                    style={{
                      padding: '0.35rem 0.6rem', fontSize: '0.6rem', fontWeight: 400,
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                      textAlign: align,
                      color: isActive ? 'var(--text)' : 'var(--text-dim)',
                      cursor: sortKey ? 'pointer' : 'default',
                      userSelect: 'none', whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                    {isActive && <span style={{ color: 'var(--orange)', marginLeft: '0.25rem' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                    {!isActive && sortKey && <span style={{ color: 'rgba(90,106,136,0.3)', marginLeft: '0.25rem' }}>↕</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageItems.map((c, i) => (
              <tr key={c.acct_num} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '3rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                  {(page - 1) * PAGE_SIZE + i + 1}
                </td>
                <td style={{ padding: '0.4rem 0.6rem' }}>
                  <a href={`/committee/${c.acct_num}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                    {c.committee_name}
                  </a>
                  <a
                    href={`/explorer?recipient_acct=${c.acct_num}&recipient_type=committee`}
                    style={{ marginLeft: '0.4rem', fontSize: '0.58rem', color: 'var(--text-dim)', textDecoration: 'none', verticalAlign: 'middle' }}
                    title="View contributions in explorer"
                  >
                    ↗
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
                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                  {fmtCount(c.num_contributions)}
                </td>
                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--orange)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
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
          { href: '/candidates',  label: 'Candidates',              color: 'var(--blue)',     border: 'rgba(160,192,255,0.25)' },
          { href: '/donors',      label: 'Donors',                  color: 'var(--orange)',   border: 'rgba(255,176,96,0.25)'  },
          { href: '/explorer',    label: 'All Transactions',        color: 'var(--text-dim)', border: 'var(--border)'          },
          { href: '/connections', label: 'Committee Connections',   color: 'var(--teal)',     border: 'rgba(77,216,240,0.25)'  },
          { href: '/ie',          label: 'Independent Expenditures', color: 'var(--orange)',  border: 'rgba(255,176,96,0.25)'  },
        ].map(({ href, label, color, border }) => (
          <a key={href} href={href} style={{ fontSize: '0.72rem', color, textDecoration: 'none', border: `1px solid ${border}`, borderRadius: '3px', padding: '0.2rem 0.55rem' }}>
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}
