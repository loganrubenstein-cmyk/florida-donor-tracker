import Link from 'next/link';

export const metadata = {
  title: 'Legislators — Florida Donor Tracker',
  description: 'Florida legislators with voting records, party breakdown, and campaign finance cross-references.',
};

export default function LegislatorsPage() {
  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <span>Legislators</span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', color: 'var(--text)', marginBottom: '1.5rem' }}>
        Florida Legislators
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
          This page is being rebuilt for improved accuracy. The underlying legislator data and
          finance cross-references are being updated before this section relaunches.
        </p>

        <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
          The previous version had ~73% finance match coverage and floor-vote-only data from LegiScan.
          The rebuilt page will have higher match rates, better vote coverage, and clearer data provenance.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link href="/candidates" style={{
            background: 'var(--orange)',
            color: '#01010d',
            padding: '0.45rem 1rem',
            fontSize: '0.7rem',
            fontWeight: 700,
            borderRadius: '3px',
            textDecoration: 'none',
            fontFamily: 'var(--font-sans)',
          }}>
            Browse Candidates
          </Link>
          <Link href="/research" style={{
            border: '1px solid var(--border)',
            color: 'var(--text-dim)',
            padding: '0.45rem 1rem',
            fontSize: '0.7rem',
            borderRadius: '3px',
            textDecoration: 'none',
            fontFamily: 'var(--font-mono)',
          }}>
            → Research tools
          </Link>
        </div>
      </div>
    </main>
  );
}
