import Link from 'next/link';
import { getDb } from '@/lib/db';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import SectionHeader from '@/components/shared/SectionHeader';

export const dynamic = 'force-dynamic';

async function getCounts() {
  const db = getDb();
  const [{ count: lobbyists }, { count: principals }, { count: firms }] = await Promise.all([
    db.from('lobbyists').select('*', { count: 'exact', head: true }),
    db.from('principals').select('*', { count: 'exact', head: true }),
    db.from('lobbying_firms').select('*', { count: 'exact', head: true }),
  ]);
  return { lobbyists: lobbyists ?? 0, principals: principals ?? 0, solicitations: 1060, firms: firms ?? 0 };
}

export const metadata = {
  title: 'Lobbying',
  description: 'Lobbyists, principals, and solicitation records for Florida state government.',
};

export default async function LobbyingHub() {
  const counts = await getCounts().catch(() => ({ lobbyists: 0, principals: 0, solicitations: 0 }));

  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <span>Lobbying</span>
      </div>

      <SectionHeader title="Lobbying" eyebrow="FL Lobbying · 2007–present" />
      <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '0.25rem' }}>
        Florida state-registered lobbyists, their principals (clients), and compensation reports going back to 2007.
        Data sourced from the <a href="https://www.floridalobbyist.gov/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>Florida Lobbyist Registration Office</a>.
      </p>

      <div className="hub-grid">
        <Link href="/lobbyists" className="hub-card">
          <div className="hub-card-title">Lobbyists</div>
          <div className="hub-card-desc">Individual lobbyists registered to represent clients before Florida state agencies and the Legislature.</div>
          {counts.lobbyists > 0 && (
            <div className="hub-card-stat">{counts.lobbyists.toLocaleString()} registered lobbyists</div>
          )}
        </Link>

        <Link href="/principals" className="hub-card">
          <div className="hub-card-title">Principals</div>
          <div className="hub-card-desc">Organizations and individuals who hire lobbyists. Cross-referenced with donor records where names match.</div>
          {counts.principals > 0 && (
            <div className="hub-card-stat">{counts.principals.toLocaleString()} principals</div>
          )}
        </Link>

        <Link href="/solicitations" className="hub-card">
          <div className="hub-card-title">Solicitations</div>
          <div className="hub-card-desc">Compensation disclosure filings — how much principals paid lobbyists, by period and agency.</div>
          {counts.solicitations > 0 && (
            <div className="hub-card-stat">{counts.solicitations.toLocaleString()} filings</div>
          )}
        </Link>

        <Link href="/lobbying-firms" className="hub-card">
          <div className="hub-card-title">Lobbying Firms</div>
          <div className="hub-card-desc">Top Florida lobbying firms ranked by estimated client compensation. Quarterly breakdown and full client lists, 2007–present.</div>
          {counts.firms > 0 && (
            <div className="hub-card-stat">{counts.firms.toLocaleString()} firms</div>
          )}
        </Link>

        <Link href="/lobbying/bills" className="hub-card">
          <div className="hub-card-title">Most Lobbied Bills</div>
          <div className="hub-card-desc">Bills with the most lobbyist disclosure filings. Which legislation drew the most registered lobbying activity 2016–2026.</div>
          <div className="hub-card-stat">14,045 bills · 68,785 filings</div>
        </Link>
      </div>

      <DataTrustBlock
        source="Florida Lobbyist Registration Office — Registration & Compensation Reports"
        sourceUrl="https://www.floridalobbyist.gov/"
        lastUpdated="April 2026"
        direct={['lobbyist name', 'principal name', 'registration records', 'quarterly compensation reports (2007–present)']}
        normalized={['firm grouping aggregated from individual lobbyist records', 'compensation totals (midpoints below $50K; exact amounts above)']}
        inferred={['donor cross-references matched by fuzzy name — not confirmed by election authorities']}
        caveats={[
          'Compensation below $50K is disclosed in ranges — we use midpoints. Amounts $50K+ are exact.',
          'Principal-to-donor name matching is inferred and may produce false positives for common names.',
          'Bill lobbying data covers FL House disclosures only (Senate filed separately).',
        ]}
      />
    </main>
  );
}
