import Link from 'next/link';

export const metadata = {
  title: 'For Journalists — Florida Influence',
  description: 'Investigative tools for Florida political money: follow donor webs through PACs, map shadow networks, trace lobbyist connections, and export everything.',
};

const TOOLS = [
  {
    href: '/influence',
    title: '→ influence index',
    desc: 'Score-ranked list of donors, lobbyists, and committees by total political footprint across candidates, PACs, and cycles.',
  },
  {
    href: '/connections',
    title: '→ committee connections',
    desc: 'Visual graph of committee relationships — transfers, shared donors, coordinated spending, and shadow networks mapped.',
  },
  {
    href: '/flow',
    title: '→ money flow explorer',
    desc: 'Trace every dollar from donor → committee → candidate. Filter by cycle, party, industry, or amount threshold.',
  },
  {
    href: '/tools/bipartisan',
    title: '→ party cross-reference',
    desc: 'Identify donors and lobbyists who fund both parties — ranked by total bipartisan spend and industry sector.',
  },
];

const QUERIES = [
  'Show all PACs connected to DeSantis',
  'Which lobbyists fund both parties?',
  'Map the sugar industry shadow network',
  'Who bundled money for the 2022 governor\'s race?',
];

export default function JournalistLandingPage() {
  return (
    <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '3rem 2.5rem 5rem' }}>
      <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)', marginBottom: '2rem' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/tools" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Tools</Link>
        {' / '}
        <span>For Journalists</span>
      </div>

      {/* Hero */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '4rem', alignItems: 'start', marginBottom: '4rem' }}>
        <div>
          <div style={{
            display: 'inline-block', fontSize: '0.62rem', textTransform: 'uppercase',
            letterSpacing: '0.13em', padding: '0.28rem 0.7rem', borderRadius: '2px',
            marginBottom: '1.25rem', border: '1px solid rgba(255,176,96,0.3)',
            background: 'rgba(255,176,96,0.06)', color: 'var(--orange)',
          }}>
            For Journalists
          </div>
          <h1 style={{
            fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)',
            fontWeight: 400, lineHeight: 1.25, marginBottom: '1rem',
          }}>
            "Follow the money — through <span style={{ color: 'var(--orange)' }}>PACs, lobbyists,</span><br />and shadow networks."
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.75, maxWidth: '500px', marginBottom: '2rem' }}>
            Florida's influence ecosystem is tangled by design. These tools trace donor webs across committees, surface lobbyist relationships, and map the shadow PAC networks — down to every filing, every connection.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link href="/follow" style={{
              fontSize: '0.75rem', padding: '0.55rem 1.25rem', borderRadius: '3px',
              textDecoration: 'none', fontWeight: 700,
              background: 'rgba(255,176,96,0.1)', color: 'var(--orange)',
              border: '1px solid rgba(255,176,96,0.25)',
            }}>
              → Follow the money
            </Link>
            <Link href="/influence" style={{
              fontSize: '0.75rem', padding: '0.55rem 1.25rem', borderRadius: '3px',
              textDecoration: 'none', fontWeight: 700,
              background: 'rgba(255,176,96,0.1)', color: 'var(--orange)',
              border: '1px solid rgba(255,176,96,0.25)',
            }}>
              → Influence index
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
              { val: '431',   label: 'shadow PAC orgs indexed' },
              { val: '56K+',  label: 'committee-to-committee pairs' },
              { val: '2,473', label: 'lobbyist profiles' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{s.label}</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--orange)' }}>{s.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Featured tool */}
      <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.13em', color: 'var(--text-dim)', marginBottom: '1.25rem' }}>
        Featured tool
      </div>
      <Link href="/follow" style={{ textDecoration: 'none' }}>
        <div style={{
          border: '1px solid rgba(255,176,96,0.2)', background: 'rgba(255,176,96,0.04)',
          borderRadius: '4px', padding: '1.75rem 2rem', marginBottom: '3rem',
          display: 'grid', gridTemplateColumns: '1fr auto', gap: '2rem', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--orange)', marginBottom: '0.6rem' }}>
              Featured · Money Tracing
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--orange)', fontFamily: 'var(--font-mono)', marginBottom: '0.5rem' }}>
              → follow the money
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: 1.7, maxWidth: '560px' }}>
              Start with any candidate, committee, or donor and trace the full money trail — upstream contributors, downstream transfers, and PAC connections. Built for investigative reporting. Exportable to CSV.
            </div>
          </div>
          <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', background: 'rgba(255,176,96,0.1)', color: 'var(--orange)', padding: '0.25rem 0.6rem', borderRadius: '2px', whiteSpace: 'nowrap', border: '1px solid rgba(255,176,96,0.25)' }}>
            Export ready
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
              <div style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--orange)', marginBottom: '0.3rem' }}>{tool.title}</div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(200,216,240,0.55)', lineHeight: 1.55 }}>{tool.desc}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Credibility strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem', borderTop: '1px solid var(--border)', paddingTop: '2.5rem', marginBottom: '3rem' }}>
        {[
          { val: '431 orgs',    label: 'shadow PAC entities mapped\n56K+ committee pairs documented' },
          { val: '$34.9B',      label: 'lobbying compensation tracked\n4M rows · 1,970 firms · 19 years' },
          { val: 'CSV export',  label: 'every tool exports to CSV\nno account required' },
        ].map(s => (
          <div key={s.val}>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--orange)', marginBottom: '0.3rem' }}>{s.val}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.55, whiteSpace: 'pre-line' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Bottom CTA */}
      <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)' }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)', fontSize: '0.82rem', display: 'block', marginBottom: '0.25rem' }}>
            Need raw data instead?
          </strong>
          The deep data lane has transaction-level exports and cycle comparisons.
        </div>
        <Link href="/tools/data" style={{ fontSize: '0.75rem', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.5rem 1rem', textDecoration: 'none' }}>
          → Deep data tools
        </Link>
      </div>
    </main>
  );
}
