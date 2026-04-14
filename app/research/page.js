import Link from 'next/link';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import SectionHeader from '@/components/shared/SectionHeader';

export const dynamic = 'force-dynamic';

async function getCycleCounts() {
  // Cycle counts derived from static data — no Supabase query needed
  return 10; // 2008–2026 cycles
}

export const metadata = {
  title: 'Research',
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

      <SectionHeader title="Research" eyebrow="Florida Campaign Finance · Analysis" />
      <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '0.25rem' }}>
        Analysis tools, investigations, and reference material for understanding Florida campaign finance patterns.
      </p>

      <div className="hub-grid">
        <Link href="/cycles" className="hub-card">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--teal)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.25rem', opacity: 0.8 }}>
            <rect x="3" y="4" width="14" height="13" rx="1.5" />
            <line x1="3" y1="8" x2="17" y2="8" />
            <line x1="7" y1="2" x2="7" y2="6" />
            <line x1="13" y1="2" x2="13" y2="6" />
            <line x1="6" y1="12" x2="8" y2="12" />
            <line x1="12" y1="12" x2="14" y2="12" />
          </svg>
          <div className="hub-card-title">Election Cycles</div>
          <div className="hub-card-desc">Compare fundraising and spending patterns across election years. See how money moved in each cycle.</div>
          {cycleCount > 0 && (
            <div className="hub-card-stat">{cycleCount} cycles tracked</div>
          )}
        </Link>

        <Link href="/industries" className="hub-card">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--orange)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.25rem', opacity: 0.8 }}>
            <line x1="2" y1="17" x2="18" y2="17" />
            <rect x="3" y="9" width="3" height="8" rx="0.5" />
            <rect x="8" y="6" width="3" height="11" rx="0.5" />
            <rect x="13" y="11" width="3" height="6" rx="0.5" />
          </svg>
          <div className="hub-card-title">Industries</div>
          <div className="hub-card-desc">Aggregate giving by industry sector — real estate, healthcare, finance, energy, and more.</div>
          <div className="hub-card-stat">Derived from donor classifications</div>
        </Link>

        <Link href="/investigations" className="hub-card">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--teal)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.25rem', opacity: 0.8 }}>
            <circle cx="9" cy="9" r="5" />
            <line x1="13" y1="13" x2="17" y2="17" />
          </svg>
          <div className="hub-card-title">Investigations</div>
          <div className="hub-card-desc">Sourced deep-dives into specific donors, committees, and funding networks. Linked to primary documents.</div>
        </Link>

        <Link href="/methodology" className="hub-card">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--teal)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.25rem', opacity: 0.8 }}>
            <path d="M5 2h8l4 4v13H5z" />
            <polyline points="13,2 13,6 17,6" />
            <line x1="7" y1="10" x2="13" y2="10" />
            <line x1="7" y1="13" x2="13" y2="13" />
            <line x1="7" y1="16" x2="10" y2="16" />
          </svg>
          <div className="hub-card-title">Methodology</div>
          <div className="hub-card-desc">How data is collected, normalized, classified, and deduplicated. What&apos;s direct vs. inferred.</div>
        </Link>

        <Link href="/party-finance" className="hub-card">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.25rem', opacity: 0.8 }}>
            <rect x="3" y="9" width="5" height="8" rx="0.5" stroke="var(--republican)" />
            <rect x="12" y="6" width="5" height="11" rx="0.5" stroke="var(--democrat)" />
            <line x1="2" y1="17" x2="18" y2="17" stroke="var(--text-dim)" />
          </svg>
          <div className="hub-card-title">Party Finance</div>
          <div className="hub-card-desc">Republican vs Democrat fundraising by year, office, and candidate. Hard and soft money trends 2012–2026.</div>
          <div className="hub-card-stat">$657M tracked across 19 parties</div>
        </Link>

        <Link href="/elections" className="hub-card">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--teal)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.25rem', opacity: 0.8 }}>
            <rect x="4" y="3" width="12" height="15" rx="1.5" />
            <polyline points="7,11 9,13 13,8" />
          </svg>
          <div className="hub-card-title">Election Results</div>
          <div className="hub-card-desc">Precinct-level results for Florida generals and primaries 2012–2024, with cost-per-vote analysis for candidates with finance records.</div>
          <div className="hub-card-stat">12 elections · 2012–2024</div>
        </Link>

        <Link href="/legislature" className="hub-card">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--orange)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.25rem', opacity: 0.8 }}>
            <polyline points="2,7 10,2 18,7" />
            <line x1="2" y1="7" x2="18" y2="7" />
            <line x1="2" y1="18" x2="18" y2="18" />
            <line x1="5" y1="7" x2="5" y2="18" />
            <line x1="10" y1="7" x2="10" y2="18" />
            <line x1="15" y1="7" x2="15" y2="18" />
          </svg>
          <div className="hub-card-title">Legislature</div>
          <div className="hub-card-desc">160 current FL House + Senate members — voting records, committee assignments, campaign finance, and who funds them.</div>
          <div className="hub-card-stat">160 members · 65 committees · 30K+ floor votes</div>
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
