import Link from 'next/link';

export const metadata = {
  title: 'Lobbyists | FL Donor Tracker',
  description: 'Search Florida registered lobbyists and their principals',
};

export default function LobbyistsPage() {
  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/lobbying" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Lobbying</Link>
        {' / '}
        <span>Lobbyists</span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', color: 'var(--text)', marginBottom: '1.5rem' }}>
        Florida Lobbyists
      </h1>

      <div style={{
        padding: '2rem 2.5rem',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        maxWidth: '600px',
      }}>
        <div style={{
          display: 'inline-block',
          fontSize: '0.6rem',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--orange)',
          background: 'rgba(255,176,96,0.1)',
          border: '1px solid rgba(255,176,96,0.3)',
          padding: '0.2rem 0.6rem',
          borderRadius: '3px',
          marginBottom: '1.25rem',
        }}>
          Under Reconstruction
        </div>

        <p style={{ color: 'var(--text)', fontSize: '0.85rem', lineHeight: 1.7, marginBottom: '1rem' }}>
          The lobbyist directory is being rebuilt after a data update. The new version will have
          improved principal cross-references, compensation data, and bill lobbying activity.
        </p>

        <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
          In the meantime, explore the lobbying hub for bills, firms, and principals data.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link href="/lobbying" style={{
            background: 'var(--orange)',
            color: '#01010d',
            padding: '0.45rem 1rem',
            fontSize: '0.7rem',
            fontWeight: 700,
            borderRadius: '3px',
            textDecoration: 'none',
            fontFamily: 'var(--font-sans)',
          }}>
            Lobbying Hub
          </Link>
          <Link href="/principals" style={{
            border: '1px solid var(--border)',
            color: 'var(--text-dim)',
            padding: '0.45rem 1rem',
            fontSize: '0.7rem',
            borderRadius: '3px',
            textDecoration: 'none',
            fontFamily: 'var(--font-mono)',
          }}>
            → Principals
          </Link>
          <Link href="/lobbying/bills" style={{
            border: '1px solid var(--border)',
            color: 'var(--text-dim)',
            padding: '0.45rem 1rem',
            fontSize: '0.7rem',
            borderRadius: '3px',
            textDecoration: 'none',
            fontFamily: 'var(--font-mono)',
          }}>
            → Lobbied Bills
          </Link>
        </div>
      </div>
    </main>
  );
}
