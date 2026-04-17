import Link from 'next/link';

export const metadata = {
  title: 'Analysis Tools — Florida Donor Tracker',
  description: 'Interactive tools for Florida campaign finance research: donor overlap, party cross-reference, transparency index, and more.',
};

const TOOLS = [
  {
    href: '/compare',
    title: 'Donor Overlap',
    desc: 'Compare any two candidates or committees to find shared donors, industry funding sources, and who backs only one side.',
    accent: 'var(--teal)',
  },
  {
    href: '/tools/bipartisan',
    title: 'Party Cross-Reference',
    desc: 'Search any donor to see their giving split between Republican, Democratic, and nonpartisan recipients. Identifies "both sides" donors.',
    accent: 'var(--orange)',
    badge: 'New',
  },
  {
    href: '/decode',
    title: 'Committee Decoder',
    desc: 'Decode any Florida political committee: who controls it, who funds it, and how it connects to candidates.',
    accent: 'var(--blue)',
  },
  {
    href: '/district',
    title: 'District Money Map',
    desc: 'See how money flows in a Florida legislative district — top donors, top recipients, and industry breakdown.',
    accent: 'var(--green)',
  },
  {
    href: '/timeline',
    title: 'Money Timeline',
    desc: 'Visualize contribution activity over time for any candidate or committee.',
    accent: 'var(--gold)',
  },
  {
    href: '/transparency',
    title: 'Transparency Index',
    desc: 'Ranked view of Florida candidates and committees by disclosure completeness and contribution diversity.',
    accent: 'var(--republican)',
  },
  {
    href: '/follow',
    title: 'Follow the Money',
    desc: 'Pick any donor and trace their money through committees to candidates — then see how those candidates voted on legislation.',
    accent: 'var(--teal)',
    badge: 'New',
  },
  {
    href: '/flow',
    title: 'Money Flow Explorer',
    desc: 'Multi-path drill-down: start from an industry, party, committee, candidate, or donor and explore every link in the money chain.',
    accent: 'var(--orange)',
  },
  {
    href: '/pulse',
    title: 'Pulse',
    desc: 'Live feed of recent large contributions, newly registered committees, and top donors of the current cycle.',
    accent: 'var(--green)',
    badge: 'New',
  },
  {
    href: '/map',
    title: 'Geographic Map',
    desc: 'Where does Florida political money come from? Top donor cities, states, and in-state vs. out-of-state breakdown.',
    accent: 'var(--blue)',
    badge: 'New',
  },
  {
    href: '/network/graph',
    title: 'Network Graph',
    desc: 'Force-directed graph of committee-to-committee money flows. Explore the structural topology of Florida political finance.',
    accent: 'var(--teal)',
    badge: 'New',
  },
];

export default function ToolsPage() {
  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <span>Tools</span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.4rem,3vw,2rem)', fontWeight: 400, color: 'var(--text)', marginBottom: '0.5rem' }}>
        Analysis Tools
      </h1>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: '0.25rem' }}>
        Interactive tools for Florida campaign finance research.
      </p>

      <div className="hub-grid">
        {TOOLS.map(t => (
          <Link key={t.href} href={t.href} className="hub-card" style={{ textDecoration: 'none', position: 'relative' }}>
            {t.badge && (
              <span style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', fontSize: '0.55rem', padding: '0.1rem 0.35rem', background: `${t.accent}22`, border: `1px solid ${t.accent}44`, color: t.accent, borderRadius: '2px', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
                {t.badge}
              </span>
            )}
            <div className="hub-card-title" style={{ color: t.accent }}>{t.title}</div>
            <div className="hub-card-desc">{t.desc}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
