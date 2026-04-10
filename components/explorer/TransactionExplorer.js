'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { fmtMoney, fmtDate, fmtCount } from '@/lib/fmt';

const PAGE_SIZE = 50;

function buildUrl(base, params) {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') u.set(k, String(v));
  });
  const qs = u.toString();
  return qs ? `${base}?${qs}` : base;
}

function FilterInput({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <label style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          color: 'var(--text)', padding: '0.4rem 0.6rem', fontSize: '0.78rem',
          borderRadius: '3px', fontFamily: 'var(--font-mono)', width: '100%',
        }}
      />
    </div>
  );
}

export default function TransactionExplorer({
  initialDonorSlug = '',
  initialRecipientAcct = '',
  initialRecipientType = '',
  prefilterLabel = null,
}) {
  const router     = useRouter();
  const pathname   = usePathname();
  const searchParams = useSearchParams();

  // ── Filter state (URL-backed) ────────────────────────────────────────────────
  const [q,            setQ]           = useState(searchParams.get('q')            || '');
  const [donorSlug,    setDonorSlug]   = useState(initialDonorSlug || searchParams.get('donor_slug')    || '');
  const [recipAcct,    setRecipAcct]   = useState(initialRecipientAcct || searchParams.get('recipient_acct') || '');
  const [recipType,    setRecipType]   = useState(initialRecipientType || searchParams.get('recipient_type') || '');
  const [year,         setYear]        = useState(searchParams.get('year')         || '');
  const [txType,       setTxType]      = useState(searchParams.get('tx_type')      || '');
  const [amountMin,    setAmountMin]   = useState(searchParams.get('amount_min')   || '');
  const [amountMax,    setAmountMax]   = useState(searchParams.get('amount_max')   || '');
  const [dateStart,    setDateStart]   = useState(searchParams.get('date_start')   || '');
  const [dateEnd,      setDateEnd]     = useState(searchParams.get('date_end')     || '');
  const [sort,         setSort]        = useState(searchParams.get('sort')         || 'contribution_date');
  const [sortDir,      setSortDir]     = useState(searchParams.get('sort_dir')     || 'desc');
  const [page,         setPage]        = useState(parseInt(searchParams.get('page') || '1', 10));

  // ── Result state ─────────────────────────────────────────────────────────────
  const [data,        setData]        = useState([]);
  const [total,       setTotal]       = useState(null);
  const [pages,       setPages]       = useState(1);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [exporting,   setExporting]   = useState(false);

  const abortRef = useRef(null);

  const filters = { q, donor_slug: donorSlug, recipient_acct: recipAcct,
    recipient_type: recipType, year, tx_type: txType,
    amount_min: amountMin, amount_max: amountMax,
    date_start: dateStart, date_end: dateEnd, sort, sort_dir: sortDir, page };

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetch_ = useCallback(async (f) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const url = buildUrl('/api/transactions', { ...f, page_size: PAGE_SIZE });
      const res = await fetch(url, { signal: abortRef.current.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json.data || []);
      setTotal(json.total ?? null);
      setPages(json.pages || 1);
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(filters); }, [q, donorSlug, recipAcct, recipType, year,
    txType, amountMin, amountMax, dateStart, dateEnd, sort, sortDir, page]);

  // Sync URL — skip when embedded inside a profile page (would wipe ?tab= param)
  useEffect(() => {
    if (initialRecipientAcct || initialDonorSlug) return;
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v && v !== '' && !(k === 'page' && v === 1) && !(k === 'sort' && v === 'contribution_date') && !(k === 'sort_dir' && v === 'desc')) {
        params.set(k, String(v));
      }
    });
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [q, donorSlug, recipAcct, recipType, year, txType, amountMin, amountMax, dateStart, dateEnd, sort, sortDir, page]);

  function handleSort(col) {
    if (sort === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSort(col);
      setSortDir('desc');
    }
    setPage(1);
  }

  function clearFilters() {
    setQ(''); setYear(''); setTxType(''); setAmountMin(''); setAmountMax('');
    setDateStart(''); setDateEnd(''); setPage(1);
    if (!initialDonorSlug) setDonorSlug('');
    if (!initialRecipientAcct) setRecipAcct('');
    if (!initialRecipientType) setRecipType('');
  }

  async function handleExportCSV() {
    setExporting(true);
    try {
      const url = buildUrl('/api/transactions', {
        q, donor_slug: donorSlug, recipient_acct: recipAcct,
        recipient_type: recipType, year, tx_type: txType,
        amount_min: amountMin, amount_max: amountMax,
        date_start: dateStart, date_end: dateEnd,
        sort, sort_dir: sortDir, page: 1, page_size: 500,
      });
      const res  = await fetch(url);
      const json = await res.json();
      const rows = json.data || [];

      const headers = ['date', 'contributor_name', 'occupation', 'amount', 'recipient_name', 'recipient_type', 'recipient_acct', 'type'];
      const lines   = [
        headers.join(','),
        ...rows.map(r => [
          r.contribution_date || '',
          `"${(r.contributor_name || '').replace(/"/g, '""')}"`,
          `"${(r.contributor_occupation || '').replace(/"/g, '""')}"`,
          r.amount ?? '',
          `"${(r.recipient_name || '').replace(/"/g, '""')}"`,
          r.recipient_type || '',
          r.recipient_acct || '',
          r.type_code || '',
        ].join(',')),
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = `fl-transactions-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setExporting(false);
    }
  }

  const SortIcon = ({ col }) => {
    if (sort !== col) return <span style={{ color: 'var(--border)', marginLeft: '0.25rem' }}>↕</span>;
    return <span style={{ color: 'var(--orange)', marginLeft: '0.25rem' }}>{sortDir === 'desc' ? '↓' : '↑'}</span>;
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'var(--font-mono)' }}>
      {prefilterLabel && (
        <div style={{ fontSize: '0.7rem', color: 'var(--teal)', marginBottom: '1rem' }}>
          Filtered: {prefilterLabel}
        </div>
      )}

      {/* Filter panel */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '0.75rem', padding: '1rem', background: 'rgba(8,8,24,0.6)',
        border: '1px solid var(--border)', borderRadius: '4px', marginBottom: '1rem',
      }}>
        <FilterInput label="Contributor name" value={q} onChange={v => { setQ(v); setPage(1); }} placeholder="First or last name…" />
        {!initialRecipientAcct && (
          <FilterInput label="Recipient acct #" value={recipAcct} onChange={v => { setRecipAcct(v); setPage(1); }} placeholder="e.g. 4700" />
        )}
        {!initialDonorSlug && (
          <FilterInput label="Donor slug" value={donorSlug} onChange={v => { setDonorSlug(v); setPage(1); }} placeholder="e.g. john-smith" />
        )}
        <FilterInput label="Year" value={year} onChange={v => { setYear(v); setPage(1); }} placeholder="e.g. 2022" type="number" />
        <FilterInput label="Amount min ($)" value={amountMin} onChange={v => { setAmountMin(v); setPage(1); }} placeholder="e.g. 1000" type="number" />
        <FilterInput label="Amount max ($)" value={amountMax} onChange={v => { setAmountMax(v); setPage(1); }} placeholder="e.g. 50000" type="number" />
        <FilterInput label="Date start" value={dateStart} onChange={v => { setDateStart(v); setPage(1); }} placeholder="YYYY-MM-DD" />
        <FilterInput label="Date end" value={dateEnd} onChange={v => { setDateEnd(v); setPage(1); }} placeholder="YYYY-MM-DD" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Type
          </label>
          <select
            value={txType}
            onChange={e => { setTxType(e.target.value); setPage(1); }}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--text)', padding: '0.4rem 0.6rem', fontSize: '0.78rem',
              borderRadius: '3px', fontFamily: 'var(--font-mono)',
            }}
          >
            <option value="">All types</option>
            <option value="CHE">Check (CHE)</option>
            <option value="MON">Monetary (MON)</option>
            <option value="INK">In-Kind (INK)</option>
            <option value="LOA">Loan (LOA)</option>
            <option value="CAS">Cash (CAS)</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Recipient type
          </label>
          <select
            value={recipType}
            onChange={e => { setRecipType(e.target.value); setPage(1); }}
            disabled={!!initialRecipientType}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--text)', padding: '0.4rem 0.6rem', fontSize: '0.78rem',
              borderRadius: '3px', fontFamily: 'var(--font-mono)',
              opacity: initialRecipientType ? 0.5 : 1,
            }}
          >
            <option value="">Both</option>
            <option value="committee">Committee</option>
            <option value="candidate">Candidate</option>
          </select>
        </div>
      </div>

      {/* Results header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
        <span>
          {loading
            ? 'Loading…'
            : error
              ? <span style={{ color: 'var(--republican)' }}>Error: {error}</span>
              : total !== null
                ? `${fmtCount(total)} transactions · page ${page} of ${pages}`
                : data.length > 0
                  ? `Most recent ${data.length} transactions — add filters to search 10.9M+`
                  : ''}
        </span>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            onClick={handleExportCSV}
            disabled={exporting || loading || data.length === 0}
            style={{
              background: 'none', border: '1px solid rgba(77,216,240,0.35)',
              color: exporting ? 'var(--text-dim)' : 'var(--teal)',
              padding: '0.2rem 0.5rem', fontSize: '0.7rem',
              cursor: exporting || loading || data.length === 0 ? 'default' : 'pointer',
              borderRadius: '3px', opacity: data.length === 0 ? 0.4 : 1,
            }}
          >
            {exporting ? 'Exporting…' : '↓ CSV'}
          </button>
          <button
            onClick={clearFilters}
            style={{
              background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)',
              padding: '0.2rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer', borderRadius: '3px',
            }}
          >
            Clear filters
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {[
                { col: 'contribution_date', label: 'Date' },
                { col: 'contributor_name',  label: 'Contributor' },
                { col: null,                label: 'Occupation' },
                { col: 'amount',            label: 'Amount' },
                { col: null,                label: 'Recipient' },
                { col: 'type_code',         label: 'Type' },
              ].map(({ col, label }) => (
                <th
                  key={label}
                  onClick={col ? () => handleSort(col) : undefined}
                  style={{
                    padding: '0.4rem 0.6rem', textAlign: label === 'Amount' ? 'right' : 'left',
                    fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
                    letterSpacing: '0.08em', fontWeight: 400,
                    cursor: col ? 'pointer' : 'default',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}{col && <SortIcon col={col} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={row.id} style={{ borderBottom: '1px solid rgba(100,140,220,0.05)' }}>
                <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                  {row.contribution_date ? fmtDate(row.contribution_date) : '—'}
                </td>
                <td style={{ padding: '0.4rem 0.6rem', maxWidth: '220px' }}>
                  {row.donor_slug ? (
                    <a href={`/donor/${row.donor_slug}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                      {row.contributor_name || '—'}
                    </a>
                  ) : (
                    <span style={{ color: 'var(--text)' }}>{row.contributor_name || '—'}</span>
                  )}
                </td>
                <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.7rem', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.contributor_occupation || '—'}
                </td>
                <td style={{ padding: '0.4rem 0.6rem', color: 'var(--orange)', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {row.amount != null ? fmtMoney(row.amount) : '—'}
                </td>
                <td style={{ padding: '0.4rem 0.6rem', maxWidth: '200px' }}>
                  {row.recipient_type === 'committee' ? (
                    <a href={`/committee/${row.recipient_acct}`} style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: '0.7rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.recipient_name || `Cmte #${row.recipient_acct}`}
                    </a>
                  ) : row.recipient_type === 'candidate' ? (
                    <a href={`/candidate/${row.recipient_acct}`} style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: '0.7rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.recipient_name || `Cand #${row.recipient_acct}`}
                    </a>
                  ) : (
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>#{row.recipient_acct}</span>
                  )}
                </td>
                <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.68rem' }}>
                  {row.type_code || '—'}
                </td>
              </tr>
            ))}
            {!loading && data.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                  No transactions found matching these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            style={{
              padding: '0.3rem 0.75rem', border: '1px solid var(--border)',
              background: 'none', color: page <= 1 ? 'var(--border)' : 'var(--text-dim)',
              fontSize: '0.75rem', cursor: page <= 1 ? 'not-allowed' : 'pointer', borderRadius: '3px',
            }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', padding: '0.3rem 0.5rem', alignSelf: 'center' }}>
            {page} / {pages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(pages, p + 1))}
            disabled={page >= pages || loading}
            style={{
              padding: '0.3rem 0.75rem', border: '1px solid var(--border)',
              background: 'none', color: page >= pages ? 'var(--border)' : 'var(--text-dim)',
              fontSize: '0.75rem', cursor: page >= pages ? 'not-allowed' : 'pointer', borderRadius: '3px',
            }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
