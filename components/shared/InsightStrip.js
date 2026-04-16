export default function InsightStrip({ insights }) {
  if (!insights || insights.length === 0) return null;
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '0.35rem',
      padding: '0.65rem 0 0.75rem',
      borderBottom: '1px solid var(--border)',
      marginBottom: '1.25rem',
    }}>
      {insights.map((pill, i) => (
        <span key={i} style={{
          fontSize: '0.68rem',
          fontFamily: 'var(--font-mono)',
          padding: '0.18rem 0.52rem',
          borderRadius: '2px',
          border: `1px solid ${pill.color || 'var(--border)'}55`,
          background: `${pill.color || 'var(--text-dim)'}12`,
          color: pill.color || 'var(--text)',
          whiteSpace: 'nowrap',
          letterSpacing: '0.01em',
        }}>
          {pill.text}
        </span>
      ))}
    </div>
  );
}
