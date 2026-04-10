import Link from 'next/link';

export const metadata = {
  title: 'About — Florida Donor Tracker',
  description: 'Why this site exists, where the data comes from, and how to use it.',
};

export default function AboutPage() {
  return (
    <main style={{ maxWidth: '820px', margin: '0 auto', padding: '3rem 1.75rem 4rem' }}>
      <div style={{ fontSize: '0.6rem', letterSpacing: '0.18em', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '1rem' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <span>About</span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2.2rem', color: '#fff', marginBottom: '1.5rem', fontWeight: 400, lineHeight: 1.1 }}>
        About Florida Donor Tracker
      </h1>

      <section style={{ marginBottom: '2.5rem' }}>
        <div style={{ fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '1rem' }}>
          Why this exists
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text)', lineHeight: 1.85, marginBottom: '1rem' }}>
          Florida is one of the biggest political money machines in the country. Billions flow between donors,
          committees, and campaigns every cycle — but the trail is buried in raw government files that almost
          no one reads.
        </p>
        <p style={{ fontSize: '0.8rem', color: 'var(--text)', lineHeight: 1.85 }}>
          This site pulls every contribution record from the Florida Division of Elections and makes it
          searchable, visual, and human. No spin. No agenda. Just the data — yours to explore.
        </p>
      </section>

      <section style={{ marginBottom: '2.5rem' }}>
        <div style={{ fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '1rem' }}>
          What you can find here
        </div>
        {[
          ['Who gave the most', 'to whom, and when — from a single $25 contribution to $10M mega-donors.'],
          ['How the money flows', 'between donors, committees, candidates, and party organizations.'],
          ['Hard vs. soft money', 'direct candidate contributions vs. PAC/ECO committee spending, per race.'],
          ['Corporate vs. individual', 'classified donors filtered by entity type and industry.'],
          ['Lobbyist connections', 'principals cross-referenced with their donation records.'],
          ['Committee relationships', 'PACs sharing treasurers, addresses, donors, or money flows.'],
          ['Legislators and voting records', '160 current FL House + Senate members — campaign finance, committee assignments, and floor vote history.'],
          ['Election results', 'precinct-level results 2012–2024 matched to finance records, with cost-per-vote analysis.'],
        ].map(([title, desc]) => (
          <div key={title} style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', lineHeight: 1.7 }}>
            <span style={{ color: 'var(--orange)', fontSize: '0.8rem' }}>→</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text)' }}>
              <strong style={{ color: '#fff' }}>{title}</strong> — {desc}
            </span>
          </div>
        ))}
      </section>

      <section style={{ marginBottom: '2.5rem' }}>
        <div style={{ fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '1rem' }}>
          Data sources
        </div>
        <ul style={{ fontSize: '0.78rem', color: 'var(--text)', lineHeight: 1.9, paddingLeft: '1.25rem' }}>
          <li><strong>Florida Division of Elections</strong> — candidate and committee contribution filings (1996–present)</li>
          <li><strong>FL Lobbyist Registration Office</strong> — lobbyist/principal registrations and compensation reports</li>
          <li><strong>FL Department of State</strong> — committee metadata (treasurers, addresses, type codes)</li>
          <li><strong>LegiScan</strong> — legislative session data, floor vote records, bill sponsorships</li>
          <li><strong>FL House Lobbyist Disclosure Portal</strong> — bill-level lobbying filings (2016–present)</li>
          <li><strong>Journalism</strong> — linked annotations on <Link href="/investigations" style={{ color: 'var(--teal)' }}>/investigations</Link></li>
        </ul>
      </section>

      <section style={{ marginBottom: '2.5rem' }}>
        <div style={{ fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '1rem' }}>
          Update cadence
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--text)', lineHeight: 1.85 }}>
          Filing data is refreshed after each quarterly disclosure deadline. Lobbyist data refreshes on the
          semi-annual compensation report cycle. All aggregates are recomputed from raw files on each refresh.
        </p>
      </section>

      <section style={{ marginBottom: '2.5rem' }}>
        <div style={{ fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '1rem' }}>
          Limits &amp; caveats
        </div>
        <ul style={{ fontSize: '0.78rem', color: 'var(--text)', lineHeight: 1.85, paddingLeft: '1.25rem' }}>
          <li>Donor name deduplication is heuristic. "John Smith" in one filing may or may not be the same "John Smith" in another.</li>
          <li>Industry classification is rules-based on occupation text — accuracy varies by field.</li>
          <li>Lobbyist compensation is self-reported in bands; totals are midpoint estimates.</li>
          <li>Committee party labels are inferred from name keywords, not an official field.</li>
        </ul>
      </section>

      <section>
        <div style={{ fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '1rem' }}>
          Site directory
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem 1.5rem', fontSize: '0.75rem' }}>
          {[
            ['/donors', 'Donors'],
            ['/candidates', 'Candidates'],
            ['/committees', 'Committees'],
            ['/explorer', 'Transaction Explorer'],
            ['/industries', 'Industries'],
            ['/lobbyists', 'Lobbyists'],
            ['/principals', 'Principals'],
            ['/lobbying-firms', 'Lobbying Firms'],
            ['/lobbying', 'Lobbying Hub'],
            ['/cycles', 'Election Cycles'],
            ['/ie', 'Independent Expenditures'],
            ['/elections', 'Election Results'],
            ['/legislature', 'Legislature Hub'],
            ['/legislators', 'Legislators Directory'],
            ['/legislature/committees', 'Legislative Committees'],
            ['/investigations', 'Investigations'],
            ['/network', 'Network Hub'],
            ['/network/graph', 'Network Graph'],
            ['/flow', 'Money Flow'],
            ['/party-finance', 'Party Finance'],
            ['/connections', 'Committee Connections'],
            ['/lobbying/bills', 'Lobbied Bills'],
            ['/search', 'Global Search'],
          ].map(([href, label]) => (
            <Link key={href} href={href} style={{ color: 'var(--teal)', textDecoration: 'none', padding: '0.3rem 0' }}>
              → {label}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
