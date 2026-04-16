'use client';
import { fmtMoneyCompact } from '@/lib/fmt';
import Link from 'next/link';

export default function IEForAgainstTable({ rows }) {
  if (!rows || rows.length === 0) {
    return <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', padding: '1rem 0' }}>No for/against data available.</div>;
  }

  const maxTotal = rows[0]?.total || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {rows.map(r => {
        const forPct = r.total > 0 ? (r.for / r.total * 100).toFixed(0) : 0;
        const agtPct = r.total > 0 ? (r.against / r.total * 100).toFixed(0) : 0;
        const barW   = Math.max(4, (r.total / maxTotal) * 100);
        return (
          <div key={r.slug || r.name} style={{ padding: '0.6rem 0.85rem', border: '1px solid rgba(100,140,220,0.1)', borderRadius: '3px', background: 'var(--bg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem' }}>
              {r.slug
                ? <Link href={`/politician/${r.slug}`} style={{ color: 'var(--teal)', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600 }}>{r.name}</Link>
                : <span style={{ color: 'var(--text)', fontSize: '0.8rem', fontWeight: 600 }}>{r.name}</span>
              }
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                {fmtMoneyCompact(r.total)} total
              </span>
            </div>
            <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', width: `${barW}%`, background: 'rgba(100,140,220,0.1)' }}>
              <div style={{ width: `${forPct}%`, background: 'var(--democrat)', transition: 'width 0.3s' }} />
              <div style={{ width: `${agtPct}%`, background: 'var(--republican)', transition: 'width 0.3s' }} />
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.3rem', fontSize: '0.65rem', fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: 'var(--democrat)' }}>▲ {fmtMoneyCompact(r.for)} for</span>
              <span style={{ color: 'var(--republican)' }}>▼ {fmtMoneyCompact(r.against)} against</span>
              <span style={{ color: r.net >= 0 ? 'var(--democrat)' : 'var(--republican)', marginLeft: 'auto' }}>
                net {r.net >= 0 ? '+' : ''}{fmtMoneyCompact(r.net)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
