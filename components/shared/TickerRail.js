import Link from 'next/link';

const ITEMS = [
  { live: true,  text: '$3.9B TRACKED' },
  { text: 'UPDATED APR 14 2026' },
  { text: '22M CONTRIBUTIONS' },
  { text: '883K DONORS' },
  { text: '431 SHADOW PACS' },
  { text: '160 LEGISLATORS' },
  { live: true,  text: '2026 CYCLE OPEN' },
];

export default function TickerRail() {
  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
      background: 'rgba(255,176,96,0.02)',
      padding: '7px 24px',
      display: 'flex',
      gap: '28px',
      overflowX: 'auto',
      fontFamily: 'var(--font-mono)',
      fontSize: '0.6rem',
      letterSpacing: '0.16em',
      scrollbarWidth: 'none',
    }}>
      {ITEMS.map((item, i) => (
        <span key={i} style={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          whiteSpace: 'nowrap',
          color: item.live ? 'var(--green)' : 'var(--text-dim)',
        }}>
          {item.live && (
            <span style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: 'var(--green)',
              boxShadow: '0 0 4px var(--green)',
              flexShrink: 0,
            }} />
          )}
          {item.text}
        </span>
      ))}
    </div>
  );
}
