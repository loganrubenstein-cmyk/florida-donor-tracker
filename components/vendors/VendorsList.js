'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function fmt(n) {
  if (!n || n === 0) return '$0';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const SORT_OPTIONS = [
  { value: 'total_amount', label: 'Total Spend' },
  { value: 'num_payments', label: '# Payments' },
  { value: 'name',         label: 'Name A–Z' },
];

const TYPE_OPTIONS = [
  { value: 'all',        label: 'All Vendors' },
  { value: 'private',    label: 'Private' },
  { value: 'government', label: 'Government' },
  { value: 'franchise',  label: 'Utility / Franchise' },
];

const PAGE_SIZE = 50;

export default function VendorsList() {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const didMount     = useRef(false);

  const [results, setResults]       = useState({ data: [], total: 0, pages: 0 });
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState(() => searchParams?.get('q') || '');
  const [debouncedQ, setDebouncedQ] = useState(() => searchParams?.get('q') || '');
  const [type, setType]             = useState(() => searchParams?.get('type') || 'all');
  const [sortBy, setSortBy]         = useState(() => searchParams?.get('sort') || 'total_amount');
  const [page, setPage]             = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedQ, type, sortBy]);

  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    const params = new URLSearchParams();
    if (debouncedQ)     params.set('q', debouncedQ);
    if (type !== 'all') params.set('type', type);
    if (sortBy !== 'total_amount') params.set('sort', sortBy);
    const qs = params.toString();
    router.replace(`${pathname}${qs ? '?' + qs : ''}`, { scroll: false });
  }, [debouncedQ, type, sortBy]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ q: debouncedQ, type, sort: sortBy, page });
    fetch(`/api/vendors?${params}`)
      .then(r => r.json())
      .then(json => {
        const safe = json && json.data ? json : { data: [], total: 0, pages: 0 };
        setResults(safe);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [debouncedQ, type, sortBy, page]);

  const inputStyle = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '0.4rem 0.6rem',
    fontSize: '0.82rem', borderRadius: '3px',
    fontFamily: 'var(--font-mono)', outline: 'none',
  };

  const { data: pageItems, total, pages: totalPages } = results;

  return (
    <>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.5rem',
        marginBottom: '1.25rem', alignItems: 'center',
      }}>
        <input
          type="text"
          placeholder="Search by vendor name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, minWidth: '220px', flexGrow: 1 }}
        />
        <select value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
          {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
        <table className="dir-table" style={{ width: '100%', minWidth: '640px', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {[
                { label: '#',          align: 'center', width: '2rem' },
                { label: 'Vendor',     align: 'left'   },
                { label: 'Type',       align: 'center' },
                { label: '# Payments', align: 'right'  },
                { label: 'Total',      align: 'right'  },
              ].map(({ label, align, width }) => (
                <th key={label} style={{
                  padding: '0.4rem 0.6rem', textAlign: align, width,
                  fontSize: '0.6rem', fontWeight: 400,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: 'var(--text-dim)', whiteSpace: 'nowrap',
                }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && pageItems.length === 0 && (
              <tr>
                <td colSpan={5} style={{
                  padding: '2.5rem 0.6rem', color: 'var(--text-dim)',
                  fontSize: '0.82rem', textAlign: 'center', fontFamily: 'var(--font-mono)',
                }}>
                  No vendors match the current filters
                </td>
              </tr>
            )}
            {pageItems.map((v, i) => {
              const typeColor = v.is_government ? 'var(--blue)' : v.is_franchise ? 'var(--gold)' : 'var(--teal)';
              const typeLabel = v.is_government ? 'GOV' : v.is_franchise ? 'UTIL' : 'PRIV';
              return (
                <tr key={v.slug} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                    {(page - 1) * PAGE_SIZE + i + 1}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', wordBreak: 'break-word', maxWidth: '320px' }}>
                    <Link href={`/vendor/${v.slug}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                      {v.name}
                    </Link>
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center' }}>
                    <span style={{
                      fontSize: '0.58rem', padding: '0.05rem 0.3rem',
                      border: `1px solid ${typeColor}`, color: typeColor,
                      borderRadius: '2px', fontWeight: 'bold',
                    }}>{typeLabel}</span>
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                    {(v.num_payments || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--orange)', whiteSpace: 'nowrap', fontWeight: 700 }}>
                    {fmt(v.total_amount)}
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
    </>
  );
}
