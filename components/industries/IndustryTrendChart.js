'use client';

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

function fmt(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const val = payload[0].value;
  return (
    <div style={{
      background: '#0d0d22', border: '1px solid #2a3050',
      padding: '0.5rem 0.75rem', fontSize: '0.72rem',
      fontFamily: 'Courier New, monospace',
    }}>
      <div style={{ color: '#5a6a88', marginBottom: '0.25rem' }}>{label} cycle</div>
      <div style={{ color: payload[0].color, fontWeight: 700 }}>{fmt(val)}</div>
    </div>
  );
}

export default function IndustryTrendChart({ industry, trendData, color }) {
  if (!trendData || !trendData.by_year) return null;

  const chartData = trendData.years.map(year => ({
    year,
    total: trendData.by_year[year]?.by_industry?.[industry] || 0,
  }));

  const maxVal = Math.max(...chartData.map(d => d.total), 1);

  function handleBarClick(data) {
    if (data && data.activePayload?.[0]?.payload?.year) {
      window.location.href = `/cycle/${data.activePayload[0].payload.year}`;
    }
  }

  return (
    <div style={{ marginBottom: '2rem' }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: '0.75rem',
        fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em',
        marginBottom: '0.75rem',
      }}>
        <span style={{ color: 'var(--text-dim)' }}>Giving by Election Cycle</span>
        <span style={{ color: 'rgba(90,106,136,0.5)', textTransform: 'none', letterSpacing: 0, fontSize: '0.58rem' }}>
          click a bar to explore that cycle
        </span>
      </div>
      <div className="chart-wrap" style={{ height: '160px', cursor: 'pointer' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} onClick={handleBarClick}>
            <XAxis
              dataKey="year"
              tick={{ fontSize: 10, fill: '#5a6a88', fontFamily: 'Courier New' }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              tickFormatter={v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : v}
              tick={{ fontSize: 9, fill: '#5a6a88', fontFamily: 'Courier New' }}
              axisLine={false} tickLine={false} width={36}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.06)' }} />
            <Bar dataKey="total" radius={[2, 2, 0, 0]}>
              {chartData.map((entry) => (
                <Cell
                  key={entry.year}
                  fill={color}
                  opacity={entry.total === maxVal ? 1 : 0.55}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.35rem' }}>
        Hard money contributions only · Peak cycle highlighted · Click any bar to view that cycle
      </div>
    </div>
  );
}
