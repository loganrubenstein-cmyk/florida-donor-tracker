'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { fmtMoneyCompact } from '@/lib/fmt';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{
      background: '#080818', border: '1px solid rgba(100,140,220,0.28)',
      borderRadius: '3px', padding: '0.6rem 0.85rem', fontSize: '0.72rem',
    }}>
      <div style={{ color: '#ffb060', fontWeight: 600, marginBottom: '0.25rem' }}>
        {label}
      </div>
      <div style={{ color: '#c8d8f0' }}>{fmtMoneyCompact(d.total_amount)}</div>
      <div style={{ color: '#5a6a88', marginTop: '0.15rem' }}>
        {Number(d.num_transactions).toLocaleString()} transactions
      </div>
    </div>
  );
}

export default function IEYearChart({ data }) {
  if (!data?.length) return null;
  const peak = Math.max(...data.map(d => d.total_amount));

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="20%">
        <XAxis
          dataKey="cycle"
          tick={{ fontSize: 9, fill: '#5a6a88', fontFamily: 'Courier New, monospace' }}
          axisLine={{ stroke: 'rgba(100,140,220,0.18)' }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={v => fmtMoneyCompact(v)}
          tick={{ fontSize: 9, fill: '#5a6a88', fontFamily: 'Courier New, monospace' }}
          axisLine={false}
          tickLine={false}
          width={38}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,176,96,0.06)' }} />
        <Bar dataKey="total_amount" radius={[2, 2, 0, 0]}>
          {data.map(d => (
            <Cell
              key={d.cycle}
              fill={d.total_amount === peak ? '#ffb060' : '#5a6a88'}
              fillOpacity={d.total_amount === peak ? 0.85 : 0.5}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
