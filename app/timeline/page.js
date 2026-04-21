import InfluenceTimeline from '@/components/tools/InfluenceTimeline';
import Link from 'next/link';

export const metadata = {
  title: 'Influence Timeline',
  description: 'Visualize any Florida candidate\'s fundraising over time — donation spikes, PAC formations, and pre-election surges.',
};

const WHAT_YOU_SEE = [
  'Quarterly donation totals as a bar chart across the full campaign',
  'Spikes flagged when a quarter exceeds 2.5× the rolling median',
  'PAC formations and committee links overlaid on the timeline',
  'Top donors for each quarter — who showed up when',
];

const NOTABLE_CANDIDATES = [
  { label: 'Ron DeSantis (Gov 2022)',      q: 'Ron DeSantis',      note: 'Raised $177M — largest in FL history' },
  { label: 'Charlie Crist (Gov 2022)',     q: 'Charlie Crist',     note: 'Q4 2022 spike ahead of election day' },
  { label: 'Michelle Salzman (House)',     q: 'Michelle Salzman',  note: 'State House — PAC formation timeline' },
  { label: 'Marco Rubio (Senate)',         q: 'Marco Rubio',       note: 'US Senate — multi-cycle view' },
  { label: 'Rick Scott (Senate)',          q: 'Rick Scott',        note: 'Large self-funding + PAC waves' },
];

export default function TimelinePage() {
  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 2.5rem 5rem' }}>
      <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)', marginBottom: '2rem' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/tools" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Tools</Link>
        {' / '}
        <span>Influence Timeline</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '4rem', alignItems: 'start', marginBottom: '3rem' }}>
        <div>
          <div style={{
            display: 'inline-block', fontSize: '0.62rem', textTransform: 'uppercase',
            letterSpacing: '0.13em', padding: '0.28rem 0.7rem', borderRadius: '2px',
            marginBottom: '1.25rem', border: '1px solid rgba(255,176,96,0.3)',
            background: 'rgba(255,176,96,0.06)', color: 'var(--orange)',
          }}>
            Journalist Tool
          </div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '0.9rem' }}>
            When did the <span style={{ color: 'var(--orange)' }}>money flow</span>?<br />Visualize any candidate's fundraising.
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.75, maxWidth: '480px', marginBottom: '2rem' }}>
            Search any Florida candidate to see their full fundraising history quarter by quarter — spot pre-election surges, unusual spikes, and when PACs formed around them.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '2rem' }}>
            {WHAT_YOU_SEE.map(s => (
              <div key={s} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.73rem', color: 'var(--text-dim)', lineHeight: 1.45 }}>
                <span style={{ color: 'var(--orange)', flexShrink: 0 }}>→</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <Link href="/tools/journalists" style={{ fontSize: '0.72rem', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.4rem 0.75rem', textDecoration: 'none' }}>
              → All journalist tools
            </Link>
            <Link href="/follow" style={{ fontSize: '0.72rem', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.4rem 0.75rem', textDecoration: 'none' }}>
              → Follow the money
            </Link>
          </div>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '1.25rem', background: 'var(--surface)' }}>
          <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
            Notable candidates to explore
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {NOTABLE_CANDIDATES.map((c, i) => (
              <Link key={c.q} href={`/timeline?q=${encodeURIComponent(c.q)}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  padding: '0.6rem 0.5rem',
                  borderBottom: i < NOTABLE_CANDIDATES.length - 1 ? '1px solid rgba(100,140,220,0.08)' : 'none',
                }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--orange)', fontWeight: 600, marginBottom: '0.1rem' }}>{c.label}</div>
                  <div style={{ fontSize: '0.63rem', color: 'var(--text-dim)' }}>{c.note}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
        <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.13em', color: 'var(--text-dim)', marginBottom: '1.25rem' }}>
          Search a candidate
        </div>
        <InfluenceTimeline />
      </div>
    </main>
  );
}
