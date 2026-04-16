'use client';

import useCountUp from '@/lib/useCountUp';
import useInViewport from '@/lib/useInViewport';

/**
 * Renders a numeric stat that counts up from 0 when scrolled into view.
 * SSR-safe: server renders the final value; client animates on first viewport entry.
 *
 * Props:
 *   value   {number}  - Raw numeric value to animate to
 *   format  {string}  - 'money' | 'compact' | 'billions' | 'count' | 'raw'
 *   color   {string}  - CSS color (default: var(--orange))
 *   style   {object}  - Additional inline styles applied to the value element
 */
function formatValue(n, format) {
  if (n == null || isNaN(n)) return '—';
  switch (format) {
    case 'money':
      return '$' + Math.floor(n).toLocaleString('en-US');
    case 'compact':
      if (n >= 1_000_000_000) return '$' + (n / 1_000_000_000).toFixed(1) + 'B';
      if (n >= 1_000_000)     return '$' + (n / 1_000_000).toFixed(1) + 'M';
      if (n >= 1_000)         return '$' + (n / 1_000).toFixed(0) + 'K';
      return '$' + Math.floor(n).toLocaleString('en-US');
    case 'billions':
      return '$' + (n / 1_000_000_000).toFixed(1) + 'B+';
    case 'count':
      return Math.floor(n).toLocaleString('en-US');
    case 'raw':
    default:
      return String(Math.floor(n));
  }
}

export default function AnimatedStat({ value, format = 'count', color, style = {} }) {
  const [ref, inView] = useInViewport();
  const animated      = useCountUp(value, { enabled: inView });

  return (
    <span
      ref={ref}
      style={{ color: color || 'var(--orange)', ...style }}
    >
      {formatValue(animated, format)}
    </span>
  );
}
