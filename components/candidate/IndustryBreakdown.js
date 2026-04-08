'use client';

import { useState, useEffect } from 'react';

function fmt(n) {
  if (!n || n === 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

// Consistent color per industry bucket
const INDUSTRY_COLORS = {
  'Legal':                      '#4dd8f0',
  'Real Estate':                '#f0a04d',
  'Healthcare':                 '#7dd87d',
  'Finance & Insurance':        '#a04df0',
  'Political / Lobbying':       '#f04d4d',
  'Agriculture':                '#d8c84d',
  'Construction':               '#d8884d',
  'Education':                  '#4d88f0',
  'Technology / Engineering':   '#4df0d8',
  'Retail & Hospitality':       '#d84d88',
  'Business & Consulting':      '#8888cc',
  'Government & Public Service':'#88cc88',
  'Retired':                    '#aaaaaa',
  'Not Employed':               '#666688',
  'Other':                      '#444466',
};

export default function IndustryBreakdown({ acctNum, total }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.75rem' }}>
        {topRows.map(row => {
          const pct = total > 0 ? (row.total / total) * 100 : 0;
          const color = INDUSTRY_COLORS[row.industry] || '#666688';
          return (
            <div key={row.industry} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{
                fontSize: '0.62rem', color: 'var(--text-dim)',
                width: '180px', flexShrink: 0,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {row.industry}
              </div>
              <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${Math.max(pct, 0.5)}%`,
                  background: color, borderRadius: '2px',
                  transition: 'width 0.3s ease',
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
