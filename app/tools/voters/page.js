import Link from 'next/link';

export const metadata = {
  title: 'For Voters',
  description: 'Track who bankrolls your representatives. Connect donations to districts, follow 2026 races, and vote with the full picture of Florida political money.',
};

const TOOLS = [
  {
    href: '/races/2026',
    title: '→ 2026 money race',
    desc: 'Live fundraising leaderboard for every major FL race. Hard money vs. soft money. Updated as filings drop.',
    badge: 'New',
  },
  {
    href: '/legislature',
    title: '→ legislature',
    desc: 'All 160 FL legislators — campaign donors, lobbying contacts, vote history, and official financial disclosures in one place.',
  },
  {
    href: '/pulse',
    title: '→ pulse',
    desc: 'What\'s happening right now — recent filings, notable donors, and trending committees across Florida politics.',
  },
];

const QUERIES = [
  'Who are the top donors to my state rep?',
  'Show me out-of-state money in district 13',
  'Which 2026 races are closest in fundraising?',
  'How does my rep vote vs. who funds them?',
];

export default function VoterLandingPage() {
  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '3rem 2.5rem 5rem' }}>
      <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)', marginBottom: '2rem' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/tools" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Tools</Link>
        {' / '}
        <span>For Voters</span>
      </div>

      {/* Hero */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '4rem', alignItems: 'start', marginBottom: '4rem' }}>
        <div>
          <div style={{
            display: 'inline-block', fontSize: '0.62rem', textTransform: 'uppercase',
            letterSpacing: '0.13em', padding: '0.28rem 0.7rem', borderRadius: '2px',
            marginBottom: '1.25rem', border: '1px solid rgba(77,216,240,0.3)',
            background: 'rgba(77,216,240,0.06)', color: 'var(--teal)',
          }}>
            For Voters
          </div>
          <h1 style={{
            fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)',
            fontWeight: 400, lineHeight: 1.25, marginBottom: '1rem',
          }}>
            "Who's <span style={{ color: 'var(--teal)' }}>bankrolling</span> the people<br />who represent me?"
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.75, maxWidth: '500px', marginBottom: '2rem' }}>
            Your rep is on the ballot — but who's really backing them? These tools connect donations to districts, track the 2026 races, and show exactly where the money comes from so you can vote with the full picture.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link href="/who-funds" style={{
              fontSize: '0.75rem', padding: '0.55rem 1.25rem', borderRadius: '3px',
              textDecoration: 'none', fontWeight: 700,
              background: 'rgba(77,216,240,0.1)', color: 'var(--teal)',
              border: '1px solid rgba(77,216,240,0.25)',
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
            }}>
              → Who funds your district
            </Link>
            <Link href="/races/2026" style={{
              fontSize: '0.75rem', padding: '0.55rem 1.25rem', borderRadius: '3px',
              textDecoration: 'none', fontWeight: 700,
              background: 'rgba(77,216,240,0.1)', color: 'var(--teal)',
              border: '1px solid rgba(77,216,240,0.25)',
            }}>
              → 2026 money race
            </Link>
            <Link href="/tools" style={{
              fontSize: '0.72rem', color: 'var(--text-dim)',
              border: '1px solid var(--border)', background: 'none',
              borderRadius: '3px', padding: '0.55rem 1rem', textDecoration: 'none',
            }}>
              All tools
            </Link>
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '1.5rem', background: 'var(--surface)' }}>
          <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
            Try asking
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.25rem' }}>
            {QUERIES.map(q => (
              <div key={q} style={{ fontSize: '0.68rem', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.4rem 0.7rem', lineHeight: 1.45 }}>
                {q}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', paddingTop: '1.1rem', borderTop: '1px solid var(--border)' }}>
            {[
              { val: '883K', label: 'FL donors in the database' },
              { val: '120+', label: 'Races tracked in 2026' },
              { val: '160',  label: 'Current FL legislators' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{s.label}</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--teal)' }}>{s.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Featured tool */}
      <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.13em', color: 'var(--text-dim)', marginBottom: '1.25rem' }}>
        Featured tool
      </div>
      <Link href="/who-funds" style={{ textDecoration: 'none' }}>
        <div style={{
          border: '1px solid rgba(77,216,240,0.2)', background: 'rgba(77,216,240,0.04)',
          borderRadius: '4px', padding: '1.75rem 2rem', marginBottom: '3rem',
          display: 'grid', gridTemplateColumns: '1fr auto', gap: '2rem', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--teal)', marginBottom: '0.6rem' }}>
              Featured · New
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 400, color: 'var(--teal)', fontFamily: 'var(--font-serif)', marginBottom: '0.5rem' , fontVariantNumeric: 'tabular-nums' }}>
              → who funds your district
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: 1.7, maxWidth: '560px' }}>
              Enter your zip code and we map your representatives — state house, state senate, US Congress — to every donor on file. See the top industries, biggest names, and how the money breaks down by election cycle.
            </div>
          </div>
          <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', background: 'rgba(128,255,160,0.1)', color: 'var(--green)', padding: '0.25rem 0.6rem', borderRadius: '2px', whiteSpace: 'nowrap' }}>
            New
          </span>
        </div>
      </Link>

      {/* Tool grid */}
      <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.13em', color: 'var(--text-dim)', marginBottom: '1.25rem' }}>
        Tools in this lane
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '4rem' }}>
        {TOOLS.map(tool => (
          <Link key={tool.href} href={tool.href} style={{ textDecoration: 'none' }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: '3px', padding: '1rem 1.1rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                <div style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--teal)' }}>{tool.title}</div>
                {tool.badge && (
                  <span style={{ fontSize: '0.56rem', textTransform: 'uppercase', background: 'rgba(128,255,160,0.1)', color: 'var(--green)', padding: '0.15rem 0.4rem', borderRadius: '2px', flexShrink: 0, marginLeft: '0.5rem' }}>
                    {tool.badge}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(200,216,240,0.55)', lineHeight: 1.55 }}>{tool.desc}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Credibility strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem', borderTop: '1px solid var(--border)', paddingTop: '2.5rem', marginBottom: '3rem' }}>
        {[
          { val: '$3.9B+',     label: 'campaign contributions tracked\n22M+ transactions · 1996–2026' },
          { val: 'All public', label: 'every figure sourced from Florida\nDivision of Elections public records' },
          { val: 'Free',       label: 'no paywall, no signup required\nfor any voter tool' },
        ].map(s => (
          <div key={s.val}>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--teal)', marginBottom: '0.3rem' }}>{s.val}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.55, whiteSpace: 'pre-line' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Bottom CTA */}
      <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)' }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)', fontSize: '0.82rem', display: 'block', marginBottom: '0.25rem' }}>
            Looking for something else?
          </strong>
          The full tool hub has 16 tools organized by use case.
        </div>
        <Link href="/tools" style={{ fontSize: '0.75rem', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.5rem 1rem', textDecoration: 'none' }}>
          → All tools
        </Link>
      </div>
    </main>
  );
}
