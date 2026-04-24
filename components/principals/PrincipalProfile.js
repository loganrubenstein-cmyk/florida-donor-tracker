// components/principals/PrincipalProfile.js
import dynamic from 'next/dynamic';
import BackLinks from '@/components/BackLinks';
import SourceLink from '@/components/shared/SourceLink';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import EntityHeader from '@/components/shared/EntityHeader';
import NewsBlock from '@/components/shared/NewsBlock';
import TabbedProfile from '@/components/shared/TabbedProfile';
import { slugify } from '@/lib/slugify';
import { fmtMoney, fmtMoneyCompact, fmtCount, fmtAvgContribution, avgContribution } from '@/lib/fmt';

const SpendTrendChart = dynamic(() => import('@/components/candidate/QuarterlyChart'), { ssr: false });


function StatBox({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--bg)', padding: '1rem 1.25rem',
      display: 'flex', flexDirection: 'column', gap: '0.25rem',
    }}>
      <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.3rem', fontFamily: 'var(--font-serif)', color: color || 'var(--orange)', fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>{sub}</div>}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.1em', marginBottom: '0.75rem',
    }}>
      {children}
    </div>
  );
}

function BranchBadge({ branch, faded }) {
  return (
    <span style={{
      fontSize: '0.58rem', padding: '0.05rem 0.3rem',
      border: `1px solid ${faded ? 'rgba(90,106,136,0.4)' : 'var(--text-dim)'}`,
      color: 'var(--text-dim)', borderRadius: '2px',
    }}>
      {branch === 'legislative' ? 'leg.' : 'exec.'}
    </span>
  );
}

