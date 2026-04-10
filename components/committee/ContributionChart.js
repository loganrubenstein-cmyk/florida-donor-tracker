'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

function fmtAxis(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const { total, num_contributions } = payload[0].payload;
  return (
    <div style={{
      background: '#0d0d22', border: '1px solid #2a3a5a',
      padding: '0.6rem 0.9rem', fontSize: '0.72rem',
      fontFamily: 'var(--font-mono)',
    }}>
      <div style={{ color: '#fff', marginBottom: '0.2rem' }}>{label}</div>
      <div style={{ color: '#4dd8f0' }}>${total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
      <div style={{ color: '#5a6a88' }}>{num_contributions.toLocaleString()} contribution{num_contributions !== 1 ? 's' : ''}</div>
    </div>
  );
}

export default function ContributionChart({ data }) {
  if (!data || data.length === 0) return null;

  return (
    <div className="chart-wrap" role="img" aria-label="Contributions over time bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="year"
            tick={{ fontSize: 9, fill: '#5a6a88', fontFamily: 'Courier New' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={fmtAxis}
            tick={{ fontSize: 9, fill: '#5a6a88', fontFamily: 'Courier New' }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(77,216,240,0.06)' }} />
          <Bar dataKey="total" fill="#4dd8f0" radius={[2, 2, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
