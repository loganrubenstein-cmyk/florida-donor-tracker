'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { fmtMoneyCompact, fmtMoney } from '@/lib/fmt';

const TABS = [
  { key: 'cities',      label: 'Top FL Cities' },
  { key: 'states',      label: 'By State' },
  { key: 'instateout',  label: 'In-State vs. Out' },
];

function CustomTooltip({ active, payload, label, labelKey }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      padding: '0.6rem 0.85rem', borderRadius: '3px', fontSize: '0.76rem',
    }}>
      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ color: 'var(--orange)' }}>{fmtMoney(payload[0].value)}</div>
      {payload[0].payload.donor_count != null && (
        <div style={{ color: 'var(--text-dim)', fontSize: '0.68rem', marginTop: '0.15rem' }}>
          {payload[0].payload.donor_count.toLocaleString()} donors
        </div>
      )}
    </div>
  );
}

function CityChart({ items }) {
  const top = items.slice(0, 20);
  const max = Math.max(...top.map(i => i.total));
  return (
    <div>
      <div style={{ height: 500 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={top} layout="vertical" margin={{ left: 20, right: 40, top: 16, bottom: 8 }}>
            <XAxis type="number" tickFormatter={v => fmtMoneyCompact(v)} tick={{ fontSize: 10, fill: '#5a6a88', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="city" width={120} interval={0} tick={{ fontSize: 10, fill: '#5a6a88', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(100,140,220,0.06)' }} />
            <Bar dataKey="total" radius={[0, 2, 2, 0]}>
              {top.map((entry, i) => (
                <Cell key={i} fill={i === 0 ? '#ffb060' : i < 5 ? '#4dd8f0' : 'rgba(100,140,220,0.45)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.5rem', lineHeight: 1.5 }}>
        Top 20 cities by tracked political contributions. Tallahassee leads because lobbyists, political consultants, and government-affiliated donors are disproportionately concentrated in the capital.
      </p>
    </div>
  );
}

function StateChart({ items }) {
  return (
    <div>
      <div style={{ height: 380 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={items} layout="vertical" margin={{ left: 8, right: 40, top: 16, bottom: 8 }}>
            <XAxis type="number" tickFormatter={v => fmtMoneyCompact(v)} tick={{ fontSize: 10, fill: '#5a6a88', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="state" width={36} interval={0} tick={{ fontSize: 10, fill: '#5a6a88', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(100,140,220,0.06)' }} />
            <Bar dataKey="total" radius={[0, 2, 2, 0]}>
              {items.map((entry, i) => (
                <Cell key={i} fill={entry.state === 'FL' ? '#ffb060' : entry.state === 'DC' ? '#ffd060' : 'rgba(100,140,220,0.45)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function InOutView({ data }) {
  const total = data.in_state + data.out_state;
  const inPct = data.in_state_pct;
  const outPct = data.out_state_pct;
  return (
    <div style={{ maxWidth: '560px' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{
          height: '32px',
          borderRadius: '3px',
          overflow: 'hidden',
          display: 'flex',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
        }}>
          <div style={{ width: `${inPct}%`, background: 'var(--orange)', transition: 'width 0.6s ease' }} />
          <div style={{ flex: 1, background: 'rgba(160,192,255,0.3)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.72rem' }}>
          <span style={{ color: 'var(--orange)' }}>Florida ({inPct}%) — {fmtMoneyCompact(data.in_state)}</span>
          <span style={{ color: 'var(--blue)' }}>Out of state ({outPct}%) — {fmtMoneyCompact(data.out_state)}</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {[
          { label: 'FL donors', value: data.in_count?.toLocaleString(), sub: 'reported Florida address', color: 'var(--orange)' },
          { label: 'Out-of-state donors', value: data.out_count?.toLocaleString(), sub: 'reported non-FL address', color: 'var(--blue)' },
          { label: 'FL donor total', value: fmtMoneyCompact(data.in_state), sub: `${inPct}% of tracked giving`, color: 'var(--orange)' },
          { label: 'Out-of-state total', value: fmtMoneyCompact(data.out_state), sub: `${outPct}% of tracked giving`, color: 'var(--blue)' },
        ].map(stat => (
          <div key={stat.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.85rem 1rem' }}>
            <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>{stat.label}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 400, color: stat.color, fontFamily: 'var(--font-serif)', fontVariantNumeric: 'tabular-nums' }}>{stat.value}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>{stat.sub}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '1rem', lineHeight: 1.5 }}>
        Out-of-state donors include national party committees (DNC, RNC), federal PACs, and wealthy individuals whose primary residence is outside Florida. Location is based on the donor's registered address at time of contribution.
      </p>
    </div>
  );
}

export default function DonationMap() {
  const [tab, setTab] = useState('cities');
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(false);

  async function loadTab(t) {
    if (cache[t]) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/map?view=${t}`);
      const json = await res.json();
      setCache(prev => ({ ...prev, [t]: json }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTab('cities'); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function switchTab(t) {
    setTab(t);
    loadTab(t);
  }

  const current = cache[tab];

  return (
    <div>
      <div className="tab-bar" style={{ marginBottom: '1.5rem' }}>
        {TABS.map(t => (
          <button key={t.key} className={tab === t.key ? 'tab tab-active' : 'tab'} onClick={() => switchTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: 'var(--text-dim)', fontSize: '0.78rem' }}>Loading…</p>}
      {!loading && current && tab === 'cities' && <CityChart items={current.items || []} />}
      {!loading && current && tab === 'states' && <StateChart items={current.items || []} />}
      {!loading && current && tab === 'instateout' && <InOutView data={current} />}
    </div>
  );
}
