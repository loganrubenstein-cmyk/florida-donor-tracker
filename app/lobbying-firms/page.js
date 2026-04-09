import { readFileSync } from 'fs';
import { join } from 'path';
import Link from 'next/link';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Lobbying Firms — Florida Donor Tracker',
  description: 'Top lobbying firms in Florida by estimated annual compensation.',
};

function fmt(n) {
  if (!n) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function loadTopFirms() {
  const path = join(process.cwd(), 'public', 'data', 'lobbyist_comp', 'top_firms.json');
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export default function LobbyingFirmsPage() {
  const firms = loadTopFirms();

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
        Top {firms.length} Florida lobbying firms by estimated compensation. Figures are midpoints of FL-mandated
        disclosure bands — not exact amounts. Data from the Florida Lobbyist Registration Office.
      </p>
      <p style={{ color: 'rgba(90,106,136,0.7)', fontSize: '0.72rem', marginBottom: '1.5rem' }}>
        Compensation is self-reported in ranges (&lt;$10K, $10K–$24K, $25K–$49K, etc.). Totals shown are midpoint estimates.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['#', 'Firm', 'Clients', 'Quarters', 'Est. Compensation'].map((h, j) => (
                <th key={h} style={{
                  padding: '0.4rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                  textAlign: j === 0 ? 'center' : j >= 2 ? 'right' : 'left',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {firms.map((f, i) => (
              <tr key={f.slug} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                  {i + 1}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', maxWidth: '340px', wordBreak: 'break-word' }}>
                  <Link href={`/lobbying-firm/${f.slug}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                    {f.firm_name}
                  </Link>
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                  {(f.num_principals || 0).toLocaleString()}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                  {f.num_quarters || '—'}
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
        439 registered firms in the full dataset — top 100 shown here. Click any firm to see their full client list and quarterly breakdown.
      </div>
    </main>
  );
}
