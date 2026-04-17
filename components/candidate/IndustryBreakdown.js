'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import useInViewport from '@/lib/useInViewport';
import { INDUSTRY_COLORS } from '@/lib/industryColors';
import { slugify } from '@/lib/slugify';

function fmt(n) {
  if (!n || n === 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function IndustryBreakdown({ acctNum, total }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [chartRef, inView]    = useInViewport();

  useEffect(() => {
    if (!acctNum) return;
    fetch(`/data/industries/${acctNum}.json`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [acctNum]);

  if (loading) return null;
  if (!data || !data.by_industry?.length) return null;

  const topRows = data.by_industry.slice(0, 12);
  const topTotal = topRows.reduce((s, r) => s + r.total, 0);

  return (
    <div>
      <div style={{
        fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.1em', marginBottom: '0.75rem',
      }}>
        Donors by Industry (Hard Money)
      </div>

      {/* Bar chart */}
      <div ref={chartRef} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.75rem' }}>
        {topRows.map((row, index) => {
          const pct = total > 0 ? (row.total / total) * 100 : 0;
          const color = INDUSTRY_COLORS[row.industry] || '#666688';
          const delay = `${index * 0.04}s`;
          return (
            <div key={row.industry} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Link href={`/industry/${slugify(row.industry)}`} style={{
                fontSize: '0.62rem', color: 'var(--text-dim)',
                width: '180px', flexShrink: 0,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                textDecoration: 'none',
              }}>
                {row.industry}
              </Link>
              <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: inView ? `${Math.max(pct, 0.5)}%` : '0%',
                  background: color, borderRadius: '2px',
                  transition: `width 0.6s ease-out ${delay}`,
                }} />
              </div>
              <div style={{
                fontSize: '0.62rem', fontFamily: 'var(--font-mono)',
                color, width: '54px', textAlign: 'right', flexShrink: 0,
              }}>
                {fmt(row.total)}
              </div>
              <div style={{
                fontSize: '0.58rem', color: 'var(--text-dim)',
                width: '36px', textAlign: 'right', flexShrink: 0,
              }}>
                {pct.toFixed(0)}%
              </div>
            </div>
          );
        })}
      </div>

      {topTotal < total && (
        <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          Top {topRows.length} shown · {fmt(total - topTotal)} in remaining categories
        </div>
      )}
    </div>
  );
}
