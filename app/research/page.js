import Link from 'next/link';
import DataTrustBlock from '@/components/shared/DataTrustBlock';

export const dynamic = 'force-dynamic';

async function getCycleCounts() {
  // Cycle counts derived from static data — no Supabase query needed
  return 10; // 2008–2026 cycles
}

export const metadata = {
  title: 'Research — Florida Donor Tracker',
  description: 'Cycles, industries, investigations, and methodology for Florida campaign finance research.',
};

export default async function ResearchHub() {
  const cycleCount = await getCycleCounts().catch(() => 0);

  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <span>Research</span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', color: 'var(--text)', marginBottom: '0.5rem' }}>
        Research
      </h1>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '0.25rem' }}>
        Analysis tools, investigations, and reference material for understanding Florida campaign finance patterns.
      </p>

      <div className="hub-grid">
        <Link href="/cycles" className="hub-card">
          <div className="hub-card-title">Election Cycles</div>
          <div className="hub-card-desc">Compare fundraising and spending patterns across election years. See how money moved in each cycle.</div>
          {cycleCount > 0 && (
            <div className="hub-card-stat">{cycleCount} cycles tracked</div>
          )}
        </Link>

        <Link href="/industries" className="hub-card">
          <div className="hub-card-title">Industries</div>
          <div className="hub-card-desc">Aggregate giving by industry sector — real estate, healthcare, finance, energy, and more.</div>
          <div className="hub-card-stat">Derived from donor classifications</div>
        </Link>

        <Link href="/investigations" className="hub-card">
          <div className="hub-card-title">Investigations</div>
          <div className="hub-card-desc">Sourced deep-dives into specific donors, committees, and funding networks. Linked to primary documents.</div>
        </Link>

        <Link href="/methodology" className="hub-card">
          <div className="hub-card-title">Methodology</div>
          <div className="hub-card-desc">How data is collected, normalized, classified, and deduplicated. What&apos;s direct vs. inferred.</div>
        </Link>

        <Link href="/party-finance" className="hub-card">
          <div className="hub-card-title">Party Finance</div>
          <div className="hub-card-desc">Republican vs Democrat fundraising by year, office, and candidate. Hard and soft money trends 2012–2026.</div>
          <div className="hub-card-stat">$657M tracked across 19 parties</div>
        </Link>

        <Link href="/elections" className="hub-card">
          <div className="hub-card-title">Election Results</div>
          <div className="hub-card-desc">Precinct-level results for Florida generals and primaries 2012–2024, with cost-per-vote analysis for candidates with finance records.</div>
          <div className="hub-card-stat">12 elections · 2012–2024</div>
        </Link>

        <Link href="/legislators" className="hub-card">
          <div className="hub-card-title">Legislators</div>
          <div className="hub-card-desc">Current Florida House and Senate members. Floor vote records, party breakdown, and campaign finance cross-references.</div>
          <div className="hub-card-stat">224 legislators · 546 roll calls tracked</div>
        </Link>
      </div>

      <DataTrustBlock
        source="Florida Division of Elections · FL House Lobbyist Disclosure Portal · LegiScan"
        sourceUrl="https://dos.elections.myflorida.com/campaign-finance/"
        lastUpdated="April 2026"
        direct={['contribution amounts', 'filing dates', 'lobbyist registrations', 'bill disclosures']}
        normalized={['donor names deduplicated across committees', 'industry classifications']}
        inferred={['industry bucket from occupation keywords', 'party-linked PAC totals']}
        caveats={[
          'Finance data covers Florida state-level races only. Federal candidates are excluded.',
          'Industry classifications are automated — some donors may be miscategorized.',
          'Lobbying compensation is disclosed in ranges, not exact figures.',
        ]}
      />
    </main>
  );
}
