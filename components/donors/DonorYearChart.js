'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

function fmtAxis(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function fmtTip(n) {
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#0d0d22', border: '1px solid var(--border)',
      padding: '0.5rem 0.75rem', fontSize: '0.72rem', fontFamily: 'var(--font-mono)',
    }}>
      <div style={{ color: 'var(--text)', marginBottom: '0.3rem' }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {fmtTip(p.value)}
        </div>
      ))}
    </div>
  );
};

export default function DonorYearChart({ data }) {
  const hasSoft = data.some(d => d.soft > 0);
  const hasHard = data.some(d => d.hard > 0);
  const hasBoth = hasSoft && hasHard;

  return (
    <div className="chart-wrap" role="img" aria-label="Contributions by year">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="year"
            tick={{ fill: 'var(--text-dim)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            tickFormatter={fmtAxis}
            tick={{ fill: 'var(--text-dim)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={false} tickLine={false} width={52}
          />
          <Tooltip content={<CustomTooltip />} />
          {hasBoth && <Legend wrapperStyle={{ fontSize: '0.65rem', color: 'var(--text-dim)' }} />}
          {hasSoft && (
            <Bar dataKey="soft" name="PAC/Soft" stackId="a" fill="#4dd8f0" radius={hasBoth ? [0,0,0,0] : [2,2,0,0]} />
          )}
          {hasHard && (
            <Bar dataKey="hard" name="Direct/Hard" stackId="a" fill="#a0c0ff" radius={[2,2,0,0]} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
