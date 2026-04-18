'use client';

import { useState, useEffect } from 'react';

const RATE = 3_894_316_430 / (30 * 365.25 * 24 * 3600);

export default function MoneyClock() {
  const [dollars, setDollars] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      setDollars(Math.floor(((Date.now() - start) / 1000) * RATE));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      border: '1px solid rgba(255,176,96,0.18)',
      background: 'rgba(255,176,96,0.03)',
      borderRadius: '3px',
      padding: '0.75rem 1rem',
      marginBottom: '1.5rem',
      maxWidth: '520px',
    }}>
      <div style={{
        fontSize: '0.6rem', color: 'var(--text-dim)',
        textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem',
      }}>
        Live · Since you opened this page
      </div>
      <div style={{ fontSize: '0.88rem', lineHeight: 1.5, color: 'var(--text)' }}>
        FL politicians have raised approximately{' '}
        <span style={{ color: 'var(--orange)', fontWeight: 700, fontSize: '1rem' }}>
          ${dollars.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
