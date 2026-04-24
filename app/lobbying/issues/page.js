import Link from 'next/link';
import { getDb } from '@/lib/db';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import { fmtCount } from '@/lib/fmt';

export const revalidate = 1800;

export const metadata = {
  title: 'Lobbying Issue Areas',
  description: 'Florida legislative issue areas by lobbying activity — principals, lobbyists, firms, and bills tracked per issue 2017–present.',
};

async function getData() {
  const db = getDb();
  const { data } = await db
    .from('lobby_issue_summary')
    .select('issue, total_disclosures, num_principals, num_lobbyists, num_firms, num_bills, earliest_year, latest_year')
    .order('total_disclosures', { ascending: false });
  return data || [];
}

export default async function LobbyingIssuesPage() {
  const issues = await getData().catch(() => []);
  const maxDisclosures = issues[0]?.total_disclosures || 1;

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/lobbying" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Lobbying</Link>
        {' / '}
        <span>Issue Areas</span>
      </div>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: '0.75rem' }}>
        FL LOBBYING · ISSUE AREAS · 2017–PRESENT
      </div>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: '0.75rem' }}>
        What is Florida being lobbied on?
      </h1>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '0.5rem', maxWidth: '680px' }}>
        {issues.length.toLocaleString()} legislative issue categories tracked across lobbyist disclosure filings.
        Each row shows how many principals paid lobbyists to work on that issue — the higher the disclosure count, the more sustained the lobbying effort.
      </p>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', lineHeight: 1.5, marginBottom: '2rem', maxWidth: '680px' }}>
        Issue categories are defined by the{' '}
        <a href="https://www.floridalobbyist.gov" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>
          FL Lobbyist Registration Office
        </a>{' '}
        and reported on each disclosure filing. A single principal may report multiple issues per quarter.
      </p>

      <div style={{ border: '1px solid var(--border)', borderRadius: '3px', overflow: 'hidden', marginBottom: '2rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
              {['#', 'Issue Area', 'Disclosures', 'Principals', 'Lobbyists', 'Firms', 'Bills'].map((h, j) => (
                <th key={h} style={{
                  padding: '0.5rem 0.75rem', fontSize: '0.58rem', color: 'var(--text-dim)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                  textAlign: j <= 1 ? 'left' : 'right',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {issues.map((row, i) => {
              const barPct = ((row.total_disclosures / maxDisclosures) * 100).toFixed(1);
              return (
                <tr key={row.issue} style={{
                  borderBottom: '1px solid rgba(100,140,220,0.06)',
                  background: `linear-gradient(to right, rgba(77,216,240,0.04) ${barPct}%, transparent ${barPct}%)`,
                }}>
                  <td style={{ padding: '0.45rem 0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', width: '2.5rem' }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: '0.45rem 0.75rem', fontWeight: 500, maxWidth: '300px' }}>
                    {row.issue}
                  </td>
                  <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--teal)', fontWeight: 600 }}>
                    {fmtCount(row.total_disclosures)}
                  </td>
                  <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                    {(row.num_principals || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                    {(row.num_lobbyists || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                    {(row.num_firms || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                    {(row.num_bills || 0).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <DataTrustBlock
        source="Florida Lobbyist Registration Office — Disclosure Filings 2017–present"
        sourceUrl="https://www.floridalobbyist.gov"
        direct={['issue categories (as reported on each disclosure)', 'principal and lobbyist counts per issue']}
        normalized={['disclosure counts aggregated across all quarters and years']}
        caveats={[
          'Issue categories are self-reported by lobbyists on disclosure filings — same issue may use slightly different labels across filers.',
          'A single principal can report many issues in one quarter; disclosure count ≠ number of principals.',
          'Data covers FL House disclosures 2017–present. Senate disclosures filed separately.',
        ]}
      />
    </main>
  );
}
