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
          <Link href="/donors" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.85rem' }}>
            Donors
          </Link>
          <Link href="/lobbyists" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.85rem' }}>
            Lobbyists
          </Link>
          <Link href="/network" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.85rem' }}>
            Network
          </Link>
          <Link href="/committee/4700" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.85rem' }}>
            Committees
          </Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
