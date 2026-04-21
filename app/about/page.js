import Link from 'next/link';

export const metadata = {
  title: 'About — Florida Influence',
  description: 'The most complete picture of Florida political influence — free from public records. 22M transactions, $34.9B lobbying, 30 years, 160 legislators.',
};

const DIFFERENTIATORS = [
  {
    title: 'Not just donations — lobbying too',
    color: 'var(--teal)',
    body: 'Every other FL tracker covers campaign finance. We also have 4 million rows of lobbyist compensation — 19 years, 1,970 firms, $34.9B. Cross-referenced to the same donor profiles.',
  },
  {
    title: 'Shadow networks, not just top donors',
    color: 'var(--orange)',
    body: '431 shadow PAC organizations. 56,000+ committee-to-committee pairs. The Connections tool shows who shares treasurers, addresses, and donors — the coordination layer most tools ignore.',
  },
  {
    title: 'Free, no paywall, no account',
    color: 'var(--green)',
    body: 'Commercial tools cost thousands. Government portals are unusable. Florida public records should be publicly accessible — every tool on this site is free with no signup required.',
  },
];

const SOURCES = [
  { name: 'Florida Division of Elections',          url: 'https://dos.fl.gov/elections/campaign-finance/', note: 'Campaign contributions 1996–present' },
  { name: 'FL Lobbyist Registration Office',        url: 'https://www.leg.state.fl.us/Lobbyist/',          note: 'Registrations, principals, comp reports' },
  { name: 'LegiScan',                               url: 'https://legiscan.com/',                           note: 'Floor votes, bill text, sponsorships' },
  { name: 'FL House Lobbyist Disclosure Portal',    url: 'https://www.flhouse.gov/lobbyists/',              note: 'Bill-level lobbying filings 2016–present' },
  { name: 'USASpending.gov',                        url: 'https://www.usaspending.gov/',                    note: 'Federal contracts, FL recipients FY2020–2025' },
  { name: 'FL Accountability Contract Tracking',    url: 'https://apps.fldfs.com/FACTS/',                   note: 'State contracts, purchase orders' },
];

const CREDIBILITY_STATS = [
  { val: '22M+',     label: 'transactions',        color: 'var(--orange)', detail: 'individual contribution records · 1996–2026' },
  { val: '$34.9B',   label: 'lobbying tracked',    color: 'var(--teal)',   detail: '4M rows · 1,970 firms · 19 years' },
  { val: '30 years', label: 'of public records',   color: 'var(--blue)',   detail: 'the longest-running free FL finance database' },
  { val: '160',      label: 'legislators',         color: 'var(--green)',  detail: 'donors · votes · lobbyist connections · disclosures' },
];

const SITE_DIRECTORY = [
  ['Money & Finance', [
    ['/donors', 'Donors'], ['/candidates', 'Candidates'], ['/committees', 'Committees'],
    ['/explorer', 'Transaction Explorer'], ['/industries', 'Industries'],
    ['/cycles', 'Election Cycles'], ['/elections', 'Election Results'],
    ['/party-finance', 'Party Finance'], ['/ie', 'Independent Expenditures'],
    ['/pulse', 'Pulse'],
  ]],
  ['Lobbying', [
    ['/lobbyists', 'Lobbyists'], ['/principals', 'Principals'],
    ['/lobbying-firms', 'Lobbying Firms'], ['/lobbying', 'Lobbying Hub'],
    ['/lobbying/bills', 'Lobbied Bills'], ['/solicitations', 'Solicitations'],
  ]],
  ['Legislature & Government', [
    ['/legislature', 'Legislature Hub'], ['/legislators', 'Legislators Directory'],
    ['/legislature/committees', 'Legislative Committees'],
    ['/contracts', 'State Contracts'], ['/federal-contracts', 'Federal Contracts'],
  ]],
  ['Tools & Analysis', [
    ['/tools', 'Tools Hub'], ['/follow', 'Follow the Money'], ['/flow', 'Money Flow'],
    ['/influence', 'Influence Index'], ['/connections', 'Committee Connections'],
    ['/decode', 'Committee Decoder'], ['/compare', 'Donor Overlap'],
    ['/who-funds', 'Who Funds Your District'], ['/races/2026', '2026 Money Race'],
    ['/timeline', 'Influence Timeline'], ['/transparency', 'Dark Money Scoreboard'],
    ['/map', 'Geographic Map'], ['/tools/bipartisan', 'Party Cross-Reference'],
    ['/investigations', 'Investigations'],
  ]],
];

