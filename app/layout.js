import './globals.css';
import Link from 'next/link';
import FloridaOutline from '@/components/shared/FloridaOutline';
import NavLinks from '@/components/shared/NavLinks';
import KonamiCode from '@/components/shared/KonamiCode';

export const metadata = {
  metadataBase: new URL('https://florida-donor-tracker.vercel.app'),
  title: {
    default: 'Florida Donor Tracker',
    template: '%s | Florida Donor Tracker',
  },
  description: 'Follow the money in Florida politics — campaign contributions, donors, committees, lobbyists, and legislative finance tracked from 1996 to 2026.',
  openGraph: {
    siteName: 'Florida Donor Tracker',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <nav style={{
          display: 'flex', alignItems: 'center', gap: '0.25rem 1.5rem',
          padding: '0.75rem 1.5rem',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(8,8,24,0.97)',
          position: 'sticky', top: 0, zIndex: 100,
          flexWrap: 'wrap',
        }}>
          <Link href="/" style={{
            display: 'flex', alignItems: 'center', gap: '0.45rem',
            color: 'var(--orange)', textDecoration: 'none',
            fontWeight: 'bold', letterSpacing: '0.05em', fontSize: '0.88rem',
            marginRight: '0.75rem', whiteSpace: 'nowrap',
          }}>
            <FloridaOutline size="wordmark" />
            FL DONOR TRACKER
          </Link>
          <NavLinks />
          <form action="/search" method="get" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
            <input
              name="q"
              type="search"
              placeholder="Search donors, committees, politicians…"
              style={{
                background: 'rgba(8,8,24,0.8)',
                border: '1px solid rgba(100,140,220,0.2)',
                color: 'var(--text)',
                padding: '0.25rem 0.6rem',
                fontSize: '0.75rem',
                borderRadius: '3px',
                fontFamily: 'var(--font-mono)',
                width: '240px',
                outline: 'none',
                transition: 'border-color 0.15s',
              }}
            />
          </form>
        </nav>
        {children}
        <KonamiCode />
        <footer className="site-footer">
          <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.5rem' }}>
            <span>Data source: <a href="https://dos.elections.myflorida.com/campaign-finance/" target="_blank" rel="noopener noreferrer">Florida Division of Elections</a></span>
            <span>
              <Link href="/methodology">Methodology</Link>
              {' · '}
              <Link href="/data">Sources</Link>
              {' · '}
              <Link href="/coverage">Coverage &amp; limits</Link>
            </span>
            <span style={{ width: '100%', marginTop: '0.25rem', color: 'rgba(90,106,136,0.7)' }}>
              Data reflects public records as filed. Classifications and name deduplication are inferred — not verified by the Division of Elections.
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
