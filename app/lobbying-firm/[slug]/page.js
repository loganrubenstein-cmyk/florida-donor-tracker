import Link from 'next/link';
import lazyLoad from 'next/dynamic';
import { getDb } from '@/lib/db';
import { notFound } from 'next/navigation';
import SourceLink from '@/components/shared/SourceLink';
import EntityHeader from '@/components/shared/EntityHeader';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import { fmtMoneyCompact } from '@/lib/fmt';
import { buildMeta } from '@/lib/seo';

const QuarterlyChart = lazyLoad(() => import('@/components/candidate/QuarterlyChart'), { ssr: false });

export const dynamic = 'force-dynamic';

function fmt(n) { return n ? fmtMoneyCompact(parseFloat(n)) : '—'; }

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const db = getDb();
  const { data: rows } = await db
    .from('lobbying_firms')
    .select('firm_name, total_comp, num_principals')
    .eq('slug', slug)
    .limit(1);
  const data = rows?.[0] ?? null;
  if (!data) return { title: 'Lobbying Firm' };
  const comp = data.total_comp ? `${fmt(parseFloat(data.total_comp))} in compensation` : '';
  const clients = data.num_principals ? `${data.num_principals} clients` : '';
  const parts = [comp, clients].filter(Boolean).join(' across ');
  const desc = `${data.firm_name} — Florida lobbying firm.${parts ? ` ${parts}.` : ''}`;
  return buildMeta({ title: data.firm_name, description: desc, path: `/lobbying-firm/${slug}` });
}

export default async function LobbyingFirmPage({ params }) {
  const { slug } = await params;
  const db = getDb();

  const [{ data: firm }, { data: clients }, { data: quarters }] = await Promise.all([
    db.from('lobbying_firms')
      .select('slug, firm_name, total_comp, num_principals, num_quarters, first_year, last_year, num_years')
      .eq('slug', slug)
      .limit(1)
      .then(r => ({ data: r.data?.[0] ?? null, error: r.error })),
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

  // Fetch issue areas for this firm from lobby_firm_issues (matched by firm_name)
  const { data: issueRows } = await db
    .from('lobby_firm_issues')
    .select('issue, disclosures, bills, principals, lobbyists')
    .eq('firm', firm.firm_name)
    .order('disclosures', { ascending: false })
    .limit(20);
  const issueAreas = issueRows || [];

  // Strip trailing legal suffixes (PA/P.A./LLC/Inc. etc.) so both "GrayRobinson PA"
  // and "GrayRobinson, P.A." lobbyists appear on the merged firm profile.
  const firmBase = firm.firm_name
    .replace(/\s*,?\s*(P\.?A\.?|P\.?L\.?|L\.?L\.?C\.?|LLC|Inc\.?|Incorporated|Corp\.?|Corporation)\s*$/i, '')
    .trim();
  const { data: lobbyists } = await db
    .from('lobbyists')
    .select('slug, name, num_principals, num_active')
    .ilike('firm', `${firmBase}%`)
    .order('num_active', { ascending: false })
    .limit(50);

  // Build set of normalized lobbyist name tokens for partner-badge heuristic
  const lobbyistTokens = new Set(
    (lobbyists || []).flatMap(l =>
      l.name.toLowerCase().split(/[\s,./]+/).filter(t => t.length > 3)
    )
  );

  function isPartnerEntry(principalName) {
    const norm = principalName.toLowerCase();
    return [...lobbyistTokens].some(token => norm.includes(token));
  }

  // Annual compensation aggregates for trend chart
  const annualComp = Object.values(
    (quarters || []).reduce((acc, q) => {
      const yr = String(q.year);
      if (!acc[yr]) acc[yr] = { quarter: yr, amount: 0 };
      acc[yr].amount += parseFloat(q.total_comp) || 0;
      return acc;
    }, {})
  ).sort((a, b) => a.quarter.localeCompare(b.quarter));

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/lobbying" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Lobbying</Link>
        {' / '}
        <Link href="/lobbying-firms" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Firms</Link>
        {' / '}
        <span>{firm.firm_name}</span>
      </div>

      <EntityHeader
        name={firm.firm_name}
        typeBadge={{ label: 'LOBBYING FIRM', color: 'var(--blue)' }}
        meta={[
          firm.first_year && firm.last_year ? `${firm.first_year}–${firm.last_year}` : null,
          firm.num_principals ? `${firm.num_principals} clients` : null,
        ]}
      >
        <SourceLink type="firm" />
      </EntityHeader>

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
            <div style={{ fontSize: '1.1rem', fontFamily: 'var(--font-serif)', fontVariantNumeric: 'tabular-nums', color: color || 'var(--orange)', fontWeight: 400 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: '0.7rem', color: 'rgba(90,106,136,0.7)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
        Compensation figures are midpoints of FL-mandated disclosure bands. The FL disclosure system records the same firm-level amount for every registered lobbyist at the firm — totals above are overstated by roughly the firm&apos;s average lobbyist count. Relative rankings across firms are reliable; absolute figures are not.
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
              {clients.map((c, i) => {
                const isPartner = isPartnerEntry(c.principal_name);
                return (
                <tr key={i} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>{i + 1}</td>
                  <td style={{ padding: '0.4rem 0.6rem', maxWidth: '400px', wordBreak: 'break-word' }}>
                    <Link href={`/principal/${c.principal_slug}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                      {c.principal_name}
                    </Link>
                    {isPartner && (
                      <span title="This may be a partner or name-principal of the firm, not an external client." style={{
                        marginLeft: '0.4rem', fontSize: '0.55rem', padding: '0.05rem 0.3rem',
                        border: '1px solid rgba(100,140,220,0.35)', color: 'var(--text-dim)',
                        borderRadius: '2px', fontFamily: 'var(--font-mono)', verticalAlign: 'middle',
                      }}>internal</span>
                    )}
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                    {c.first_year && c.last_year ? `${c.first_year}–${c.last_year}` : '—'}
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--blue)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {fmt(c.total_comp)}
                  </td>
                </tr>
                );
              })}
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

      {/* Annual compensation trend chart */}
      {annualComp.length > 1 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
            Annual Compensation Trend
          </div>
          <div style={{ height: '140px' }}>
            <QuarterlyChart data={annualComp} />
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

      {/* Issue areas */}
      {issueAreas.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
            Issue Areas Lobbied
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {issueAreas.map(iss => (
              <span key={iss.issue} style={{
                padding: '0.25rem 0.65rem',
                border: '1px solid rgba(100,140,220,0.2)',
                borderRadius: '3px',
                fontSize: '0.72rem',
                color: 'var(--text-dim)',
                background: 'var(--surface)',
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              }}>
                {iss.issue}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'rgba(90,106,136,0.6)' }}>
                  {iss.disclosures.toLocaleString()}
                </span>
              </span>
            ))}
          </div>
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
