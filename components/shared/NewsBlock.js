// components/shared/NewsBlock.js
// Renders a compact "In the News" block for profile pages.
// Accepts an array of article objects from news_entity_articles.

export default function NewsBlock({ articles = [] }) {
  if (!articles || articles.length === 0) return null;

  return (
    <div style={{ marginTop: '2rem' }}>
      <div style={{
        fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.1em', marginBottom: '0.75rem',
      }}>
        In the News
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {articles.map((a, i) => (
          <a
            key={i}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              padding: '0.65rem 0.85rem',
              border: '1px solid var(--border)',
              borderRadius: '3px',
              background: 'var(--surface)',
              transition: 'border-color 0.12s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.2rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text)', fontWeight: 500, lineHeight: 1.3 }}>
                  {a.title}
                </span>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {a.outlet}
                </span>
              </div>
              {a.snippet && (
                <div style={{
                  fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.4,
                  overflow: 'hidden', display: '-webkit-box',
                  WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}>
                  {a.snippet}
                </div>
              )}
              {a.published && (
                <div style={{ fontSize: '0.6rem', color: 'rgba(90,106,136,0.6)', marginTop: '0.2rem' }}>
                  {new Date(a.published).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
