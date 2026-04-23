'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { slugify } from '@/lib/slugify';

function fmt(n) {
  if (n == null) return '$0';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function IndustryRanking({ industriesAll, trendData, colors }) {
  const years = trendData?.years || [];
  const [year, setYear] = useState('all');

  const rows = useMemo(() => {
    if (year === 'all') {
      return [...industriesAll]
        .map(i => ({ industry: i.industry, total: i.total, pct: i.pct }))
        .sort((a, b) => b.total - a.total);
    }
    const yearTotals = trendData?.by_year?.[year]?.by_industry || {};
    const yearTotal = trendData?.by_year?.[year]?.total || 0;
    const list = Object.entries(yearTotals).map(([industry, total]) => ({
      industry,
      total,
      pct: yearTotal > 0 ? (total / yearTotal) * 100 : 0,
    }));
    return list.sort((a, b) => b.total - a.total);
  }, [year, industriesAll, trendData]);

  const maxTotal = rows[0]?.total || 1;
  const currentYearTotal = year === 'all'
    ? rows.reduce((s, r) => s + r.total, 0)
    : (trendData?.by_year?.[year]?.total || 0);

  return (
    <div>
      {/* Year selector */}
      {years.length > 0 && (
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: '0.3rem' }}>
            Year
          </span>
          {['all', ...years].map((y) => {
            const active = y === year;
            return (
              <button key={y} onClick={() => setYear(y)}
                style={{
                  padding: '0.22rem 0.6rem', fontSize: '0.68rem', fontFamily: 'var(--font-mono)',
                  background: active ? 'rgba(160,192,255,0.14)' : 'transparent',
                  color: active ? 'var(--blue)' : 'var(--text-dim)',
                  border: `1px solid ${active ? 'rgba(160,192,255,0.4)' : 'var(--border)'}`,
                  borderRadius: '3px', cursor: 'pointer',
                  fontWeight: active ? 600 : 400,
                }}>
                {y === 'all' ? 'All years' : y}
              </button>
            );
          })}
          <span style={{ fontSize: '0.66rem', color: 'var(--text-dim)', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>
            {fmt(currentYearTotal)} total
          </span>
        </div>
      )}

      {/* Labeled horizontal bars */}
      <div style={{
        border: '1px solid var(--border)', borderRadius: '3px',
        overflow: 'hidden',
      }}>
        {rows.map((ind, i) => {
          const widthPct = Math.max((ind.total / maxTotal) * 100, 2);
          const color = colors[ind.industry] || '#444466';
          return (
            <Link
              key={ind.industry}
              href={`/industry/${slugify(ind.industry)}`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(160px, 1.1fr) 2.5fr auto',
                alignItems: 'center',
                gap: '0.9rem',
                padding: '0.65rem 0.9rem',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                textDecoration: 'none',
                color: 'var(--text)',
                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                transition: 'background 0.12s',
              }}
            >
              <div style={{
                fontSize: '0.78rem', color: 'var(--text)', fontFamily: 'var(--font-mono)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                <span style={{ color: 'var(--text-dim)', marginRight: '0.5rem' }}>{i + 1}.</span>
                {ind.industry}
              </div>
              <div style={{ position: 'relative', height: '14px', background: 'rgba(255,255,255,0.04)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, bottom: 0,
                  width: `${widthPct}%`,
                  background: color, opacity: 0.85,
                  borderRadius: '2px',
                  transition: 'width 0.25s ease',
                }} />
              </div>
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                <span style={{ color: 'var(--orange)' }}>{fmt(ind.total)}</span>
                <span style={{ color: 'var(--text-dim)', marginLeft: '0.55rem', fontSize: '0.7rem' }}>{(ind.pct || 0).toFixed(1)}%</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
