export default function BackLinks({ links }) {
  return (
    <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '1.5rem' }}>
      {links.map(({ href, label }) => (
        <a key={href} href={href} style={{
          fontSize: '0.68rem', color: 'var(--text-dim)', textDecoration: 'none',
          fontFamily: 'var(--font-mono)',
        }}>
          ← {label}
        </a>
      ))}
    </div>
  );
}
