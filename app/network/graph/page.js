import Link from 'next/link';

export const metadata = {
  title: 'Network Graph',
};

export default function NetworkGraphPage() {
  return (
    <main style={{ maxWidth: '700px', margin: '0 auto', padding: '4rem 2rem' }}>
      <div style={{
        display: 'inline-block', fontSize: '0.65rem', padding: '0.15rem 0.5rem',
        border: '1px solid var(--text-dim)', color: 'var(--text-dim)',
        borderRadius: '2px', fontFamily: 'var(--font-mono)', marginBottom: '1.5rem',
      }}>
        RETIRED
      </div>

      <h1 style={{
        fontFamily: 'var(--font-serif)', fontSize: '1.8rem',
        color: 'var(--text)', marginBottom: '1rem', fontWeight: 400,
      }}>
        The full network graph has been retired.
      </h1>

      <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: '2rem' }}>
        The force-directed graph rendered 12,000+ nodes — too many to orient yourself in,
        regardless of filtering. It's been replaced with tools that let you actually follow the money.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Link href="/flow" style={{
          display: 'block', padding: '1rem 1.25rem',
          background: 'var(--surface)', border: '1px solid rgba(77,216,240,0.3)',
          borderRadius: '3px', textDecoration: 'none', transition: 'border-color 0.12s',
        }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--teal)', fontFamily: 'var(--font-mono)', marginBottom: '0.3rem' }}>
            → Flow Explorer
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            Click through industries → donors → committees → candidates. Column-by-column with breadcrumbs.
          </div>
        </Link>

        <Link href="/connections" style={{
          display: 'block', padding: '1rem 1.25rem',
          background: 'var(--surface)', border: '1px solid rgba(255,176,96,0.25)',
          borderRadius: '3px', textDecoration: 'none', transition: 'border-color 0.12s',
        }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--orange)', fontFamily: 'var(--font-mono)', marginBottom: '0.3rem' }}>
            → Committee Connections
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            Find committees that share a treasurer, address, chair, or donor base. Structural political networks.
          </div>
        </Link>

        <Link href="/influence" style={{
          display: 'block', padding: '1rem 1.25rem',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '3px', textDecoration: 'none', transition: 'border-color 0.12s',
        }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text)', fontFamily: 'var(--font-mono)', marginBottom: '0.3rem' }}>
            → Influence Index
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            Organizations ranked by combined donations + lobbying spend. A different view of concentrated power.
          </div>
        </Link>
      </div>
    </main>
  );
}
