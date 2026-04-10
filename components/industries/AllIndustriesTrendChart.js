'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

function fmtM(n) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const INDUSTRY_COLORS = {
  'Legal':                       '#4dd8f0',
  'Real Estate':                 '#f0a04d',
  'Healthcare':                  '#7dd87d',
  'Finance & Insurance':         '#a04df0',
  'Political / Lobbying':        '#f04d4d',
  'Agriculture':                 '#d8c84d',
  'Construction':                '#d8884d',
  'Education':                   '#4d88f0',
  'Technology / Engineering':    '#4df0d8',
  'Retail & Hospitality':        '#d84d88',
  'Business & Consulting':       '#8888cc',
  'Government & Public Service': '#88cc88',
  'Retired':                     '#aaaaaa',
  'Not Employed':                '#888899',
  'Other':                       '#555570',
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  const sorted = [...payload].sort((a, b) => b.value - a.value);
  return (
    <div style={{
      background: '#0d0d22', border: '1px solid #2a3050',
      padding: '0.6rem 0.85rem', fontSize: '0.68rem',
      fontFamily: 'Courier New, monospace', minWidth: '180px',
    }}>
      <div style={{ color: '#5a6a88', marginBottom: '0.4rem', fontWeight: 600 }}>{label} cycle — {fmtM(total)}</div>
      {sorted.filter(p => p.value > 0).slice(0, 6).map(p => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.15rem' }}>
          <span style={{ color: p.fill }}>{p.name}</span>
          <span style={{ color: '#c8d8f0' }}>{fmtM(p.value)}</span>
        </div>
      ))}
      {sorted.filter(p => p.value > 0).length > 6 && (
        <div style={{ color: '#5a6a88', marginTop: '0.2rem', fontSize: '0.62rem' }}>+ {sorted.filter(p => p.value > 0).length - 6} more</div>
      )}
    </div>
  );
}

export default function AllIndustriesTrendChart({ trendData, industries }) {
  if (!trendData?.by_year || !trendData?.years) return null;

  const chartData = trendData.years.map(year => {
    const yearData = trendData.by_year[year] || {};
    const entry = { year };
    for (const ind of industries) {
      entry[ind] = yearData.by_industry?.[ind] || 0;
    }
    return entry;
  });

  // Sort industries by cumulative total for stack order (largest at bottom)
  const sorted = [...industries].sort((a, b) => {
    const ta = chartData.reduce((s, d) => s + (d[a] || 0), 0);
    const tb = chartData.reduce((s, d) => s + (d[b] || 0), 0);
    return tb - ta;
  });

  function handleBarClick(data) {
    if (data?.activeLabel) {
      window.location.href = `/cycle/${data.activeLabel}`;
    }
  }

  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <div style={{
        fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em',
        color: 'var(--text-dim)', marginBottom: '0.75rem', display: 'flex', gap: '0.75rem', alignItems: 'baseline',
      }}>
        <span>Giving by Election Cycle</span>
        <span style={{ color: 'rgba(90,106,136,0.5)', textTransform: 'none', letterSpacing: 0, fontSize: '0.58rem' }}>
          stacked by industry · click a bar to explore that cycle
        </span>
      </div>
      <div style={{ height: '220px', cursor: 'pointer' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} onClick={handleBarClick}>
            <XAxis
              dataKey="year"
              tick={{ fontSize: 10, fill: '#5a6a88', fontFamily: 'Courier New' }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              tickFormatter={v => v >= 1_000_000_000 ? `${(v / 1_000_000_000).toFixed(1)}B` : v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : `${(v / 1_000).toFixed(0)}K`}
              tick={{ fontSize: 9, fill: '#5a6a88', fontFamily: 'Courier New' }}
              axisLine={false} tickLine={false} width={36}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            {sorted.map(ind => (
              <Bar key={ind} dataKey={ind} stackId="a" fill={INDUSTRY_COLORS[ind] || '#444466'} radius={ind === sorted[0] ? [2, 2, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.35rem' }}>
        Hard money contributions only · Even years = election cycles · Click any bar to explore
      </div>
    </div>
  );
}
