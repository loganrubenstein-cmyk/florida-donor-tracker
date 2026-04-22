import Link from 'next/link';

export const metadata = {
  title: 'Deep Data',
  description: '22 million Florida campaign finance transactions, 19 years of lobbying compensation, and full election cycle comparisons. All queryable, all exportable.',
};

const TOOLS = [
  {
    href: '/industries',
    title: '→ industries',
    desc: 'Campaign contributions bucketed by sector — real estate, healthcare, legal, finance, agriculture, and 9 more. Compare across cycles.',
  },
  {
    href: '/cycles',
    title: '→ election cycles 2008–2026',
    desc: 'Side-by-side comparison of every FL election cycle. Total raised, top donors, top recipients, hard vs. soft money split.',
  },
  {
    href: '/principals',
    title: '→ lobbying principals',
    desc: 'Every company and organization that has hired lobbyists in Florida — total spend, active firms, and legislative targets.',
  },
  {
    href: '/timeline',
    title: '→ money timeline',
    desc: 'Longitudinal view of political spending from 1996 to present. Overlay election years, legislation, and major events.',
  },
];

const QUERIES = [
  'All contributions over $100K since 2020',
  'Industry breakdown for the 2022 cycle',
  'Top lobbying firms by compensation 2005–2024',
  'Compare 2018 vs. 2022 fundraising totals',
];

export default function DataLandingPage() {
  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '3rem 2.5rem 5rem' }}>
      <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)', marginBottom: '2rem' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/tools" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Tools</Link>
        {' / '}
        <span>Deep Data</span>
      </div>

      {/* Hero */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '4rem', alignItems: 'start', marginBottom: '4rem' }}>
        <div>
          <div style={{
            display: 'inline-block', fontSize: '0.62rem', textTransform: 'uppercase',
            letterSpacing: '0.13em', padding: '0.28rem 0.7rem', borderRadius: '2px',
            marginBottom: '1.25rem', border: '1px solid rgba(160,192,255,0.3)',
            background: 'rgba(160,192,255,0.06)', color: 'var(--blue)',
          }}>
            Deep Data
          </div>
          <h1 style={{
            fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)',
            fontWeight: 400, lineHeight: 1.25, marginBottom: '1rem',
          }}>
            "Give me the <span style={{ color: 'var(--blue)' }}>full picture</span> —<br />every transaction,<br />every cycle."
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.75, maxWidth: '500px', marginBottom: '2rem' }}>
            For researchers, analysts, and anyone who wants the unfiltered data. 22 million transactions, 19 years of lobbying compensation, and full election cycle comparisons — all queryable, all exportable.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link href="/explorer" style={{
              fontSize: '0.75rem', padding: '0.55rem 1.25rem', borderRadius: '3px',
              textDecoration: 'none', fontWeight: 700,
              background: 'rgba(160,192,255,0.1)', color: 'var(--blue)',
              border: '1px solid rgba(160,192,255,0.25)',
            }}>
              → Transaction explorer
            </Link>
            <Link href="/cycles" style={{
              fontSize: '0.75rem', padding: '0.55rem 1.25rem', borderRadius: '3px',
              textDecoration: 'none', fontWeight: 700,
              background: 'rgba(160,192,255,0.1)', color: 'var(--blue)',
              border: '1px solid rgba(160,192,255,0.25)',
            }}>
              → Election cycles
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
              { val: '22M+',       label: 'total transactions' },
              { val: '4M',         label: 'lobbying comp rows' },
              { val: '2008–2026',  label: 'election cycles covered' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{s.label}</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--blue)' }}>{s.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Featured tool */}
      <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.13em', color: 'var(--text-dim)', marginBottom: '1.25rem' }}>
        Featured tool
      </div>
      <Link href="/explorer" style={{ textDecoration: 'none' }}>
        <div style={{
          border: '1px solid rgba(160,192,255,0.2)', background: 'rgba(160,192,255,0.04)',
          borderRadius: '4px', padding: '1.75rem 2rem', marginBottom: '3rem',
          display: 'grid', gridTemplateColumns: '1fr auto', gap: '2rem', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--blue)', marginBottom: '0.6rem' }}>
              Featured · Raw Data
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 400, color: 'var(--blue)', fontFamily: 'var(--font-serif)', marginBottom: '0.5rem' , fontVariantNumeric: 'tabular-nums' }}>
              → transaction explorer
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: 1.7, maxWidth: '560px' }}>
              Query the full 22M-transaction dataset. Filter by date range, amount, party, district, industry, or donor type. Sort, paginate, and export. The most direct interface to the underlying data.
            </div>
          </div>
          <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', background: 'rgba(160,192,255,0.1)', color: 'var(--blue)', padding: '0.25rem 0.6rem', borderRadius: '2px', whiteSpace: 'nowrap', border: '1px solid rgba(160,192,255,0.25)' }}>
            Full dataset
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
              <div style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--blue)', marginBottom: '0.3rem' }}>{tool.title}</div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(200,216,240,0.55)', lineHeight: 1.55 }}>{tool.desc}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Credibility strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem', borderTop: '1px solid var(--border)', paddingTop: '2.5rem', marginBottom: '3rem' }}>
        {[
          { val: '22M+',         label: 'individual transactions\n1M+ unique donors · 1996–2026' },
          { val: '$36B+',        label: 'lobbying comp tracked across\n4M rows · 1,785 firms · 19 years' },
          { val: 'Public record', label: 'all data from FL Division of Elections,\nELMO, and official lobbying disclosures' },
        ].map(s => (
          <div key={s.val}>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--blue)', marginBottom: '0.3rem' }}>{s.val}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.55, whiteSpace: 'pre-line' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Bottom CTA */}
      <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)' }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)', fontSize: '0.82rem', display: 'block', marginBottom: '0.25rem' }}>
            Need it framed for a story?
          </strong>
          The journalist lane has tracing tools and shadow network maps.
        </div>
        <Link href="/tools/journalists" style={{ fontSize: '0.75rem', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.5rem 1rem', textDecoration: 'none' }}>
          → Journalist tools
        </Link>
      </div>
    </main>
  );
}
