import Link from 'next/link';

const CONFIDENCE_COLORS = {
  direct:     'var(--teal)',
  normalized: 'var(--blue)',
  inferred:   'var(--gold)',
  classified: 'var(--republican)',
};

export default function TrustRibbon({ source, updated, confidence = 'normalized' }) {
  const badgeColor = CONFIDENCE_COLORS[confidence] || 'var(--blue)';
  return (
    <div style={{
      display: 'flex',
      gap: '1.25rem',
      flexWrap: 'wrap',
      alignItems: 'center',
      padding: '0.6rem 0.9rem',
      border: '1px solid var(--border)',
      background: 'rgba(255,255,255,0.015)',
      fontFamily: 'var(--font-mono)',
      fontSize: '0.62rem',
      color: 'var(--text-dim)',
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      borderRadius: '3px',
    }}>
      {source && (
        <span>SOURCE · <span style={{ color: 'var(--text)', fontWeight: 400 }}>{source}</span></span>
      )}
      {updated && (
        <span>UPDATED · <span style={{ color: 'var(--text)' }}>{updated}</span></span>
      )}
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        CONFIDENCE ·{' '}
        <span style={{
          fontSize: '0.58rem',
          letterSpacing: '0.14em',
          color: badgeColor,
          border: `1px solid ${badgeColor}55`,
          padding: '1px 5px',
          borderRadius: '2px',
        }}>
          {confidence.toUpperCase()}
        </span>
      </span>
      <Link href="/methodology" style={{ color: 'var(--teal)', marginLeft: 'auto', textDecoration: 'none', fontSize: '0.6rem' }}>
        methodology ↗
      </Link>
    </div>
  );
}
