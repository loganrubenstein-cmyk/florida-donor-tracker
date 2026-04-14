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
  const { amount } = payload[0].payload;
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      padding: '0.6rem 0.9rem', fontSize: '0.72rem',
      fontFamily: 'var(--font-mono)',
    }}>
      <div style={{ color: 'var(--text)', marginBottom: '0.2rem' }}>{label}</div>
      <div style={{ color: 'var(--orange)' }}>${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
    </div>
  );
}

export default function QuarterlyChart({ data }) {
  if (!data || data.length === 0) return null;

  return (
    <div className="chart-wrap" role="img" aria-label="Quarterly fundraising bar chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="quarter"
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
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,176,96,0.06)' }} />
          <Bar dataKey="amount" fill="#ffb060" radius={[2, 2, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
