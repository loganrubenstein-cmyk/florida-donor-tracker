import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import Link from 'next/link';

export const dynamic = 'force-static';

const FIRMS_DIR = join(process.cwd(), 'public', 'data', 'lobbyist_comp', 'by_firm');

function loadFirm(slug) {
  return JSON.parse(readFileSync(join(FIRMS_DIR, `${slug}.json`), 'utf-8'));
}

export async function generateStaticParams() {
  if (!existsSync(FIRMS_DIR)) return [];
  return readdirSync(FIRMS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => ({ slug: f.replace('.json', '') }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const d = loadFirm(slug);
    return { title: `${d.firm_name} — Lobbying Firm | FL Donor Tracker` };
  } catch {
    return { title: 'Lobbying Firm | FL Donor Tracker' };
  }
}

function fmt(n) {
  if (!n) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export default async function LobbyingFirmPage({ params }) {
  const { slug } = await params;
  const firm = loadFirm(slug);

  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/lobbying" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Lobbying</Link>
        {' / '}
        <Link href="/lobbying-firms" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Firms</Link>
        {' / '}
        <span>{firm.firm_name}</span>
      </div>

      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{
            fontSize: '0.65rem', padding: '0.15rem 0.5rem',
            border: '1px solid var(--blue)', color: 'var(--blue)',
            borderRadius: '2px', fontFamily: 'var(--font-mono)',
          }}>
            LOBBYING FIRM
          </span>
        </div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.4rem, 3vw, 2rem)',
          fontWeight: 400, color: '#fff', lineHeight: 1.2, marginBottom: '0.4rem',
        }}>
          {firm.firm_name}
        </h1>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '1px', background: 'var(--border)', border: '1px solid var(--border)',
        borderRadius: '3px', marginBottom: '2rem', overflow: 'hidden',
      }}>
        {[
          { label: 'Est. Compensation', value: fmt(firm.total_comp), color: 'var(--blue)' },
          { label: 'Clients',           value: (firm.num_principals || 0).toLocaleString() },
          { label: 'Quarters',          value: firm.num_quarters || '—' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: 'var(--bg)', padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>
              {label}
            </div>
            <div style={{ fontSize: '1rem', color: color || 'var(--orange)', fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: '0.7rem', color: 'rgba(90,106,136,0.7)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
        Compensation figures are midpoints of FL-mandated disclosure bands — not exact amounts.
      </div>

      {/* Top clients */}
      {firm.top_clients?.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
            Top Clients — {firm.top_clients.length} shown
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['#', 'Client', 'Est. Paid'].map((h, j) => (
                  <th key={h} style={{
                    padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                    textAlign: j === 0 ? 'center' : j === 2 ? 'right' : 'left',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {firm.top_clients.map((c, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>{i + 1}</td>
                  <td style={{ padding: '0.4rem 0.6rem', maxWidth: '400px', wordBreak: 'break-word' }}>
                    <Link href={`/principal/${c.slug}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                      {c.principal_name}
                    </Link>
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--blue)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {fmt(c.total_comp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Quarterly breakdown */}
      {firm.by_quarter?.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
            Quarterly Breakdown
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Period', 'Branch', 'Clients', 'Est. Comp'].map((h, j) => (
                  <th key={h} style={{
                    padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                    textAlign: j >= 2 ? 'right' : 'left',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {firm.by_quarter.map((q, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                    {q.year} Q{q.quarter}
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                    {q.branch}
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                    {(q.num_principals || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--blue)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {fmt(q.total_comp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
        Data: Florida Lobbyist Registration Office · Compensation amounts are range midpoints, not exact figures.
      </div>
    </main>
  );
}
