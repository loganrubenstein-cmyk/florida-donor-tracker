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
        body: JSON.stringify({ email, context: 'homepage-quarterly-ledger' }),
      });
      const json = await res.json();
      setStatus(json.ok ? 'ok' : 'error');
    } catch {
      setStatus('error');
    }
  }

  return (
    <section style={{ maxWidth: '1140px', margin: '0 auto', padding: '1.75rem 2.5rem 3rem' }}>
      <div className="rg-purpose" style={{
        border: '1px solid rgba(255,176,96,0.25)',
        background: 'linear-gradient(135deg, rgba(255,176,96,0.05), transparent 60%)',
        padding: '2.5rem 2.75rem',
        borderRadius: '4px',
        alignItems: 'center',
      }}>
        {/* Left — copy */}
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--orange)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '0.9rem' }}>
            ◤ THE QUARTERLY LEDGER
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.35rem, 3vw, 2rem)', color: 'var(--text)', lineHeight: 1.05, letterSpacing: '-0.02em', marginBottom: '0.9rem' }}>
            One email. Every data drop. The <em style={{ color: 'var(--orange)' }}>biggest checks</em> of the quarter.
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-dim)', lineHeight: 1.75, maxWidth: '420px' }}>
            Florida reports quarterly. When new filings land, we surface the most consequential contributions, the committees behind them, and where that money is headed next. No growth hacks. No unsubscribe maze.
          </p>
        </div>

        {/* Right — form or confirmation */}
        <div>
          {status === 'ok' ? (
            <div style={{ padding: '1.25rem 1.5rem', border: '1px solid rgba(128,255,160,0.35)', background: 'rgba(128,255,160,0.06)', borderRadius: '3px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--green)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                ◆ CONFIRMED
              </div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.15rem', color: 'var(--text)' }}>
                You&apos;re on the list.
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>
                First ledger ships with the next quarterly filing.
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', marginBottom: '0.9rem' }}>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@newsroom.org"
                  required
                  style={{
                    flex: 1,
                    background: 'rgba(1,1,13,0.8)',
                    border: '1px solid var(--border)',
                    borderRight: 'none',
                    color: 'var(--text)',
                    padding: '0.85rem 1rem',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8rem',
                    borderRadius: '3px 0 0 3px',
                    outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  style={{
                    background: 'var(--orange)',
                    color: '#01010d',
                    border: 'none',
                    padding: '0 1.35rem',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    cursor: status === 'loading' ? 'wait' : 'pointer',
                    borderRadius: '0 3px 3px 0',
                    opacity: status === 'loading' ? 0.6 : 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {status === 'loading' ? '…' : 'Subscribe'}
                </button>
              </div>

              {status === 'error' && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--republican)', marginBottom: '0.5rem' }}>
                  Something went wrong — try again.
                </div>
              )}

              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-dim)', letterSpacing: '0.08em', lineHeight: 1.6 }}>
                Free. Quarterly. Unsubscribe any time.
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
