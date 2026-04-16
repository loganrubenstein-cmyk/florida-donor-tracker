'use client';

import { useState } from 'react';

// Context benchmarks for FL (2024 approximate figures)
const CONTEXTS = [
  { label: 'FL teacher salaries/yr',     per: 48_000 },
  { label: 'months of avg FL rent',       per: 1_850  },
  { label: 'FL min-wage work-years',      per: 24_960 },
];

/**
 * Wraps a dollar value and shows an "in perspective" tooltip on hover.
 *
 * Usage:
 *   <MoneyLens value={34_900_000_000}>$34.9B</MoneyLens>
 */
export default function MoneyLens({ value, children }) {
  const [open, setOpen] = useState(false);

  if (!value || value < 100_000) return <>{children}</>;

  return (
    <span
      style={{ position: 'relative', cursor: 'help', display: 'inline-block' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span style={{ borderBottom: '1px dashed rgba(255,176,96,0.35)' }}>
        {children}
      </span>
      {open && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(8,8,24,0.97)', border: '1px solid var(--border)',
          borderRadius: '4px', padding: '0.55rem 0.85rem',
          fontSize: '0.65rem', color: 'var(--text-dim)',
          whiteSpace: 'nowrap', zIndex: 200, pointerEvents: 'none',
          boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
          lineHeight: 1.7,
          display: 'block',
        }}>
          <span style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '0.25rem' }}>
            in perspective
          </span>
          {CONTEXTS.map(({ label, per }) => (
            <span key={label} style={{ display: 'block' }}>
              <span style={{ color: 'var(--orange)', fontFamily: 'var(--font-mono)' }}>
                ≈ {Math.round(value / per).toLocaleString()}
              </span>
              {' '}{label}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
