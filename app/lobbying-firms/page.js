import Link from 'next/link';
import { getDb } from '@/lib/db';
import DataTrustBlock from '@/components/shared/DataTrustBlock';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Lobbying Firms',
  description: 'Top lobbying firms in Florida by estimated annual compensation.',
};

function fmt(n) {
  if (!n) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export default async function LobbyingFirmsPage() {
  const db = getDb();
  const [{ data: firms }, { count: totalFirms }] = await Promise.all([
    db.from('lobbying_firms')
      .select('slug, firm_name, total_comp, num_principals, num_quarters, first_year, last_year')
      .order('total_comp', { ascending: false })
      .limit(100),
    db.from('lobbying_firms').select('*', { count: 'exact', head: true }),
  ]);

  const rows = firms || [];

  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/lobbying" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Lobbying</Link>
        {' / '}
        <span>Firms</span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', color: 'var(--text)', marginBottom: '0.4rem' }}>
        Lobbying Firms
      </h1>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '0.4rem' }}>
        Top {rows.length} Florida lobbying firms by estimated compensation, 2007–present. Figures are midpoints of FL-mandated
        disclosure bands — not exact amounts. Source:{' '}
        <a href="https://www.floridalobbyist.gov" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>
          Florida Lobbyist Registration Office
        </a>.
      </p>
      <p style={{ color: 'rgba(90,106,136,0.7)', fontSize: '0.72rem', marginBottom: '1.5rem' }}>
        Compensation below $50K is reported in ranges — we use midpoints. Amounts of $50K+ are exact figures reported by the principal.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['#', 'Firm', 'Years', 'Clients', 'Est. Compensation'].map((h, j) => (
                <th key={h} style={{
                  padding: '0.4rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                  textAlign: j === 0 ? 'center' : j >= 2 ? 'right' : 'left',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((f, i) => (
              <tr key={f.slug} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                  {i + 1}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', maxWidth: '340px', wordBreak: 'break-word' }}>
                  <Link href={`/lobbying-firm/${f.slug}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                    {f.firm_name}
                  </Link>
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                  {f.first_year && f.last_year ? `${f.first_year}–${f.last_year}` : '—'}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                  {(f.num_principals || 0).toLocaleString()}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--blue)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {fmt(f.total_comp)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '2rem', fontSize: '0.72rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
        {(totalFirms || 0).toLocaleString()} firms in the full dataset — top {rows.length} shown here. Click any firm to see their full client list and quarterly breakdown.
      </div>

      <div style={{ marginTop: '2rem' }}>
        <DataTrustBlock
          source="Florida Lobbyist Registration Office — Quarterly Compensation Reports"
          sourceUrl="https://www.floridalobbyist.gov"
          lastUpdated="April 2026"
          direct={['firm name', 'client list', 'quarterly compensation reports (2007–present)']}
          normalized={['compensation totals (midpoints for amounts under $50K; exact amounts above $50K)']}
          caveats={[
            'Compensation below $50,000 is reported in ranges — we use midpoints for aggregation.',
            'Amounts of $50,000+ are exact figures reported by the principal.',
            'Both legislative and executive branch lobbying are included.',
          ]}
        />
      </div>
    </main>
  );
}
