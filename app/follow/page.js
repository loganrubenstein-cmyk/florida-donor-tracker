import dynamic from 'next/dynamic';
import Link from 'next/link';

const FollowExplorer = dynamic(() => import('@/components/follow/FollowExplorer'), { ssr: false });

export const metadata = {
  title: 'Follow the Money — Florida Donor Tracker',
  description: 'Trace any donor\'s money through Florida political committees to candidates and their legislative votes.',
};

export default async function FollowPage({ searchParams }) {
  const params = await searchParams;
  const preloadSlug = params?.donor || null;

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/tools" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Tools</Link>
        {' / '}
        <span>Follow the Money</span>
      </div>

      <h1 style={{
        fontFamily: 'var(--font-serif)',
        fontSize: 'clamp(1.4rem, 3vw, 2rem)',
        fontWeight: 400,
        marginBottom: '0.4rem',
      }}>
        Follow the Money
      </h1>
      <p style={{
        fontSize: '0.82rem',
        color: 'var(--text-dim)',
        lineHeight: 1.6,
        marginBottom: '1.75rem',
        maxWidth: '640px',
      }}>
        Pick any donor and trace their money through Florida political committees to the candidates they fund — then see how those candidates voted on legislation.
        The full chain from dollar to decision, in one screen.
      </p>

      <FollowExplorer preloadSlug={preloadSlug} />
    </main>
  );
}
