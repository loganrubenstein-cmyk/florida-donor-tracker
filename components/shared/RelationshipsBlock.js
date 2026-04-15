/**
 * RelationshipsBlock — shared component for cross-entity relationship lists.
 *
 * Renders a labelled list of linked entities (lobbyist principals, candidate PACs,
 * connected committees, state contracts, etc.) with an empty-state message when none found.
 *
 * Props:
 *   label       {string}       — section label (uppercase, small caps)
 *   description {string}       — one-line context shown above the list
 *   items       {Array<{
 *     href?:     string,        — link URL (optional; renders plain span if absent)
 *     name:      string,        — primary display name
 *     sub?:      string,        — secondary metadata (date, amount, count)
 *     badge?:    string,        — small badge text (e.g., "91% match", "CCE")
 *     badgeColor?: string,      — badge color (defaults to var(--text-dim))
 *     accentColor?: string,     — link/name color override (defaults to var(--teal))
 *   }>}
 *   emptyText   {string}       — shown when items is empty
 *   maxItems    {number}       — truncate list to this many items (default: no limit)
 *   moreHref    {string}       — "view all" link shown when items exceed maxItems
 *   moreLabel   {string}       — label for the "view all" link (default: "View all →")
 */
export default function RelationshipsBlock({
  label,
  description,
  items = [],
  emptyText = 'No related entities found.',
  maxItems,
  moreHref,
  moreLabel = 'View all →',
}) {
  const visible = maxItems ? items.slice(0, maxItems) : items;
  const overflow = maxItems && items.length > maxItems;

  return (
    <div>
      {label && (
        <div style={{
          fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
          letterSpacing: '0.1em', marginBottom: '0.6rem',
        }}>
          {label}
        </div>
      )}

      {items.length === 0 ? (
        <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem', margin: 0 }}>
          {emptyText}
        </p>
      ) : (
        <div style={{
          background: 'rgba(100,140,220,0.04)', border: '1px solid var(--border)',
          borderRadius: '4px', padding: '0.75rem 1rem',
        }}>
          {description && (
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
              {description}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {visible.map((item, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.45rem 0',
                borderBottom: i < visible.length - 1 ? '1px solid rgba(100,140,220,0.08)' : 'none',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', flex: 1, minWidth: 0 }}>
                  {item.href ? (
                    <a href={item.href} style={{
                      color: item.accentColor || 'var(--teal)', fontSize: '0.78rem',
                      textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {item.name}
                    </a>
                  ) : (
                    <span style={{ color: item.accentColor || 'var(--text)', fontSize: '0.78rem' }}>
                      {item.name}
                    </span>
                  )}
                  {item.sub && (
                    <span style={{ fontSize: '0.63rem', color: 'var(--text-dim)' }}>{item.sub}</span>
                  )}
                </div>
                {item.badge && (
                  <span style={{
                    fontSize: '0.62rem', color: item.badgeColor || 'var(--text-dim)',
                    fontFamily: 'var(--font-mono)', marginLeft: '0.75rem', whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}>
                    {item.badge}
                  </span>
                )}
              </div>
            ))}
          </div>
          {overflow && moreHref && (
            <a href={moreHref} style={{
              display: 'block', marginTop: '0.5rem', fontSize: '0.68rem',
              color: 'var(--teal)', textDecoration: 'none',
            }}>
              {moreLabel} ({items.length - maxItems} more)
            </a>
          )}
        </div>
      )}
    </div>
  );
}
