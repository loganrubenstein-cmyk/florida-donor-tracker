import Link from 'next/link';

export const metadata = {
  title: 'Election Results — Florida Donor Tracker',
  description: 'Florida election results — currently being rebuilt for accuracy.',
};

export default function ElectionsPage() {
  return (
    <main style={{ maxWidth: '700px', margin: '0 auto', padding: '4rem 1.5rem', textAlign: 'center' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <span>Elections</span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', color: 'var(--text)', marginBottom: '1rem' }}>
        Election Results
      </h1>

      <div style={{
        padding: '2rem', background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '6px', marginBottom: '2rem',
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔧</div>
        <h2 style={{ fontSize: '1.1rem', color: 'var(--orange)', marginBottom: '0.75rem', fontFamily: 'var(--font-sans)' }}>
          Being Rebuilt for Accuracy
        </h2>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', lineHeight: 1.7, maxWidth: '500px', margin: '0 auto' }}>
          We identified accuracy issues in our election-to-finance matching (only 15–17% of races had
          reliable cross-references). Rather than show incomplete data, we&rsquo;re rebuilding the matching
          engine to use structured lookups (office + district + year) instead of fuzzy name matching.
        </p>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', lineHeight: 1.6, marginTop: '1rem', maxWidth: '500px', margin: '1rem auto 0' }}>
          In the meantime, election cycle spending data is available on the{' '}
          <Link href="/cycles" style={{ color: 'var(--teal)', textDecoration: 'none' }}>Election Cycles</Link> page,
          and individual candidate finance data is on each{' '}
          <Link href="/candidates" style={{ color: 'var(--teal)', textDecoration: 'none' }}>candidate profile</Link>.
        </p>
      </div>

      <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
        Source: Florida Division of Elections. Not affiliated with the State of Florida.
      </p>
    </main>
  );
}
