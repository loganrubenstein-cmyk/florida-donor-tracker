export default function InsightStrip({ insights }) {
  if (!insights || insights.length === 0) return null;

  const cells = insights.slice(0, 4);
  // Pad to 4 cells so the grid always fills the full width
  while (cells.length < 4) cells.push(null);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
      border: '1px solid var(--border)',
      borderRadius: '3px',
      overflow: 'hidden',
      marginBottom: '1.25rem',
    }}>
      {cells.map((pill, i) => (
        <div key={i} style={{
          background: 'var(--surface)',
          borderRight: i < cells.length - 1 ? '1px solid var(--border)' : 'none',
          padding: '0.5rem 0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          fontSize: '0.69rem',
          fontFamily: 'var(--font-mono)',
          minWidth: 0,
          opacity: pill ? 1 : 0.25,
        }}>
          <div style={{
            width: '6px', height: '6px',
            borderRadius: '50%',
            background: pill?.color || 'var(--text-dim)',
            flexShrink: 0,
          }} />
          <span style={{
            color: 'var(--text-dim)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {pill ? pill.text : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}
