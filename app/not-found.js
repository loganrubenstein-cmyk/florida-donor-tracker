import Link from 'next/link';

const REDACTED_LINES = [
  { width: '78%' }, { width: '65%' }, { width: '83%' }, { width: '52%' },
  { width: '91%' }, { width: '44%' }, { width: '72%' }, { width: '60%' },
  { width: '87%' }, { width: '38%' }, { width: '76%' }, { width: '55%' },
];

export default function NotFound() {
  return (
    <main style={{ maxWidth: '680px', margin: '4rem auto', padding: '0 2rem' }}>

      {/* Document header */}
      <div style={{
        border: '2px solid var(--border)', borderRadius: '2px',
        padding: '1.5rem 2rem', position: 'relative', overflow: 'hidden',
        background: 'var(--surface)',
      }}>

        {/* REDACTED diagonal stamp */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%) rotate(-22deg)',
          fontSize: '4.5rem', fontWeight: 900, letterSpacing: '0.08em',
          color: 'rgba(220,60,60,0.09)', fontFamily: 'var(--font-mono)',
          pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap',
          textTransform: 'uppercase', zIndex: 0,
        }}>
          REDACTED
        </div>

        {/* Case file header */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem',
          }}>
            <div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.2rem' }}>
                Florida Division of Elections
              </div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                Campaign Finance Public Records Bureau
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>CASE FILE</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'rgba(220,60,60,0.7)', fontFamily: 'var(--font-mono)' }}>#000-404</div>
              <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                CLASSIFICATION: <span style={{ color: 'rgba(220,60,60,0.5)' }}>NOT FOUND</span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: '2px solid var(--border)', marginBottom: '1.25rem' }} />

          {/* Subject block */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>RE: Requested Document</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text)' }}>
              Access to record{' '}
              <span style={{ background: 'var(--text)', color: 'var(--surface)', padding: '0 0.3em', borderRadius: '1px' }}>
                [expunged per statute §404.000]
              </span>
              {' '}has been denied.
            </div>
          </div>

          {/* Redacted body text */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.6rem' }}>Document Contents</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {REDACTED_LINES.map((line, i) => (
                <div key={i} style={{
                  height: '10px', width: line.width,
                  background: 'rgba(200,216,240,0.12)',
                  borderRadius: '1px',
                }} />
              ))}
            </div>
          </div>

          {/* Reason block */}
          <div style={{
            background: 'rgba(220,60,60,0.05)', border: '1px solid rgba(220,60,60,0.15)',
            borderLeft: '3px solid rgba(220,60,60,0.4)',
            borderRadius: '2px', padding: '0.75rem 1rem', marginBottom: '1.5rem',
          }}>
            <div style={{ fontSize: '0.58rem', color: 'rgba(220,60,60,0.6)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>
              Reason for Denial
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}>
              The page you requested either does not exist, was{' '}
              <span style={{ background: 'var(--text)', color: 'var(--surface)', padding: '0 0.25em' }}>
                never filed
              </span>
              , or has been removed by order of{' '}
              <span style={{ background: 'var(--text)', color: 'var(--surface)', padding: '0 0.25em' }}>
                [redacted authority]
              </span>
              {' '}under Florida{' '}
              <span style={{ background: 'var(--text)', color: 'var(--surface)', padding: '0 0.25em' }}>
                §119.071(1)(a)
              </span>
              .
            </div>
          </div>

          {/* Navigation */}
          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
            <Link href="/" style={{ color: 'var(--teal)', textDecoration: 'none', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
              ← Return to public record index
            </Link>
            <Link href="/search" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
              Search public records →
            </Link>
          </div>

          {/* Document footer */}
          <div style={{
            marginTop: '1.5rem', paddingTop: '0.75rem',
            borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between',
            fontSize: '0.55rem', color: 'rgba(90,106,136,0.5)',
            fontFamily: 'var(--font-mono)', flexWrap: 'wrap', gap: '0.25rem',
          }}>
            <span>Page 1 of 1 · No further pages exist</span>
            <span>Form DOS-404 (Rev. 01/04) · Do not reproduce</span>
          </div>
        </div>
      </div>
    </main>
  );
}
