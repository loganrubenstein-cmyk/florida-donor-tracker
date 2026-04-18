import Link from 'next/link';
import ToolHubTabs from '@/components/tools/ToolHubTabs';

export const metadata = {
  title: 'Explore the Data — Florida Influence',
  description: 'Three ways into Florida political money: follow the money through PACs and shadow networks, track the 2026 races, or query 22 million raw transactions.',
};

const ALL_TOOLS = [
  /* ── Money tracing ── */
  { href: '/follow',           title: 'Follow the Money',        desc: 'Trace any donor through committees to candidates.' },
  { href: '/flow',             title: 'Money Flow Explorer',     desc: 'Multi-path donor → committee → candidate drill-down.' },
  { href: '/connections',      title: 'Committee Connections',   desc: 'Shadow network graph of committee relationships.' },
  { href: '/ie',               title: 'Independent Expenditures',desc: '$70.9M in IE spending — who ran ads for/against candidates.' },
  { href: '/transfers',        title: 'Committee Transfers',     desc: 'Money moving between committees — trace every transfer.' },
  /* ── Influence & analysis ── */
  { href: '/influence',        title: 'Influence Index',         desc: 'Orgs ranked by combined lobbying + campaign donations.' },
  { href: '/compare',          title: 'Donor Overlap',           desc: 'Find shared donors between any two candidates.' },
  { href: '/tools/bipartisan', title: 'Party Cross-Reference',   desc: 'Donors who fund both parties — ranked by bipartisan spend.' },
  { href: '/transparency',     title: 'Transparency Index',      desc: 'Candidates ranked by disclosure completeness and diversity.' },
  { href: '/investigations',   title: 'Investigations',          desc: '11 entities with documented influence, cross-referenced with journalism.' },
  /* ── Districts & races ── */
  { href: '/who-funds',        title: 'Who Funds Your District', desc: 'Zip code → rep → full donor breakdown.', badge: 'New' },
  { href: '/races/2026',       title: '2026 Money Race',         desc: 'Live fundraising leaderboard per race.', badge: 'New' },
  { href: '/district',         title: 'District Money Map',      desc: 'Political money raised per FL legislative district.' },
  /* ── Legislature & officials ── */
  { href: '/legislature',      title: 'Legislature',             desc: '160 legislators — donors, votes, disclosures.' },
  { href: '/elections',        title: 'Elections',               desc: 'FL results 2012–2024: finance-matched, cost per vote.' },
  { href: '/party-finance',    title: 'Party Finance',           desc: 'Republican vs. Democrat fundraising — 30-year trend.' },
  /* ── Raw data ── */
  { href: '/explorer',         title: 'Transaction Explorer',    desc: 'Full 22M-row dataset: filter, sort, export.' },
  { href: '/industries',       title: 'Industries',              desc: 'Campaign finance by sector — 15 industry categories.' },
  { href: '/cycles',           title: 'Election Cycles',         desc: '2008–2026 cycle-by-cycle comparisons.' },
  { href: '/timeline',         title: 'Money Timeline',          desc: 'Political spending 1996–present with event overlay.' },
  { href: '/map',              title: 'Geographic Map',          desc: 'Where FL political money comes from, mapped.' },
  /* ── Lobbying ── */
  { href: '/lobbyists',        title: 'Lobbyists',               desc: '2,473 registered lobbyists — clients, bills, donations.' },
  { href: '/principals',       title: 'Lobbying Principals',     desc: '19 years of lobbying clients and spend.' },
  { href: '/lobbying-firms',   title: 'Lobbying Firms',          desc: '1,970 firms ranked by total compensation.' },
  /* ── Directories ── */
  { href: '/donors',           title: 'Donors',                  desc: '883K deduped donor profiles — all-time FL contributors.' },
  { href: '/committees',       title: 'Committees',              desc: '5,974 PACs, ECOs, and party committees.' },
  { href: '/candidates',       title: 'Candidates',              desc: 'Every FL candidate — hard money, soft money, PAC links.' },
  { href: '/decode',           title: 'Committee Decoder',       desc: 'Who controls and funds any FL PAC.' },
  /* ── Other ── */
  { href: '/contracts',        title: 'State Contracts',         desc: 'FL vendors who got state contracts — matched to donors.' },
  { href: '/federal-contracts',title: 'Federal Contracts',       desc: '$219B in federal awards to FL recipients.' },
  { href: '/solicitations',    title: 'Solicitations',           desc: 'FL organizations registered to solicit political contributions.' },
  { href: '/pulse',            title: 'Pulse',                   desc: 'Live feed of recent filings and large donors.' },
];

export default function ToolsPage() {
  return (
    <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '2.5rem' }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: '1.5rem' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <span>Tools</span>
      </div>

      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.8rem', fontWeight: 400, marginBottom: '0.4rem' }}>
          Explore the data
        </h1>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.6, maxWidth: '520px' }}>
          Three ways in — pick the one that matches your question, or jump straight to any tool below.
        </p>
      </div>

      <ToolHubTabs />

      {/* All Tools flat index */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
        <div style={{ fontSize: '0.62rem', letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '1rem' }}>
          All Tools — Quick Access
        </div>
        <div className="tools-index-grid">
          {ALL_TOOLS.map(tool => (
            <Link key={tool.title} href={tool.href} style={{ textDecoration: 'none' }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: '3px', padding: '0.75rem 0.9rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                  <div style={{ fontSize: '0.71rem', fontWeight: 700, color: 'var(--text)' }}>{tool.title}</div>
                  {tool.badge && (
                    <span style={{ fontSize: '0.52rem', textTransform: 'uppercase', background: 'rgba(128,255,160,0.1)', color: 'var(--green)', padding: '0.12rem 0.35rem', borderRadius: '2px', flexShrink: 0 }}>
                      {tool.badge}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.64rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                  {tool.desc}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
