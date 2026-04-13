import './globals.css';
import Link from 'next/link';

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

const NAV_LINKS = [
  { href: '/candidates',    label: 'Candidates' },
  { href: '/committees',    label: 'Committees' },
  { href: '/donors',        label: 'Donors' },
  { href: '/explorer',      label: 'Explorer' },
  { href: '/lobbying',      label: 'Lobbying' },
  { href: '/legislature',   label: 'Legislature' },
  { href: '/elections',     label: 'Elections' },
  { href: '/network',       label: 'Network' },
  { href: '/tools',         label: 'Tools' },
  { href: '/research',      label: 'Research' },
  { href: '/data',          label: 'Data' },
];

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
            color: 'var(--orange)', textDecoration: 'none',
            fontWeight: 'bold', letterSpacing: '0.05em',
            marginRight: '0.75rem', whiteSpace: 'nowrap',
          }}>
            FL DONOR TRACKER
          </Link>
          {NAV_LINKS.map(({ href, label }) => (
            <Link key={href} href={href} style={{
              color: 'var(--text-dim)', textDecoration: 'none',
              fontSize: '0.82rem', whiteSpace: 'nowrap',
              padding: '0.25rem 0',
            }}>
              {label}
            </Link>
          ))}
          <form action="/explorer" method="get" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
            <input
              name="q"
              type="search"
              placeholder="Search transactions…"
              style={{
                background: 'rgba(8,8,24,0.8)',
                border: '1px solid rgba(100,140,220,0.2)',
                color: 'var(--text)',
                padding: '0.25rem 0.6rem',
                fontSize: '0.75rem',
                borderRadius: '3px',
                fontFamily: 'var(--font-mono)',
                width: '180px',
                outline: 'none',
              }}
            />
          </form>
        </nav>
        {children}
        <footer className="site-footer">
          <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.5rem' }}>
            <span>Data source: <a href="https://dos.elections.myflorida.com/campaign-finance/" target="_blank" rel="noopener noreferrer">Florida Division of Elections</a></span>
            <span>
              <Link href="/methodology">Methodology</Link>
              {' · '}
              <Link href="/data">Data dictionary</Link>
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
