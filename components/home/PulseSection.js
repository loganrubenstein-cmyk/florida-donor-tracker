'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fmtMoney } from '@/lib/fmt';

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function PulseSection() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/pulse?type=filings&limit=6')
      .then(r => r.json())
      .then(j => { setItems(j.items || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: '4px',
      background: 'var(--surface)',
      padding: '1rem 1.25rem',
      marginBottom: '2rem',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: '0.75rem',
      }}>
        <div style={{
          fontSize: '0.6rem',
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          fontFamily: 'var(--font-mono)',
        }}>
          Latest activity
        </div>
        <Link href="/pulse" style={{
          fontSize: '0.65rem',
          color: 'var(--teal)',
          textDecoration: 'none',
          fontFamily: 'var(--font-mono)',
        }}>
          full feed →
        </Link>
      </div>

      {loading ? (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', padding: '0.5rem 0' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', padding: '0.5rem 0' }}>No recent activity found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {items.map((item, i) => (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '2.5rem 1fr auto',
              gap: '0.5rem',
              alignItems: 'baseline',
              padding: '0.38rem 0',
              borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none',
              fontSize: '0.76rem',
            }}>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.65rem', fontFamily: 'var(--font-mono)' }}>
                {fmtDate(item.date)}
              </span>
              <span style={{ lineHeight: 1.4 }}>
                {item.donor_slug ? (
                  <Link href={`/donor/${item.donor_slug}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>
                    {item.donor_name}
                  </Link>
                ) : (
                  <span style={{ color: 'var(--text-dim)' }}>{item.donor_name}</span>
                )}
                <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}> → </span>
                <Link href={`/committee/${item.acct_num}`} style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.72rem' }}>
                  {item.recipient_name}
                </Link>
              </span>
              <span style={{
                color: 'var(--orange)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                whiteSpace: 'nowrap',
              }}>
                {fmtMoney(item.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