export default function PrincipalProfile({ data, compData = null }) {
  const lobbyists         = data.lobbyists || [];
  const activeLobbyists   = lobbyists.filter(l => l.is_active);
  const inactiveLobbyists = lobbyists.filter(l => !l.is_active);
  const donationMatches   = data.donation_matches || [];
  const topCommittees     = data.top_committees || [];
  const stateContracts    = data.state_contracts || [];
  const issueAreas        = data.issue_areas || [];

  const location     = [data.city, data.state].filter(Boolean).join(', ');
  const industry     = data.industry && data.industry !== 'Other' ? data.industry : null;
  // Principal.industry is more fine-grained than the /industry/[slug] directory
  // (which uses a fixed 14-bucket set: agriculture, business-consulting, etc.).
  // Only link when the slug exists in that directory — otherwise the label
  // still shows, but as plain text so we don't ship dead /industry/* links.
  const VALID_INDUSTRY_SLUGS = new Set([
    'agriculture', 'business-consulting', 'construction', 'education',
    'finance-insurance', 'government-public-service', 'healthcare', 'legal',
    'not-employed', 'other', 'political-lobbying', 'real-estate',
    'retail-hospitality', 'retired', 'technology-engineering',
  ]);
  const rawIndustrySlug = industry ? slugify(industry) : null;
  const industrySlug = rawIndustrySlug && VALID_INDUSTRY_SLUGS.has(rawIndustrySlug)
    ? rawIndustrySlug
    : null;

  // Aggregate quarterly comp data by year for trend chart
  const annualSpend = compData?.by_quarter?.length > 0
    ? Object.values(
        compData.by_quarter.reduce((acc, row) => {
          const yr = String(row.year);
          if (!acc[yr]) acc[yr] = { quarter: yr, amount: 0 };
          acc[yr].amount += parseFloat(row.total_comp) || 0;
          return acc;
        }, {})
      ).sort((a, b) => a.quarter.localeCompare(b.quarter))
    : [];

  // ── Tab content ─────────────────────────────────────────────────────────────

  const overviewContent = (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '1px', background: 'var(--border)', marginBottom: '2rem',
      }}>
        <StatBox label="Total Lobbyists" value={(data.total_lobbyists || 0).toLocaleString()} />
        <StatBox label="Active Lobbyists" value={(data.num_active || 0).toLocaleString()} color="var(--teal)" />
        <StatBox
          label="Donation Match"
          value={data.donation_total > 0 ? fmtMoneyCompact(data.donation_total) : '—'}
          sub={data.num_contributions > 0
            ? (avgContribution(data.donation_total, data.num_contributions) != null
                ? `${data.num_contributions.toLocaleString()} contributions · avg ${fmtAvgContribution(data.donation_total, data.num_contributions)}`
                : `${data.num_contributions.toLocaleString()} contributions`)
            : null}
          color={data.donation_total > 0 ? 'var(--orange)' : 'var(--text-dim)'}
        />
        {compData ? (
          <StatBox
            label="Lobbying Spend (est.)"
            value={fmtMoneyCompact(compData.total_comp)}
            sub={`${compData.num_quarters || 0} quarters · midpoint estimate`}
            color="var(--blue)"
          />
        ) : (
          <StatBox label="Past Lobbyists" value={inactiveLobbyists.length.toLocaleString()} color="var(--text-dim)" />
        )}
        {stateContracts.length > 0 && (
          <StatBox
            label="State Contracts"
            value={fmtMoneyCompact(stateContracts.reduce((s, c) => s + c.total_contract_amount, 0))}
            sub={`${stateContracts.length} vendor match${stateContracts.length > 1 ? 'es' : ''}`}
            color="var(--gold)"
          />
        )}
      </div>

      {/* Lobbying spend trend */}
      {annualSpend.length > 1 && (
        <div style={{ marginBottom: '2rem' }}>
          <SectionLabel>Annual Lobbying Spend</SectionLabel>
          <div style={{ fontSize: '0.7rem', color: 'rgba(90,106,136,0.7)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
            Estimated compensation paid to all registered lobbyists, from{' '}
            <a href="https://www.floridalobbyist.gov" target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--teal)', textDecoration: 'none' }}>
              FL Lobbyist Registration Office
            </a>{' '}
            quarterly reports. Amounts below $50K use band midpoints; $50K+ are exact.
          </div>
          <div style={{ height: '140px' }}>
            <SpendTrendChart data={annualSpend} />
          </div>
        </div>
      )}

      {/* Top lobbying firms */}
      {compData?.top_firms?.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <SectionLabel>Top Lobbying Firms</SectionLabel>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['#', 'Firm', 'Est. Paid'].map((h, j) => (
                  <th key={h} style={{
                    padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                    textAlign: j === 0 ? 'center' : j === 2 ? 'right' : 'left',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compData.top_firms.map((f, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>{i + 1}</td>
                  <td style={{ padding: '0.4rem 0.6rem' }}>
                    {f.slug
                      ? <a href={`/lobbying-firm/${f.slug}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>{f.firm_name}</a>
                      : <span style={{ color: 'var(--text)' }}>{f.firm_name}</span>
                    }
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--blue)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {fmtMoneyCompact(f.total_comp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Industry cross-link */}
      {industry && industrySlug && (
        <div style={{ marginBottom: '1rem' }}>
          <a href={`/industry/${industrySlug}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            fontSize: '0.7rem', color: 'var(--blue)', textDecoration: 'none',
            padding: '0.4rem 0.75rem', border: '1px solid rgba(100,140,220,0.15)',
            borderRadius: '3px', fontFamily: 'var(--font-mono)',
          }}>
            → browse {industry} principals
          </a>
        </div>
      )}
    </div>
  );

  const activeContent = (
    <div>
      {activeLobbyists.length === 0 ? (
        <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>No active lobbyist registrations.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['#', 'Lobbyist', 'Firm', 'Branch', 'Since'].map((h, j) => (
                  <th key={h} style={{
                    padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                    textAlign: j === 0 || j === 3 ? 'center' : 'left',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeLobbyists.map((l, i) => (
                <tr key={`${l.lobbyist_name}-${l.branch}`} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>{i + 1}</td>
                  <td style={{ padding: '0.4rem 0.6rem', maxWidth: '220px', wordBreak: 'break-word' }}>
                    <a href={`/lobbyist/${l.lobbyist_slug || slugify(l.lobbyist_name)}`}
                      style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                      {l.lobbyist_name}
                    </a>
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.68rem', maxWidth: '180px', wordBreak: 'break-word' }}>
                    {l.firm || '—'}
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>
                    <BranchBadge branch={l.branch} />
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                    {l.since || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const pastContent = (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['#', 'Lobbyist', 'Firm', 'Branch', 'Since'].map((h, j) => (
              <th key={h} style={{
                padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                textAlign: j === 0 || j === 3 ? 'center' : 'left',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {inactiveLobbyists.map((l, i) => (
            <tr key={`${l.lobbyist_name}-${l.branch}-${l.since}`} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)', opacity: 0.65 }}>
              <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>{i + 1}</td>
              <td style={{ padding: '0.4rem 0.6rem', maxWidth: '220px', wordBreak: 'break-word' }}>
                <a href={`/lobbyist/${l.lobbyist_slug || slugify(l.lobbyist_name)}`}
                  style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>
                  {l.lobbyist_name}
                </a>
              </td>
              <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.68rem', maxWidth: '180px', wordBreak: 'break-word' }}>
                {l.firm || '—'}
              </td>
              <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>
                <BranchBadge branch={l.branch} faded />
              </td>
              <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                {l.since || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const committeesContent = (
    <div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '1rem', lineHeight: 1.5 }}>
        Committees that received contributions from donor names matched to this principal.
        These are inferred via name similarity — not confirmed legal entity links.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['#', 'Committee', 'Total Donated', 'Contributions'].map((h, j) => (
                <th key={h} style={{
                  padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                  textAlign: j === 0 ? 'center' : j >= 2 ? 'right' : 'left',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topCommittees.map((c, i) => (
              <tr key={c.acct_num} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>{i + 1}</td>
                <td style={{ padding: '0.4rem 0.6rem', maxWidth: '320px', wordBreak: 'break-word' }}>
                  <a href={`/committee/${c.acct_num}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>{c.name}</a>
                </td>
                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--orange)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {fmtMoney(c.total)}
                </td>
                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                  {(c.num_contributions || 0).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const donationContent = (
    <div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '1rem', lineHeight: 1.5 }}>
        These contributor names in FL campaign finance records closely match this principal.
        Name-based matching — same name does not guarantee same legal entity.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['#', 'Contributor Name', 'Match', 'Total Donated', 'Contributions'].map((h, j) => (
                <th key={h} style={{
                  padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                  textAlign: j === 0 ? 'center' : j >= 2 ? 'right' : 'left',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {donationMatches.map((m, i) => (
              <tr key={m.contributor_name} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>{i + 1}</td>
                <td style={{ padding: '0.4rem 0.6rem', maxWidth: '280px', wordBreak: 'break-word' }}>
                  <a href={`/donor/${m.donor_slug || slugify(m.contributor_name)}`} style={{ color: 'var(--orange)', textDecoration: 'none' }}>
                    {m.contributor_name}
                  </a>
                  <a href={`/follow?donor=${m.donor_slug || slugify(m.contributor_name)}`} style={{ marginLeft: '0.4rem', fontSize: '0.58rem', color: 'var(--teal)', textDecoration: 'none', opacity: 0.6 }}>follow</a>
                </td>
                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                  {Number(m.match_score).toFixed(0)}%
                </td>
                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: m.total_donated > 0 ? 'var(--orange)' : 'var(--text-dim)', fontWeight: m.total_donated > 0 ? 700 : 400, whiteSpace: 'nowrap' }}>
                  {m.total_donated > 0 ? fmtMoney(m.total_donated) : '—'}
                </td>
                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                  {(m.num_contributions || 0).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const contractsContent = (
    <div>
      <div style={{
        padding: '0.6rem 0.9rem', border: '1px solid rgba(255,208,96,0.15)',
        borderRadius: '3px', background: 'rgba(255,208,96,0.04)',
        fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '1rem',
      }}>
        This principal&apos;s name closely matches one or more vendors in the FL Accountability
        Contract Tracking System (FACTS). They may both lobby the legislature and receive state contracts.{' '}
        <a href="/contracts" style={{ color: 'var(--teal)', textDecoration: 'none' }}>Browse all contracts →</a>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['#', 'Vendor', 'Top Agency', 'Contracts', 'Years', 'Total Received'].map((h, j) => (
                <th key={h} style={{
                  padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                  textAlign: j === 0 || j === 3 ? 'center' : j === 5 ? 'right' : 'left',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stateContracts.map((c, i) => (
              <tr key={c.vendor_slug} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>{i + 1}</td>
                <td style={{ padding: '0.4rem 0.6rem', maxWidth: '260px', wordBreak: 'break-word' }}>
                  <a href="/contracts" style={{ color: 'var(--gold)', textDecoration: 'none' }}>{c.vendor_name}</a>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>
                    {c.match_score >= 99 ? 'exact match' : `${Math.round(c.match_score)}% name match`}
                  </div>
                </td>
                <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.7rem', maxWidth: '180px' }}>{c.top_agency || '—'}</td>
                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                  {fmtCount(c.num_contracts)}
                </td>
                <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>{c.year_range || '—'}</td>
                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--gold)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {fmtMoney(c.total_contract_amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const sourcesContent = (
    <div>
      <NewsBlock articles={data.news || []} />
      <SectionLabel>Research</SectionLabel>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        {[
          { label: 'Find Donor Overlap →', href: '/compare', internal: true },
          { label: 'State Contracts →', href: '/contracts', internal: true },
          { label: 'FL Lobbyist Registry →', href: 'https://www.floridalobbyist.gov/CompensationReportSearch' },
          { label: 'Google →', href: `https://www.google.com/search?q=${encodeURIComponent((data.name || '') + ' Florida lobbying')}` },
        ].map(({ label, href, internal }) => (
          <a key={label} href={href} {...(!internal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            style={{
              padding: '0.35rem 0.75rem', border: '1px solid var(--border)',
              color: internal ? 'var(--teal)' : 'var(--text-dim)', fontSize: '0.72rem', borderRadius: '3px',
              textDecoration: 'none', fontFamily: 'var(--font-mono)',
            }}>
            {label}
          </a>
        ))}
      </div>
      <DataTrustBlock
        source="Florida Lobbyist Registration Office — Registration & Compensation Reports"
        sourceUrl="https://www.floridalobbyist.gov"
        direct={['entity name', 'NAICS code', 'address', 'registered lobbyists', 'quarterly compensation reports (2007–present)']}
        normalized={['compensation totals (midpoints below $50K; exact amounts above $50K)']}
        inferred={['donation matches (matched by principal name to contribution records — not confirmed by election authorities)']}
        caveats={[
          'Compensation below $50,000 is reported in ranges — we use midpoints for aggregation.',
          'Amounts of $50,000+ are exact figures reported by the principal.',
          'Donation matches are name-based and may include false positives for common names.',
          ...(stateContracts.length > 0 ? ['State contract matches are based on vendor name similarity — not a confirmed legal entity match.'] : []),
        ]}
      />
    </div>
  );

  const tabs = [
    {
      id: 'overview',
      label: 'Overview',
      description: 'Lobbying spend summary and annual trend',
      content: overviewContent,
    },
    {
      id: 'active-lobbyists',
      label: `Active Lobbyists${activeLobbyists.length ? ` (${activeLobbyists.length})` : ''}`,
      description: 'Currently registered lobbyists representing this principal',
      content: activeContent,
    },
    ...(inactiveLobbyists.length > 0 ? [{
      id: 'past-lobbyists',
      label: `Past Lobbyists (${inactiveLobbyists.length})`,
      description: 'Former lobbyist registrations — withdrawn or lapsed',
      content: pastContent,
    }] : []),
    ...(topCommittees.length > 0 ? [{
      id: 'committees',
      label: `Committees (${topCommittees.length})`,
      description: 'Top committees supported by name-matched donors',
      content: committeesContent,
    }] : []),
    ...(donationMatches.length > 0 ? [{
      id: 'donations',
      label: 'Donation Match',
      description: 'Contributor names in campaign finance records matched to this principal',
      content: donationContent,
    }] : []),
    ...(stateContracts.length > 0 ? [{
      id: 'contracts',
      label: `Contracts (${stateContracts.length})`,
      description: 'Matched FL state contract vendors from FACTS procurement system',
      content: contractsContent,
    }] : []),
    ...(issueAreas.length > 0 ? [{
      id: 'issues',
      label: `Issues (${issueAreas.length})`,
      description: 'Legislative issue areas this principal lobbied on',
      content: (
        <div>
          <div style={{ fontSize: '0.7rem', color: 'rgba(90,106,136,0.7)', marginBottom: '1rem', lineHeight: 1.5 }}>
            Issue categories lobbied on behalf of this principal, from FL lobbyist disclosure filings.
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Issue Area', 'Disclosures', 'Bills', 'Lobbyists', 'Years'].map((h, j) => (
                  <th key={h} style={{
                    padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                    textAlign: j === 0 ? 'left' : 'right',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {issueAreas.map(iss => (
                <tr key={iss.issue} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.45rem 0.6rem', fontWeight: 500 }}>{iss.issue}</td>
                  <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--teal)' }}>{iss.disclosures.toLocaleString()}</td>
                  <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>{iss.bills.toLocaleString()}</td>
                  <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>{iss.lobbyists.toLocaleString()}</td>
                  <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                    {iss.earliest_year && iss.latest_year ? `${iss.earliest_year}–${iss.latest_year}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    }] : []),
    { id: 'sources', label: 'In The News', description: 'Recent news coverage, research links, and data sources', content: sourcesContent },
  ];

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>
      <BackLinks links={[{ href: '/', label: 'home' }, { href: '/principals', label: 'principals' }]} />

      <EntityHeader
        name={data.name}
        typeBadge={{ label: 'PRINCIPAL', color: 'var(--teal)' }}
        badges={[
          // Badge always renders when industry known; link only when the slug
          // maps to a real /industry/<slug> page (see VALID_INDUSTRY_SLUGS).
          ...(industry
            ? [{
                label: industry,
                color: 'rgba(100,140,220,0.6)',
                href: industrySlug ? `/industry/${industrySlug}` : undefined,
              }]
            : []),
          ...(data.donation_total > 0 ? [{ label: 'DONATION MATCH', color: 'var(--orange)' }] : []),
          ...(stateContracts.length > 0 ? [{ label: 'STATE CONTRACTOR', color: 'var(--gold)' }] : []),
        ]}
        meta={[location, data.naics ? `NAICS ${data.naics}` : null]}
      >
        <SourceLink type="principal" />
      </EntityHeader>

      <TabbedProfile tabs={tabs} defaultTab="overview" />
    </main>
  );
}
