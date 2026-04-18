'use client';

import { useState } from 'react';

export default function EmailStrip() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | ok | error

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('loading');
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, context: 'homepage-strip' }),
      });
      const json = await res.json();
      setStatus(json.ok ? 'ok' : 'error');
    } catch {
      setStatus('error');
    }
  }

  return (
    <section style={{ borderBottom: '1px solid rgba(100,140,220,0.1)', background: 'rgba(255,176,96,0.03)', maxWidth: '1140px', margin: '0 auto' }}>
      <div style={{ padding: '1.25rem 2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.2rem' }}>
            Get filing alerts
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
            New filings drop · Major donors · Per-candidate alerts available after signup
          </div>
        </div>

        {status === 'ok' ? (
          <div style={{ fontSize: '0.72rem', color: 'var(--green)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
            ✓ You're on the list
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              style={{
                background: 'rgba(8,8,24,0.8)', border: '1px solid rgba(100,140,220,0.35)',
                color: 'var(--text)', padding: '0.5rem 0.85rem', fontSize: '0.75rem',
                borderRadius: '3px', fontFamily: 'var(--font-mono)', outline: 'none', width: '220px',
              }}
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              style={{
                background: 'var(--orange)', color: '#01010d', border: 'none',
                padding: '0.5rem 1rem', fontSize: '0.72rem', fontWeight: 700,
                fontFamily: 'var(--font-sans)', borderRadius: '3px', cursor: 'pointer',
                opacity: status === 'loading' ? 0.6 : 1,
              }}
            >
              {status === 'loading' ? '…' : 'Subscribe'}
            </button>
          </form>
        )}
        {status === 'error' && (
          <div style={{ fontSize: '0.65rem', color: 'var(--republican)', marginTop: '0.25rem' }}>
            Something went wrong — try again.
          </div>
        )}
      </div>
    </section>
  );
}
