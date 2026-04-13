import Link from 'next/link';
import { getDb } from '@/lib/db';
import { notFound } from 'next/navigation';
import SourceLink from '@/components/shared/SourceLink';
import DataTrustBlock from '@/components/shared/DataTrustBlock';

export const dynamic = 'force-dynamic';

function fmt(n) {
  if (!n) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const db = getDb();
  const { data } = await db
    .from('lobbying_firms')
    .select('firm_name, total_comp, num_principals')
    .eq('slug', slug)
    .maybeSingle();
  if (!data) return { title: 'Lobbying Firm' };
  const comp = data.total_comp ? `${fmt(parseFloat(data.total_comp))} in compensation` : '';
  const clients = data.num_principals ? `${data.num_principals} clients` : '';
  const parts = [comp, clients].filter(Boolean).join(' across ');
  const desc = `${data.firm_name} — Florida lobbying firm.${parts ? ` ${parts}.` : ''}`;
  return { title: `${data.firm_name} — Lobbying Firm`, description: desc };
}

export default async function LobbyingFirmPage({ params }) {
  const { slug } = await params;
  const db = getDb();

  const [{ data: firm }, { data: clients }, { data: quarters }] = await Promise.all([
    db.from('lobbying_firms')
      .select('slug, firm_name, total_comp, num_principals, num_quarters, first_year, last_year, num_years')
      .eq('slug', slug)
      .maybeSingle(),
    db.from('lobbying_firm_clients')
      .select('principal_name, principal_slug, total_comp, first_year, last_year')
      .eq('firm_slug', slug)
      .order('total_comp', { ascending: false }),
    db.from('lobbying_firm_quarters')
      .select('year, quarter, period, branch, total_comp')
      .eq('firm_slug', slug)
      .order('year', { ascending: false })
      .order('quarter', { ascending: false }),
  ]);

  if (!firm) notFound();

  const { data: lobbyists } = await db
    .from('lobbyists')
    .select('slug, name, num_principals, num_active')
    .eq('firm', firm.firm_name)
    .order('num_active', { ascending: false })
    .limit(50);

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
        <SourceLink type="firm" />
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
          { label: 'Active Since',      value: firm.first_year && firm.last_year ? `${firm.first_year}–${firm.last_year}` : '—' },
          { label: 'Quarters Filed',    value: firm.num_quarters || '—' },
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
      {clients?.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
            Top Clients — {clients.length} shown
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['#', 'Client', 'Years', 'Est. Paid'].map((h, j) => (
                  <th key={h} style={{
                    padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                    textAlign: j === 0 ? 'center' : j === 3 ? 'right' : 'left',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.map((c, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>{i + 1}</td>
                  <td style={{ padding: '0.4rem 0.6rem', maxWidth: '400px', wordBreak: 'break-word' }}>
                    <Link href={`/principal/${c.principal_slug}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                      {c.principal_name}
                    </Link>
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                    {c.first_year && c.last_year ? `${c.first_year}–${c.last_year}` : '—'}
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

      {/* Lobbyists at this firm */}
      {lobbyists?.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
            Lobbyists — {lobbyists.length} registered
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {lobbyists.map(l => (
              <Link key={l.slug} href={`/lobbyist/${l.slug}`} style={{
                padding: '0.25rem 0.6rem', background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: '3px',
                color: l.num_active > 0 ? 'var(--teal)' : 'var(--text-dim)',
                textDecoration: 'none', fontSize: '0.72rem',
              }}>
                {l.name}
                {l.num_active > 0 && (
                  <span style={{ marginLeft: '0.35rem', fontSize: '0.58rem', color: 'var(--text-dim)' }}>
                    {l.num_active} active
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quarterly breakdown */}
      {quarters?.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
            Quarterly Breakdown
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Period', 'Branch', 'Est. Comp'].map((h, j) => (
                  <th key={h} style={{
                    padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                    textAlign: j === 2 ? 'right' : 'left',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quarters.map((q, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                    {q.year} Q{q.quarter}
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                    {q.branch}
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

      {/* Research links */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem', marginBottom: '2rem' }}>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
          Research
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {[
            { label: 'Find Donor Overlap →', href: '/compare' },
            { label: 'All Lobbying Firms →', href: '/lobbying-firms' },
            { label: 'FL Lobbyist Registry →', href: 'https://www.floridalobbyist.gov', external: true },
          ].map(({ label, href, external }) => (
            <Link key={label} href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              style={{
                padding: '0.35rem 0.75rem', border: '1px solid var(--border)',
                color: external ? 'var(--text-dim)' : 'var(--teal)', fontSize: '0.72rem', borderRadius: '3px',
                textDecoration: 'none', fontFamily: 'var(--font-mono)',
              }}>
              {label}
            </Link>
          ))}
        </div>
      </div>

      <DataTrustBlock
        source="Florida Lobbyist Registration Office — Quarterly Compensation Reports"
        sourceUrl="https://www.floridalobbyist.gov"
        lastUpdated="April 2026"
        direct={['firm name', 'client list', 'quarterly compensation reports (2007–present)']}
        normalized={['compensation totals (summed from band midpoints for amounts under $50K; exact amounts above $50K)']}
        caveats={[
          'Compensation below $50,000 is reported in ranges ($1–$9,999, $10K–$19,999, etc.) — we use midpoints for aggregation.',
          'Amounts of $50,000+ are exact figures reported by the principal.',
          'Both legislative and executive branch lobbying are included.',
          'Data covers 2007–present; earlier years may have fewer firms reporting.',
        ]}
      />
    </main>
  );
}
