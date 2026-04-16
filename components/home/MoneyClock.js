'use client';

import { useState, useEffect } from 'react';

// $3.894B tracked over 30 years (1996–2026) ≈ $1.50/sec
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
      fontSize: '0.62rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
      marginTop: '0.6rem', letterSpacing: '0.01em',
    }}>
      Since you opened this page, FL politicians have raised approximately{' '}
      <span style={{ color: 'var(--orange)', fontWeight: 700 }}>
        ${dollars.toLocaleString()}
      </span>
    </div>
  );
}
