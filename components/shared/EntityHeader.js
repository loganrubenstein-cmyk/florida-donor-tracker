export default function EntityHeader({ name, typeBadge, badges = [], meta = [], children }) {
  const activeMeta = (meta || []).filter(Boolean);
  const accentColor = typeBadge?.color || 'var(--orange)';

  return (
    <div style={{
      position: 'relative',
      padding: '1.6rem 1.75rem 1.6rem 1.75rem',
      background: 'linear-gradient(110deg, rgba(10,10,28,0.98) 0%, rgba(1,1,13,0.65) 100%)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${accentColor}`,
      borderRadius: '0 4px 4px 0',
      marginBottom: '1rem',
      overflow: 'hidden',
    }}>
      {/* Ambient glow from left edge */}
      <div style={{
        position: 'absolute',
        top: '-30px', left: '-30px',
        width: '240px', height: '180px',
        borderRadius: '50%',
        background: accentColor,
        opacity: 0.05,
        filter: 'blur(36px)',
        pointerEvents: 'none',
      }} />

      {/* Badge row */}
      <div style={{
        display: 'flex', gap: '0.4rem', alignItems: 'center',
        marginBottom: '0.65rem', flexWrap: 'wrap',
      }}>
        {typeBadge && (
          <span style={{
            fontSize: '0.58rem', padding: '0.18rem 0.55rem',
            border: `1px solid ${typeBadge.color}`,
            color: typeBadge.color,
            borderRadius: '2px', fontFamily: 'var(--font-mono)',
            letterSpacing: '0.1em',
          }}>
            {typeBadge.label}
          </span>
        )}
        {badges.map((b, i) =>
          b.href ? (
            <a key={i} href={b.href} style={{
              fontSize: '0.58rem', padding: '0.18rem 0.55rem',
              border: `1px solid ${b.color}`, color: b.color,
              borderRadius: '2px', fontFamily: 'var(--font-mono)',
              letterSpacing: '0.1em', textDecoration: 'none',
            }}>
              {b.label}
            </a>
          ) : (
            <span key={i} style={{
              fontSize: '0.58rem', padding: '0.18rem 0.55rem',
              border: `1px solid ${b.color}`, color: b.color,
              borderRadius: '2px', fontFamily: 'var(--font-mono)',
              letterSpacing: '0.1em',
            }}>
              {b.label}
            </span>
          )
        )}
      </div>

      {/* Name */}
      <h1 style={{
        fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.9rem, 3vw, 2.5rem)',
        fontWeight: 400, color: 'var(--text)', marginBottom: '0.7rem', lineHeight: 1.08,
        letterSpacing: '-0.015em',
      }}>
        {name}
      </h1>

      {/* Metadata subtitle line with pipe separators */}
      {activeMeta.length > 0 && (
        <div style={{
          fontSize: '0.72rem', color: 'var(--text-dim)',
          display: 'flex', alignItems: 'center', gap: '0', flexWrap: 'wrap',
          marginBottom: children ? '1rem' : '0',
        }}>
          {activeMeta.map((item, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center' }}>
              {item}
              {i < activeMeta.length - 1 && (
                <span style={{
                  margin: '0 0.85rem',
                  width: '1px', height: '12px',
                  background: 'rgba(100,140,220,0.2)',
                  display: 'inline-block', flexShrink: 0,
                  verticalAlign: 'middle',
                }} />
              )}
            </span>
          ))}
        </div>
      )}

      {/* Optional callout / banner / action row */}
      {children}
    </div>
  );
}
