/**
 * EntityHeader — shared profile page header.
 *
 * Used across donor, candidate, committee, principal, and lobbyist profiles
 * to render a consistent badge row, entity name (h1), and metadata line.
 *
 * Props:
 *   name        {string}   — entity display name (h1)
 *   typeBadge   {{ label: string, color: string }}
 *                          — primary entity-type badge (e.g. INDIVIDUAL, CORPORATION, CANDIDATE)
 *   badges      {Array<{ label: string, color: string, href?: string }>}
 *                          — additional context badges (STATE CONTRACTOR, LOBBYIST PRINCIPAL, etc.)
 *   meta        {Array<string|null>}
 *                          — metadata items for the subtitle line (location, occupation, etc.)
 *   children    {ReactNode} — optional callout/banner rendered below the name + meta
 */
export default function EntityHeader({ name, typeBadge, badges = [], meta = [], children }) {
  const activeMeta = (meta || []).filter(Boolean);

  return (
    <div style={{ marginBottom: '1.75rem' }}>
      {/* Badge row */}
      <div style={{
        display: 'flex', gap: '0.5rem', alignItems: 'center',
        marginBottom: '0.5rem', flexWrap: 'wrap',
      }}>
        {typeBadge && (
          <span style={{
            fontSize: '0.65rem', padding: '0.15rem 0.5rem',
            border: `1px solid ${typeBadge.color}`, color: typeBadge.color,
            borderRadius: '2px', fontFamily: 'var(--font-mono)',
          }}>
            {typeBadge.label}
          </span>
        )}
        {badges.map((b, i) =>
          b.href ? (
            <a key={i} href={b.href} style={{
              fontSize: '0.65rem', padding: '0.15rem 0.5rem',
              border: `1px solid ${b.color}`, color: b.color,
              borderRadius: '2px', fontFamily: 'var(--font-mono)',
              textDecoration: 'none',
            }}>
              {b.label}
            </a>
          ) : (
            <span key={i} style={{
              fontSize: '0.65rem', padding: '0.15rem 0.5rem',
              border: `1px solid ${b.color}`, color: b.color,
              borderRadius: '2px', fontFamily: 'var(--font-mono)',
            }}>
              {b.label}
            </span>
          )
        )}
      </div>

      {/* Name */}
      <h1 style={{
        fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.75rem, 3vw, 2rem)',
        fontWeight: 400, color: 'var(--text)', marginBottom: '0.4rem', lineHeight: 1.1,
        letterSpacing: '-0.015em',
      }}>
        {name}
      </h1>

      {/* Metadata subtitle line */}
      {activeMeta.length > 0 && (
        <div style={{
          fontSize: '0.72rem', color: 'var(--text-dim)',
          display: 'flex', gap: '1rem', flexWrap: 'wrap',
        }}>
          {activeMeta.map((item, i) => (
            <span key={i}>{item}</span>
          ))}
        </div>
      )}

      {/* Optional callout / banner */}
      {children}
    </div>
  );
}
