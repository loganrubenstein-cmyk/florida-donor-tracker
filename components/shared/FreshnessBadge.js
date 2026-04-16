import { PIPELINE_QUARTER } from '@/lib/dataLastUpdated';

export default function FreshnessBadge({ style }) {
  return (
    <span style={{
      display: 'inline-block',
      fontSize: '0.58rem',
      padding: '0.1rem 0.4rem',
      background: 'rgba(77,216,240,0.06)',
      border: '1px solid rgba(77,216,240,0.2)',
      color: 'var(--text-dim)',
      borderRadius: '2px',
      fontFamily: 'var(--font-mono)',
      letterSpacing: '0.04em',
      ...style,
    }}>
      data thru {PIPELINE_QUARTER}
    </span>
  );
}