export default function AboutPage() {
  return (
    <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '2.5rem 2.5rem 5rem' }}>
      <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)', marginBottom: '2rem' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <span>About</span>
      </div>

      {/* Mission banner */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '4rem', alignItems: 'start', marginBottom: '4rem' }}>
        <div>
          <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.13em', color: 'var(--text-dim)', marginBottom: '1rem' }}>
            Florida Influence · Mission
          </div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.6rem, 3.5vw, 2.3rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1.25rem' }}>
            Florida's political money<br />should be <span style={{ color: 'var(--orange)' }}>public knowledge.</span>
          </h1>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-dim)', lineHeight: 1.8, marginBottom: '1.1rem', maxWidth: '540px' }}>
            Billions flow between donors, committees, and campaigns every cycle in Florida — but the trail is buried in raw government files that almost no one reads. This site changes that.
          </p>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-dim)', lineHeight: 1.8, maxWidth: '540px', marginBottom: '2rem' }}>
            We pull every contribution record, lobbying filing, vote, and disclosure from Florida's public records and make the connections visible — for voters, journalists, researchers, and anyone who wants the full picture.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {[
              { label: 'Free, no account required', color: 'var(--green)' },
              { label: 'Public records only',        color: 'var(--teal)' },
              { label: 'Updated quarterly',          color: 'var(--blue)' },
              { label: 'No spin, no agenda',         color: 'var(--text-dim)' },
            ].map(p => (
              <span key={p.label} style={{ fontSize: '0.63rem', padding: '0.25rem 0.65rem', borderRadius: '2px', color: p.color, border: `1px solid ${p.color}44`, background: `${p.color}08`, fontFamily: 'var(--font-mono)' }}>
                {p.label}
              </span>
            ))}
          </div>
        </div>

        {/* Credibility stats */}
        <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '1.5rem', background: 'var(--surface)' }}>
          <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: '1rem' }}>
            By the numbers
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            {CREDIBILITY_STATS.map(s => (
              <div key={s.val} style={{ borderLeft: `2px solid ${s.color}55`, paddingLeft: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.15rem' }}>
                  <span style={{ fontSize: '1.3rem', fontWeight: 700, color: s.color, letterSpacing: '-0.01em' }}>{s.val}</span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text)', fontWeight: 600 }}>{s.label}</span>
                </div>
                <div style={{ fontSize: '0.63rem', color: 'var(--text-dim)' }}>{s.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* How we're different */}
      <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.13em', color: 'var(--text-dim)', marginBottom: '1.25rem' }}>
        How we're different
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '4rem' }}>
        {DIFFERENTIATORS.map(d => (
          <div key={d.title} style={{ border: `1px solid ${d.color}22`, borderRadius: '4px', padding: '1.35rem 1.4rem', background: `${d.color}04` }}>
            <div style={{ fontSize: '0.73rem', fontWeight: 700, color: d.color, marginBottom: '0.6rem', lineHeight: 1.35 }}>{d.title}</div>
            <div style={{ fontSize: '0.73rem', color: 'var(--text-dim)', lineHeight: 1.7 }}>{d.body}</div>
          </div>
        ))}
      </div>

      {/* What you can find */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', marginBottom: '4rem' }}>
        <div>
          <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.13em', color: 'var(--text-dim)', marginBottom: '1.25rem' }}>
            What you can find here
          </div>
          {[
            ['Who gave the most', 'to whom, and when — from a single $25 contribution to $10M mega-donors.'],
            ['How the money flows', 'between donors, committees, candidates, and party organizations.'],
            ['Hard vs. soft money', 'direct candidate contributions vs. PAC/ECO committee spending, per race.'],
            ['Lobbyist connections', 'principals cross-referenced with their donation records.'],
            ['Shadow committee networks', 'PACs sharing treasurers, addresses, donors, or money flows.'],
            ['Legislators and votes', '160 current FL members — campaign finance, committee assignments, vote history.'],
            ['Election results', 'precinct-level results 2012–2024 matched to finance records.'],
            ['State and federal contracts', 'vendors who received government contracts, matched to their campaign donations.'],
          ].map(([title, desc]) => (
            <div key={title} style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.7rem', lineHeight: 1.7 }}>
              <span style={{ color: 'var(--orange)', fontSize: '0.78rem', flexShrink: 0 }}>→</span>
              <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                <strong style={{ color: 'var(--text)' }}>{title}</strong> — {desc}
              </span>
            </div>
          ))}
        </div>

        <div>
          <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.13em', color: 'var(--text-dim)', marginBottom: '1.25rem' }}>
            Data sources
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {SOURCES.map((s, i) => (
              <div key={s.name} style={{ padding: '0.75rem 0', borderBottom: i < SOURCES.length - 1 ? '1px solid rgba(100,140,220,0.08)' : 'none' }}>
                <a href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: 'var(--teal)', textDecoration: 'none', display: 'block', marginBottom: '0.15rem' }}>
                  → {s.name}
                </a>
                <div style={{ fontSize: '0.64rem', color: 'var(--text-dim)' }}>{s.note}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '1.5rem' }}>
            <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.13em', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
              Update cadence
            </div>
            <p style={{ fontSize: '0.73rem', color: 'var(--text-dim)', lineHeight: 1.7 }}>
              Filing data refreshes after each quarterly disclosure deadline. Lobbyist data refreshes on the semi-annual compensation report cycle. All aggregates recomputed from raw files on each refresh.
            </p>
          </div>
        </div>
      </div>

      {/* Caveats */}
      <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '1.5rem', background: 'var(--surface)', marginBottom: '4rem' }}>
        <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.13em', color: 'var(--text-dim)', marginBottom: '1rem' }}>
          Limits &amp; caveats
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 2rem' }}>
          {[
            'Donor name deduplication is heuristic — "John Smith" across two filings may or may not be the same person.',
            'Industry classification is rules-based on occupation text — accuracy varies by field quality.',
            'Lobbyist compensation below $50K is self-reported in $10K bands; we use midpoint estimates.',
            'Committee party labels are inferred from name keywords, not an official FL DOE field.',
          ].map(c => (
            <div key={c} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.71rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
              <span style={{ color: 'var(--border)', flexShrink: 0 }}>·</span>
              <span>{c}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <Link href="/methodology" style={{ fontSize: '0.72rem', color: 'var(--teal)', textDecoration: 'none' }}>
            → Full methodology and confidence labels
          </Link>
          <span style={{ color: 'var(--text-dim)', fontSize: '0.68rem', marginLeft: '1rem' }}>
            <Link href="/coverage" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>→ Coverage &amp; limits</Link>
          </span>
        </div>
      </div>

      {/* Press / contact */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '4rem' }}>
        <div style={{ border: '1px solid rgba(255,176,96,0.2)', borderRadius: '4px', padding: '1.35rem 1.5rem', background: 'rgba(255,176,96,0.03)' }}>
          <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--orange)', marginBottom: '0.6rem' }}>
            For journalists
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text)', fontWeight: 600, marginBottom: '0.4rem' }}>
            Using this for a story?
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', lineHeight: 1.65, marginBottom: '1rem' }}>
            All data is exportable to CSV. Every figure is sourced from Florida Division of Elections public records. The methodology page documents data confidence levels.
          </div>
          <Link href="/tools/journalists" style={{ fontSize: '0.72rem', color: 'var(--orange)', textDecoration: 'none', border: '1px solid rgba(255,176,96,0.3)', borderRadius: '3px', padding: '0.35rem 0.75rem', display: 'inline-block' }}>
            → Journalist tools
          </Link>
        </div>
        <div style={{ border: '1px solid rgba(77,216,240,0.2)', borderRadius: '4px', padding: '1.35rem 1.5rem', background: 'rgba(77,216,240,0.03)' }}>
          <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--teal)', marginBottom: '0.6rem' }}>
            Contact & feedback
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text)', fontWeight: 600, marginBottom: '0.4rem' }}>
            Found an error? Have a tip?
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', lineHeight: 1.65, marginBottom: '1rem' }}>
            Data errors, missing committees, or story tips about Florida political money — we want to know. Every correction improves the record.
          </div>
          <a href="mailto:press@floridainfluence.com" style={{ fontSize: '0.72rem', color: 'var(--teal)', textDecoration: 'none', border: '1px solid rgba(77,216,240,0.3)', borderRadius: '3px', padding: '0.35rem 0.75rem', display: 'inline-block' }}>
            → press@floridainfluence.com
          </a>
        </div>
      </div>

      {/* Site directory */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '2.5rem' }}>
        <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.13em', color: 'var(--text-dim)', marginBottom: '1.5rem' }}>
          Site directory
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2rem' }}>
          {SITE_DIRECTORY.map(([section, links]) => (
            <div key={section}>
              <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
                {section}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {links.map(([href, label]) => (
                  <Link key={href} href={href} style={{ fontSize: '0.71rem', color: 'var(--teal)', textDecoration: 'none' }}>
                    → {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
