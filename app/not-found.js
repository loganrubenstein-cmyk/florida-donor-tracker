export default function NotFound() {
  return (
    <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
      <h1 style={{ fontFamily: 'var(--font-mono)', color: 'var(--orange)', fontSize: '3rem' }}>404</h1>
      <p style={{ color: 'var(--text-dim)', marginTop: '1rem' }}>Page not found.</p>
      <a href="/" style={{ color: 'var(--teal)', marginTop: '1.5rem', display: 'inline-block' }}>← Home</a>
    </div>
  );
}
