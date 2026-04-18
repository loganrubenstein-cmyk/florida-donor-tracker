import dynamic from 'next/dynamic';
import Link from 'next/link';

const DonationMap = dynamic(() => import('@/components/map/DonationMap'), { ssr: false });

export const metadata = {
  title: 'Geographic Donation Map — Florida Influence',
  description: 'See where Florida political money comes from — top donor cities, states, and in-state vs. out-of-state breakdown.',
};

export default function MapPage() {
  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/tools" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Tools</Link>
        {' / '}
        <span>Geographic Map</span>
      </div>

      <h1 style={{
        fontFamily: 'var(--font-serif)',
        fontSize: 'clamp(1.4rem, 3vw, 2rem)',
        fontWeight: 400,
        marginBottom: '0.4rem',
      }}>
        Where Does the Money Come From?
      </h1>
      <p style={{
        fontSize: '0.82rem',
        color: 'var(--text-dim)',
        lineHeight: 1.6,
        marginBottom: '1.75rem',
        maxWidth: '640px',
      }}>
        Florida's political money doesn't just come from Florida.
        Explore the geographic origins of all tracked political contributions — by city, by state, and in-state vs. out-of-state.
      </p>

      <DonationMap />

      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <Link href="/follow" style={{ fontSize: '0.72rem', color: 'var(--teal)', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>
          → Follow the Money
        </Link>
        <Link href="/donors" style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>
          → Browse all donors
        </Link>
        <Link href="/explorer" style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>
          → Transaction explorer
        </Link>
      </div>
    </main>
  );
}
