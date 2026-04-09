import './globals.css';
import Link from 'next/link';

export const metadata = {
  title: 'Florida Donor Tracker',
  description: 'Follow the money in Florida politics',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <nav style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '1rem 2rem',
          padding: '0.75rem 1.5rem',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(8,8,24,0.95)',
          position: 'sticky', top: 0, zIndex: 100,
        }}>
          <Link href="/" style={{ color: 'var(--orange)', textDecoration: 'none', fontWeight: 'bold', letterSpacing: '0.05em' }}>
            FL DONOR TRACKER
          </Link>
          <Link href="/candidates" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.85rem' }}>
            Candidates
          </Link>
          <Link href="/cycles" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.85rem' }}>
            Cycles
          </Link>
          <Link href="/industries" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.85rem' }}>
            Industries
          </Link>
          <Link href="/donors" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.85rem' }}>
            Donors
          </Link>
          <Link href="/lobbyists" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.85rem' }}>
            Lobbyists
          </Link>
          <Link href="/principals" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.85rem' }}>
            Principals
          </Link>
          <Link href="/solicitations" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.85rem' }}>
            Solicitations
          </Link>
          <Link href="/connections" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.85rem' }}>
            Connections
          </Link>
          <Link href="/flow" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.85rem' }}>
            Flow
          </Link>
          <Link href="/investigations" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.85rem' }}>
            Investigations
          </Link>
          <Link href="/network" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.85rem' }}>
            Network
          </Link>
          <Link href="/committees" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.85rem' }}>
            Committees
          </Link>
          <Link href="/search" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.85rem', marginLeft: 'auto' }}>
            Search
          </Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
