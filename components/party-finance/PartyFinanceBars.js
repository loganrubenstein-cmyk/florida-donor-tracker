'use client';

import { fmtMoneyCompact } from '@/lib/fmt';
import useInViewport from '@/lib/useInViewport';

export default function PartyFinanceBars({ yearData, maxYearTotal }) {
  const [ref, inView] = useInViewport();

  return (
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {yearData.filter(y => y.year >= 2012).map((y, i) => {
        const repW = (y.rep / maxYearTotal * 100).toFixed(1);
        const demW = (y.dem / maxYearTotal * 100).toFixed(1);
        return (
          <div key={y.year} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '36px', fontSize: '0.72rem', color: 'var(--text-dim)', textAlign: 'right', flexShrink: 0 }}>
              {y.year}
            </div>
            <div style={{ flex: 1, display: 'flex', gap: '2px', height: '20px', alignItems: 'stretch' }}>
              <div
                style={{
                  width: inView ? `${repW}%` : '0%',
                  background: 'var(--republican)',
                  borderRadius: '2px 0 0 2px',
                  minWidth: y.rep > 0 && inView ? '2px' : '0',
                  transition: `width 0.7s ease-out ${i * 0.05}s`,
                }}
                title={`R: ${fmtMoneyCompact(y.rep)}`}
              />
              <div
                style={{
                  width: inView ? `${demW}%` : '0%',
                  background: 'var(--democrat)',
                  borderRadius: '0 2px 2px 0',
                  minWidth: y.dem > 0 && inView ? '2px' : '0',
                  transition: `width 0.7s ease-out ${i * 0.05 + 0.05}s`,
                }}
                title={`D: ${fmtMoneyCompact(y.dem)}`}
              />
            </div>
            <div style={{ width: '56px', fontSize: '0.7rem', color: 'var(--republican)', textAlign: 'right', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
              {fmtMoneyCompact(y.rep)}
            </div>
            <div style={{ width: '56px', fontSize: '0.7rem', color: 'var(--democrat)', textAlign: 'right', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
              {fmtMoneyCompact(y.dem)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
