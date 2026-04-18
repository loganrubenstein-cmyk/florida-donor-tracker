import Link from 'next/link';
import { getDb } from '@/lib/db';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import SectionHeader from '@/components/shared/SectionHeader';
import { fmtMoneyCompact } from '@/lib/fmt';

export const dynamic = 'force-dynamic';

async function getData() {
  const db = getDb();
  const [{ count: lobbyists }, { count: principals }, { count: firms }, { data: topFirms }] = await Promise.all([
    db.from('lobbyists').select('*', { count: 'exact', head: true }),
    db.from('principals').select('*', { count: 'exact', head: true }),
    db.from('lobbying_firms').select('*', { count: 'exact', head: true }),
    db.from('lobbying_firms')
      .select('slug, firm_name, total_comp, num_principals, num_years, first_year, last_year')
      .order('total_comp', { ascending: false })
      .limit(10),
  ]);
  return {
    lobbyists: lobbyists ?? 0,
    principals: principals ?? 0,
    firms: firms ?? 0,
    topFirms: topFirms || [],
  };
}

export const metadata = {
  title: 'Lobbying',
  description: 'Lobbyists, principals, and solicitation records for Florida state government.',
};

export default async function LobbyingHub() {
  const { lobbyists, principals, firms, topFirms } = await getData().catch(() => ({
    lobbyists: 0, principals: 0, firms: 0, topFirms: [],
  }));

  const maxComp = topFirms.length > 0 ? parseFloat(topFirms[0].total_comp) : 1;

  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <span>Lobbying</span>
      </div>

      <SectionHeader title="Lobbying" eyebrow="FL Lobbying · 2007–present" />
      <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '2rem' }}>
        Florida state-registered lobbyists, their principals (clients), and compensation reports going back to 2007.
        Data sourced from the <a href="https://www.floridalobbyist.gov/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>Florida Lobbyist Registration Office</a>.
      </p>

      {/* ── Top Lobbying Firms ranking ─────────────────────────────────────────── */}
      {topFirms.length > 0 && (
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Top Lobbying Firms by Est. Compensation
            </div>
            <Link href="/lobbying-firms" style={{ fontSize: '0.65rem', color: 'var(--teal)', textDecoration: 'none' }}>
              View all {firms.toLocaleString()} firms →
            </Link>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                  {['#', 'Firm', 'Est. Total Comp', 'Clients', 'Years'].map((h, j) => (
                    <th key={h} style={{
                      padding: '0.4rem 0.75rem', fontSize: '0.58rem', color: 'var(--text-dim)',
                      textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                      textAlign: j >= 2 ? 'right' : 'left',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topFirms.map((firm, i) => {
                  const comp = parseFloat(firm.total_comp) || 0;
                  const barPct = (comp / maxComp * 100).toFixed(1);
                  return (
                    <tr key={firm.slug} style={{
                      borderBottom: i < topFirms.length - 1 ? '1px solid rgba(100,140,220,0.06)' : 'none',
                      background: `linear-gradient(to right, rgba(100,140,220,0.05) ${barPct}%, transparent ${barPct}%)`,
                    }}>
                      <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', width: '2rem' }}>
                        {i + 1}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem' }}>
                        <Link href={`/lobbying-firm/${firm.slug}`} style={{ color: 'var(--teal)', textDecoration: 'none', fontSize: '0.78rem', fontWeight: 500 }}>
                          {firm.firm_name}
                        </Link>
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--orange)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {fmtMoneyCompact(comp)}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                        {firm.num_principals?.toLocaleString() || '—'}
                      </td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                        {firm.first_year}–{firm.last_year}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Hub nav cards — Firms first, Lobbyists last ───────────────────────── */}
      <div className="hub-grid">
        <Link href="/lobbying-firms" className="hub-card">
          <div className="hub-card-title">Lobbying Firms</div>
          <div className="hub-card-desc">Top Florida lobbying firms ranked by estimated client compensation. Full client lists and quarterly breakdowns, 2007–present.</div>
          {firms > 0 && <div className="hub-card-stat">{firms.toLocaleString()} firms</div>}
        </Link>

        <Link href="/principals" className="hub-card">
          <div className="hub-card-title">Principals</div>
          <div className="hub-card-desc">Organizations and individuals who hire lobbyists. Cross-referenced with donor records where names match.</div>
          {principals > 0 && <div className="hub-card-stat">{principals.toLocaleString()} principals</div>}
        </Link>

        <Link href="/lobbying/bills" className="hub-card">
          <div className="hub-card-title">Most Lobbied Bills</div>
          <div className="hub-card-desc">Bills with the most lobbyist disclosure filings. Which legislation drew the most registered lobbying activity 2017–2026.</div>
          <div className="hub-card-stat">14,045 bills · 68,785 filings</div>
        </Link>

        <Link href="/influence" className="hub-card">
          <div className="hub-card-title">Influence Index</div>
          <div className="hub-card-desc">Organizations ranked by combined political spending — lobbying compensation plus campaign donations.</div>
          <div className="hub-card-stat">$20.9B tracked · 3,393 orgs</div>
        </Link>

        <Link href="/solicitations" className="hub-card">
          <div className="hub-card-title">Solicitations</div>
          <div className="hub-card-desc">Compensation disclosure filings — how much principals paid lobbyists, by period and agency.</div>
          <div className="hub-card-stat">1,060 filings</div>
        </Link>

        <Link href="/lobbyists" className="hub-card" style={{ opacity: 0.75 }}>
          <div className="hub-card-title">Individual Lobbyists</div>
          <div className="hub-card-desc">Search registered lobbyists by name. Includes principal relationships and firm affiliations.</div>
          {lobbyists > 0 && <div className="hub-card-stat">{lobbyists.toLocaleString()} registered</div>}
        </Link>
      </div>

      <DataTrustBlock
        source="Florida Lobbyist Registration Office — Registration & Compensation Reports"
        sourceUrl="https://www.floridalobbyist.gov/"
        direct={['lobbyist name', 'principal name', 'registration records', 'quarterly compensation reports (2007–present)']}
        normalized={['firm grouping aggregated from individual lobbyist records', 'compensation totals (midpoints below $50K; exact amounts above)', 'firm totals are the sum of each lobbyist\'s reported firm-level comp — ranking order is correct but absolute dollar amounts are overstated']}
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
