import './globals.css';
import Link from 'next/link';
import FloridaOutline from '@/components/shared/FloridaOutline';
import NavLinks from '@/components/shared/NavLinks';
import KonamiCode from '@/components/shared/KonamiCode';
import TickerRail from '@/components/shared/TickerRail';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/next';

export const metadata = {
  metadataBase: new URL('https://floridainfluence.com'),
  title: {
    default: 'Florida Influence',
    template: '%s | Florida Influence',
  },
  description: 'Follow the money in Florida politics — campaign contributions, donors, committees, lobbyists, and legislative finance tracked from 1996 to present.',
  openGraph: {
    siteName: 'Florida Influence',
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
      <body id="top">
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
            FL INFLUENCE
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
        <TickerRail />
        {children}
        <KonamiCode />
        <SpeedInsights />
        <Analytics />
        <footer style={{ borderTop: '1px solid var(--border)', background: 'rgba(8,8,24,0.6)', padding: '2.5rem 1.5rem 1.75rem', marginTop: '4rem' }}>
          <div className="footer-grid" style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.9rem' }}>
                <FloridaOutline size="wordmark" style={{ width: '42px', height: '35px', opacity: 0.9 }} />
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text)', letterSpacing: '0.22em', fontWeight: 700 }}>FLORIDA INFLUENCE</div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: '0.8rem', color: 'var(--text-dim)', fontStyle: 'italic', marginTop: '0.1rem' }}>Florida: a sunny place for shady people.</div>
                </div>
              </div>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.7, maxWidth: '340px', marginBottom: '0.9rem' }}>
                Built and maintained independently. Free. No ads. No login. The data is public — we just made it legible.
              </p>
              <div style={{ display: 'inline-block', fontFamily: 'var(--font-mono)', color: 'var(--orange)', letterSpacing: '0.22em', textTransform: 'uppercase', lineHeight: 1.8 }}>
                <div style={{ fontSize: '0.6rem' }}>EST. 2026</div>
                <div style={{ height: '1px', background: 'rgba(255,176,96,0.35)', margin: '3px 0' }} />
                <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)' }}>BASED IN TALLAHASSEE, FL</div>
              </div>
            </div>

            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-dim)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>DATA</div>
              {[
                ['Candidates',  '/candidates'],
                ['Committees',  '/committees'],
                ['Donors',      '/donors'],
                ['Lobbyists',   '/lobbyists'],
                ['Legislators', '/legislature'],
              ].map(([label, href]) => (
                <Link key={href} href={href} style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)', textDecoration: 'none', marginBottom: '0.4rem' }}>
                  {label}
                </Link>
              ))}
            </div>

            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-dim)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>TOOLS</div>
              {[
                ['Who funds your district', '/who-funds'],
                ['Candidate compare',       '/compare'],
                ['Follow the money',        '/follow'],
                ['Influence index',         '/influence'],
                ['Money flow',              '/flow'],
              ].map(([label, href]) => (
                <Link key={href} href={href} style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)', textDecoration: 'none', marginBottom: '0.4rem' }}>
                  {label}
                </Link>
              ))}
            </div>

            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-dim)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>ABOUT</div>
              {[
                ['About',        '/about'],
                ['Methodology',  '/methodology'],
              ].map(([label, href]) => (
                <Link key={href} href={href} style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)', textDecoration: 'none', marginBottom: '0.4rem' }}>
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <div style={{ maxWidth: '1100px', margin: '2rem auto 0', paddingTop: '1.25rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
            <span>© 2026 · FLORIDA INFLUENCE · PUBLIC RECORD · CC-BY · Data reflects public records as filed.</span>
            <a href="#top" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>↑ BACK TO TOP</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
