'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { fmtMoney, fmtMoneyCompact } from '@/lib/fmt';

const TABS = [
  { key: 'filings',    label: 'Latest Filings' },
  { key: 'candidates', label: 'New Candidates' },
  { key: 'committees', label: 'New Committees' },
  { key: 'cycle',      label: 'This Cycle' },
];

function partyColor(p) {
  if (p === 'REP') return 'var(--republican)';
  if (p === 'DEM') return 'var(--democrat)';
  return 'var(--text-dim)';
}

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

function CandidatesTable({ items }) {
  if (!items.length) return <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>No new candidate filings in the past 60 days.</p>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          {['Filed', 'Candidate', 'Office', 'Party', 'Cycle'].map(h => (
            <th key={h} style={{ textAlign: 'left', padding: '0.4rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => (
          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
            <td style={{ padding: '0.55rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{fmtDate(item.date_start)}</td>
            <td style={{ padding: '0.55rem 0.6rem' }}>
              <Link href={`/candidate/${item.acct_num}`} style={{ color: 'var(--orange)', textDecoration: 'none', fontWeight: 500 }}>{item.name}</Link>
            </td>
            <td style={{ padding: '0.55rem 0.6rem', fontSize: '0.74rem', color: 'var(--text)' }}>
              {item.office || '—'}{item.district ? ` · ${item.district}` : ''}
            </td>
            <td style={{ padding: '0.55rem 0.6rem', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: partyColor(item.party) }}>{item.party || '—'}</td>
            <td style={{ padding: '0.55rem 0.6rem', fontSize: '0.72rem', color: 'var(--text-dim)', textAlign: 'right' }}>{item.election_year || '—'}</td>
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
        <span style={{ color: 'var(--text-dim)' }}>Analysis</span>
        {' / '}
        <span>Pulse</span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.4rem,3vw,2rem)', fontWeight: 400, marginBottom: '0.4rem' }}>
        Pulse
      </h1>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: '1.5rem', maxWidth: '620px' }}>
        Recent movement in Florida political money — large contributions by filing date, committees registered this cycle, and the top donors of 2026 so far. Backed by FL Division of Elections data, refreshed manually on a weekly cadence.
      </p>

      {/* Context strip — one card per tab */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '0', marginBottom: '1.5rem',
        border: '1px solid var(--border)', borderRadius: '3px', overflow: 'hidden',
      }}>
        {[
          { key: 'filings',    accent: '#ffb060', icon: '↑', head: 'Latest Filings',   body: 'Large contributions ($25K+) filed in the past 90 days — who gave, who received.' },
          { key: 'candidates', accent: '#80ffa0', icon: '✦', head: 'New Candidates',   body: 'Candidates whose FL DoE filing was registered in the past 60 days — who just entered a race.' },
          { key: 'committees', accent: '#4dd8f0', icon: '◎', head: 'New Committees',   body: 'PACs, ECOs, and party committees registered since Jan 1 of the current cycle.' },
          { key: 'cycle',      accent: '#a0c0ff', icon: '★', head: 'This Cycle',       body: 'Top donors by total giving since January 1 of the current cycle year — the biggest spenders so far.' },
        ].map(({ key, accent, icon, head, body }, i, arr) => (
          <button
            key={key}
            onClick={() => switchTab(key)}
            style={{
              padding: '0.9rem 1rem',
              background: tab === key ? `${accent}0f` : 'transparent',
              border: 'none',
              borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
              borderBottom: tab === key ? `2px solid ${accent}` : '2px solid transparent',
              cursor: 'pointer', textAlign: 'left',
              transition: 'background 0.12s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
              <span style={{ color: accent, fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>{icon}</span>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: tab === key ? accent : 'var(--text)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{head}</span>
            </div>
            <p style={{ fontSize: '0.65rem', color: 'var(--text-dim)', lineHeight: 1.55, margin: 0 }}>{body}</p>
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
      {!loading && current && tab === 'candidates' && <CandidatesTable items={current.items || []} />}
      {!loading && current && tab === 'committees' && <CommitteesTable items={current.items || []} />}
      {!loading && current && tab === 'cycle' && <CycleTable items={current.items || []} year={current.year || currentYear} />}

      {!loading && current && (current.latest_date || tab === 'cycle') && (
        <div style={{ marginTop: '1.5rem', fontSize: '0.66rem', color: 'var(--text-dim)', lineHeight: 1.6, padding: '0.75rem 0.9rem', border: '1px solid var(--border)', borderRadius: '3px' }}>
          {current.latest_date && (
            <div>
              <strong style={{ color: 'var(--text)' }}>Data current through:</strong>{' '}
              {fmtDate(current.latest_date)}
            </div>
          )}
          <div style={{ marginTop: '0.2rem' }}>
            FL Division of Elections campaign-finance data is re-ingested manually on a weekly cadence; there is no continuous live feed.
            For dates between the latest shown above and today, filings exist at the FL DoE but are not yet loaded here.
          </div>
        </div>
      )}

      <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <Link href="/explorer" style={{ fontSize: '0.72rem', color: 'var(--orange)', border: '1px solid rgba(255,176,96,0.25)', borderRadius: '3px', padding: '0.35rem 0.75rem', textDecoration: 'none' }}>
          → Explore all transactions
        </Link>
        <Link href="/committees" style={{ fontSize: '0.72rem', color: 'var(--teal)', border: '1px solid rgba(77,216,240,0.25)', borderRadius: '3px', padding: '0.35rem 0.75rem', textDecoration: 'none' }}>
          → Browse all committees
        </Link>
        <Link href="/donors" style={{ fontSize: '0.72rem', color: 'var(--orange)', border: '1px solid rgba(255,176,96,0.25)', borderRadius: '3px', padding: '0.35rem 0.75rem', textDecoration: 'none' }}>
          → Browse all donors
        </Link>
        <Link href="/follow" style={{ fontSize: '0.72rem', color: 'var(--teal)', border: '1px solid rgba(77,216,240,0.25)', borderRadius: '3px', padding: '0.35rem 0.75rem', textDecoration: 'none' }}>
          → Follow the money trail
        </Link>
      </div>
    </main>
  );
}
