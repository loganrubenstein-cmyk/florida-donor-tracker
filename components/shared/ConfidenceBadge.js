export default function ConfidenceBadge({ tier, score, size = 'sm' }) {
  const hasScore = score != null && !Number.isNaN(Number(score));
  const num = hasScore ? Number(score) : null;

  let resolved = tier || 'possible';
  if (hasScore) {
    if (num >= 90) resolved = 'strong';
    else if (num >= 75) resolved = 'likely';
    else resolved = 'possible';
  }

  const label =
    resolved === 'strong' ? 'High'
    : resolved === 'likely' ? 'Medium'
    : 'Low';

  const color =
    resolved === 'strong' ? 'var(--green)'
    : resolved === 'likely' ? 'var(--teal)'
    : 'var(--text-dim)';

  const fontSize = size === 'xs' ? '0.58rem' : '0.65rem';
  const padY = size === 'xs' ? '0.1rem' : '0.15rem';

  return (
    <span
      title={hasScore ? `Confidence score ${num.toFixed(0)}%` : `Confidence: ${label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        fontSize,
        fontFamily: 'var(--font-mono)',
        color,
        padding: `${padY} 0.4rem`,
        border: `1px solid ${color}`,
        borderRadius: '3px',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        background: 'transparent',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{
        width: '0.4rem', height: '0.4rem', borderRadius: '50%', background: color,
      }} />
      {hasScore ? `${label} (${num.toFixed(0)}%)` : label}
    </span>
  );
}
