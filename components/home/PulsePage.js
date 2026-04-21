'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { fmtMoney, fmtMoneyCompact } from '@/lib/fmt';

const TABS = [
  { key: 'filings',    label: 'Latest Filings' },
  { key: 'committees', label: 'New Committees' },
  { key: 'cycle',      label: 'This Cycle' },
];

function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function FilingsTable({ items }) {
  if (!items.length) return <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>No recent large filings found.</p>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          {['Date', 'Donor', 'Recipient', 'Amount', ''].map(h => (
            <th key={h} style={{ textAlign: 'left', padding: '0.4rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => (
          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '0.55rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{fmtDate(item.date)}</td>
            <td style={{ padding: '0.55rem 0.6rem' }}>
              {item.donor_slug ? (
                <Link href={`/donor/${item.donor_slug}`} style={{ color: 'var(--orange)', textDecoration: 'none', fontWeight: 500 }}>{item.donor_name}</Link>
              ) : <span style={{ color: 'var(--text)' }}>{item.donor_name}</span>}
            </td>
            <td style={{ padding: '0.55rem 0.6rem' }}>
              <Link href={`/committee/${item.acct_num}`} style={{ color: 'var(--teal)', textDecoration: 'none', fontSize: '0.74rem' }}>{item.recipient_name}</Link>
            </td>
            <td style={{ padding: '0.55rem 0.6rem', color: 'var(--orange)', fontFamily: 'var(--font-mono)', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMoney(item.amount)}</td>
            <td style={{ padding: '0.55rem 0.6rem' }}>
              {item.donor_slug && (
                <Link href={`/follow?donor=${item.donor_slug}`} style={{ fontSize: '0.65rem', color: 'var(--teal)', textDecoration: 'none', opacity: 0.8, whiteSpace: 'nowrap' }}>follow →</Link>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CommitteesTable({ items }) {
  if (!items.length) return <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>No recent committees found.</p>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          {['Registered', 'Committee', 'Total Raised'].map(h => (
            <th key={h} style={{ textAlign: 'left', padding: '0.4rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => (
          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '0.55rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{fmtDate(item.date_start)}</td>
            <td style={{ padding: '0.55rem 0.6rem' }}>
              <Link href={`/committee/${item.acct_num}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>{item.name}</Link>
            </td>
            <td style={{ padding: '0.55rem 0.6rem', color: 'var(--orange)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
              {item.total_received > 0 ? fmtMoneyCompact(item.total_received) : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CycleTable({ items, year }) {
  if (!items.length) return <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>No cycle data found.</p>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          {['#', 'Donor', 'Type', `Total (${year})`, ''].map(h => (
            <th key={h} style={{ textAlign: 'left', padding: '0.4rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => (
          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '0.55rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.72rem' }}>{i + 1}</td>
            <td style={{ padding: '0.55rem 0.6rem' }}>
              <Link href={`/donor/${item.donor_slug}`} style={{ color: 'var(--orange)', textDecoration: 'none', fontWeight: 500 }}>{item.name}</Link>
            </td>
            <td style={{ padding: '0.55rem 0.6rem', fontSize: '0.7rem', color: 'var(--text-dim)' }}>{item.is_corporate ? 'Corporate' : 'Individual'}</td>
            <td style={{ padding: '0.55rem 0.6rem', color: 'var(--orange)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{fmtMoneyCompact(item.total)}</td>
            <td style={{ padding: '0.55rem 0.6rem' }}>
              <Link href={`/follow?donor=${item.donor_slug}`} style={{ fontSize: '0.65rem', color: 'var(--teal)', textDecoration: 'none', opacity: 0.8, whiteSpace: 'nowrap' }}>follow →</Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function PulsePage() {
  const [tab, setTab] = useState('filings');
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const currentYear = new Date().getFullYear();

  const load = useCallback(async (t) => {
    if (data[t]) return;
    setLoading(true);
    try {
      const qs = t === 'cycle' ? `type=${t}&year=${currentYear}&limit=50` : `type=${t}&limit=50`;
      const res = await fetch(`/api/pulse?${qs}`);
      const json = await res.json();
      setData(prev => ({ ...prev, [t]: json }));
    } finally {
      setLoading(false);
    }
  }, [data, currentYear]);

  useEffect(() => { load('filings'); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function switchTab(t) {
    setTab(t);
    load(t);
  }

  const current = data[tab];

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/tools" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Tools</Link>
        {' / '}
        <span>Pulse</span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.4rem,3vw,2rem)', fontWeight: 400, marginBottom: '0.4rem' }}>
        Pulse
      </h1>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: '1.5rem', maxWidth: '620px' }}>
        What's happening in Florida political money right now — recent large contributions, newly registered committees, and the top donors of the current cycle.
      </p>

      <div className="tab-bar" style={{ marginBottom: '1.5rem' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            className={tab === t.key ? 'tab tab-active' : 'tab'}
            onClick={() => switchTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>Loading…</p>}

      {!loading && current?.note && (
        <p style={{ color: 'var(--text-dim)', fontSize: '0.78rem', fontStyle: 'italic', marginBottom: '0.75rem' }}>
          {current.note}
        </p>
      )}

      {!loading && current && tab === 'filings' && <FilingsTable items={current.items || []} />}
      {!loading && current && tab === 'committees' && <CommitteesTable items={current.items || []} />}
      {!loading && current && tab === 'cycle' && <CycleTable items={current.items || []} year={current.year || currentYear} />}
    </main>
  );
}
