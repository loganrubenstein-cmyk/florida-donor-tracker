// components/industries/IndustryProfile.js
// Server component
import dynamic from 'next/dynamic';
import BackLinks from '@/components/BackLinks';
import { slugify } from '@/lib/slugify';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import TabbedProfile from '@/components/shared/TabbedProfile';
import EntityHeader from '@/components/shared/EntityHeader';
import { getPoliticianSlugByAcctNum } from '@/lib/loadCandidate';

const IndustryTrendChart = dynamic(() => import('./IndustryTrendChart'), { ssr: false });

function fmt(n) {
  if (n == null) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtFull(n) {
  if (n == null) return '—';
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function fmtCompact(n) {
  if (!n) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

const INDUSTRY_COLORS = {
  'Legal':                       'var(--teal)',
  'Real Estate':                 'var(--orange)',
  'Healthcare':                  'var(--green)',
  'Finance & Insurance':         '#a04df0',
  'Political / Lobbying':        'var(--republican)',
  'Agriculture':                 'var(--gold)',
  'Construction':                '#d8884d',
  'Education':                   'var(--democrat)',
  'Technology / Engineering':    'var(--teal)',
  'Retail & Hospitality':        '#d84d88',
  'Business & Consulting':       'var(--blue)',
  'Government & Public Service': 'var(--green)',
  'Retired':                     'var(--text-dim)',
  'Not Employed':                'var(--text-dim)',
  'Other':                       'var(--text-dim)',
};

const INDUSTRY_COLORS_RAW = {
  'Legal':                       '#4dd8f0',
  'Real Estate':                 '#f0a04d',
  'Healthcare':                  '#7dd87d',
  'Finance & Insurance':         '#a04df0',
  'Political / Lobbying':        '#f04d4d',
  'Agriculture':                 '#d8c84d',
  'Construction':                '#d8884d',
  'Education':                   '#4d88f0',
  'Technology / Engineering':    '#4df0d8',
  'Retail & Hospitality':        '#d84d88',
  'Business & Consulting':       '#8888cc',
  'Government & Public Service': '#88cc88',
  'Retired':                     '#aaaaaa',
  'Not Employed':                '#666688',
  'Other':                       '#444466',
};

function StatBox({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--bg)', padding: '1rem 1.25rem',
      display: 'flex', flexDirection: 'column', gap: '0.25rem',
    }}>
      <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.3rem', fontFamily: 'var(--font-mono)', color: color || 'var(--orange)', fontWeight: 700 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>{sub}</div>}
    </div>
  );
}

const PARTY_COLOR = { R: 'var(--republican)', D: 'var(--democrat)', NPA: 'var(--text-dim)' };

export default function IndustryProfile({ data, totalAmount, trendData, topDonors, topLegislators }) {
  const color = INDUSTRY_COLORS[data.industry] || 'var(--text-dim)';
  const colorRaw = INDUSTRY_COLORS_RAW[data.industry] || '#444466';

  // Dedup by name — same politician can appear with multiple acct_nums; keep highest total
  const rawCandidates = data.top_candidates || [];
  const seen = new Map();
  for (const c of rawCandidates) {
    const key = (c.name || '').trim().toLowerCase();
    const existing = seen.get(key);
    if (!existing || parseFloat(c.total || 0) > parseFloat(existing.total || 0)) seen.set(key, c);
  }
  const candidates = [...seen.values()];

  // Prefer rich per-industry donor file over summary
  const richDonors = topDonors?.top_donors || null;
  const donors     = data.top_donors || [];
  const donorList  = richDonors || donors;

  // ── Overview ──────────────────────────────────────────────────────────────
  const overviewContent = (
    <div style={{ paddingTop: '1.25rem' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '1px', background: 'var(--border)', marginBottom: '2rem',
      }}>
        <StatBox label="Total Hard Money" value={fmt(data.total)} color={color} />
        <StatBox label="% of All Hard Money"
          value={`${data.pct.toFixed(1)}%`}
          sub={totalAmount ? `of ${fmt(totalAmount)} total` : null}
          color="var(--teal)" />
        <StatBox label="Contributions" value={fmtCount(data.count)} color="var(--blue)" />
        <StatBox label="Unique Candidates" value={candidates.length.toLocaleString()}
          sub="in top recipients" color="var(--text-dim)" />
      </div>

      {trendData && (
        <IndustryTrendChart industry={data.industry} trendData={trendData} color={colorRaw} />
      )}

      <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.6, marginTop: '1rem' }}>
        Hard money contributions are direct donations to candidate campaign accounts, reported to the{' '}
        <a href="https://dos.elections.myflorida.com/campaign-finance/" target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--teal)', textDecoration: 'none' }}>
          Florida Division of Elections
        </a>.
        Industry classification is derived from the self-reported occupation field on each contribution.
      </div>
    </div>
  );

  // ── Top Recipients ────────────────────────────────────────────────────────
  const recipientsContent = candidates.length > 0 ? (
    <div style={{ paddingTop: '1.25rem' }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: '1rem', lineHeight: 1.5 }}>
        Candidates ranked by total direct contributions received from donors in the {data.industry} industry.
        Same politician appearing under multiple campaign accounts is deduplicated — highest cycle total shown.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['#', 'Candidate', 'Received'].map((h, j) => (
                <th key={h} style={{
                  padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                  textAlign: j === 0 ? 'center' : j === 2 ? 'right' : 'left',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {candidates.map((c, i) => {
              const pct = data.total > 0 ? (c.total / data.total) * 100 : 0;
              const polSlug = c.acct_num ? getPoliticianSlugByAcctNum(c.acct_num) : null;
              return (
                <tr key={c.acct_num} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem' }}>
                    <a href={polSlug ? `/politician/${polSlug}` : `/candidate/${c.acct_num}`}
                      style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                      {c.name || `#${c.acct_num}`}
                    </a>
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem' }}>
                      <div style={{
                        width: `${Math.min(Math.round(pct * 2), 80)}px`, height: '6px',
                        background: colorRaw, borderRadius: '1px', opacity: 0.7,
                      }} />
                      <span style={{ color: 'var(--orange)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                        {fmtFull(c.total)}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  ) : null;

  // ── Top Donors ────────────────────────────────────────────────────────────
  const donorsContent = donorList.length > 0 ? (
    <div style={{ paddingTop: '1.25rem' }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: '1rem', lineHeight: 1.5 }}>
        {topDonors
          ? `Top donors in the ${data.industry} industry by total contributions across all committees. ${topDonors.total_donors.toLocaleString()} unique donors identified in this industry.`
          : `Top individual donors identified as ${data.industry} by their self-reported occupation on contribution filings.`
        }
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {(richDonors
                ? ['#', 'Donor', 'Type', 'Committees', 'Combined Total']
                : ['#', 'Donor', 'Total Given']
              ).map((h, j) => (
                <th key={h} style={{
                  padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                  textAlign: j === 0 || j === 2 ? 'center' : j >= 3 ? 'right' : 'left',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {richDonors ? richDonors.map((d, i) => (
              <tr key={d.slug || d.name} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>{i + 1}</td>
                <td style={{ padding: '0.4rem 0.6rem', wordBreak: 'break-word', maxWidth: '280px' }}>
                  <a href={`/donor/${d.slug || slugify(d.name)}`}
                    style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                    {d.name}
                  </a>
                  {d.top_location && (
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>
                      {d.top_location.replace(/,\s*\d{5}(-\d{4})?$/, '').trim()}
                    </div>
                  )}
                </td>
                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>
                  <span style={{
                    fontSize: '0.55rem', padding: '0.05rem 0.3rem',
                    border: `1px solid ${d.is_corporate ? 'rgba(160,192,255,0.4)' : 'rgba(77,216,240,0.3)'}`,
                    color: d.is_corporate ? 'var(--blue)' : 'var(--teal)',
                    borderRadius: '2px', fontFamily: 'var(--font-mono)',
                  }}>
                    {d.is_corporate ? 'CORP' : 'IND'}
                  </span>
                </td>
                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                  {d.num_committees}
                </td>
                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--orange)', fontWeight: 700, whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                  {fmt(d.total_combined)}
                </td>
              </tr>
            )) : donors.map((d, i) => (
              <tr key={d.name} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>{i + 1}</td>
                <td style={{ padding: '0.4rem 0.6rem', wordBreak: 'break-word', maxWidth: '300px' }}>
                  <a href={`/donor/${slugify(d.name)}`}
                    style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                    {d.name}
                  </a>
                </td>
                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--orange)', fontWeight: 700, whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                  {fmtFull(d.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ) : null;

  // ── Legislators ───────────────────────────────────────────────────────────
  const legislatorsContent = topLegislators?.length > 0 ? (
    <div style={{ paddingTop: '1.25rem' }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: '1rem', lineHeight: 1.5 }}>
        Current Florida legislators ranked by direct individual contributions received from donors
        in the {data.industry} industry. PAC-to-candidate transfers are not included.{' '}
        <a href="/legislature" style={{ color: 'var(--teal)', textDecoration: 'none' }}>← Full legislature →</a>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Member', 'Chamber', 'Party', 'District', 'From This Industry'].map(h => (
                <th key={h} style={{
                  padding: '0.4rem 0.6rem', textAlign: 'left',
                  fontSize: '0.6rem', color: 'var(--text-dim)',
                  textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 400,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topLegislators.map(leg => (
              <tr key={leg.people_id} style={{ borderBottom: '1px solid rgba(100,140,220,0.07)' }}>
                <td style={{ padding: '0.45rem 0.6rem' }}>
                  <a href={`/legislator/${leg.people_id}`} style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 500 }}>
                    {leg.display_name}
                  </a>
                  {leg.acct_num && (
                    <a href={`/candidate/${leg.acct_num}`} style={{ marginLeft: '0.5rem', fontSize: '0.6rem', color: 'var(--text-dim)', textDecoration: 'none' }}>
                      fundraising →
                    </a>
                  )}
                </td>
                <td style={{ padding: '0.45rem 0.6rem' }}>
                  <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.35rem', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    {leg.chamber === 'House' ? 'H' : 'S'}
                  </span>
                </td>
                <td style={{ padding: '0.45rem 0.6rem' }}>
                  <span style={{ color: PARTY_COLOR[leg.party] || 'var(--text-dim)', fontWeight: 600, fontSize: '0.78rem' }}>{leg.party}</span>
                </td>
                <td style={{ padding: '0.45rem 0.6rem', color: 'var(--teal)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                  {leg.district}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', color: colorRaw, fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600 }}>
                  {fmtCompact(leg.industry_total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ) : null;

  // ── Sources ───────────────────────────────────────────────────────────────
  const sourcesContent = (
    <div style={{ paddingTop: '1.25rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {[
          { label: 'Dark Money Scoreboard →', href: '/transparency' },
          { label: 'Find Donor Overlap →', href: '/compare' },
          { label: 'All Industries →', href: '/industries' },
        ].map(({ label, href }) => (
          <a key={label} href={href}
            style={{
              padding: '0.35rem 0.75rem', border: '1px solid var(--border)',
              color: 'var(--teal)', fontSize: '0.82rem', borderRadius: '3px',
              textDecoration: 'none', fontFamily: 'var(--font-mono)',
            }}>
            {label}
          </a>
        ))}
      </div>
      <DataTrustBlock
        source="Florida Division of Elections — Campaign Finance Filings"
        sourceUrl="https://dos.elections.myflorida.com/campaign-finance/"
        direct={['contribution amounts', 'contributor occupation field']}
        normalized={['industry assignment derived from occupation using keyword classifier']}
        inferred={['top candidates ranked by total received from this industry']}
        caveats={[
          'Hard money (direct candidate contributions) only — PAC-to-PAC transfers not included.',
          'Occupation field is self-reported. Blank or unrecognized occupations are excluded from this industry.',
        ]}
      />
    </div>
  );

  // ── Build tabs ────────────────────────────────────────────────────────────
  const tabs = [
    {
      id: 'overview',
      label: 'Overview',
      description: 'Total contributions, trend chart, and industry summary',
      content: overviewContent,
    },
    ...(candidates.length > 0 ? [{
      id: 'recipients',
      label: `Top Recipients (${candidates.length})`,
      description: `Candidates who received the most from ${data.industry} donors`,
      content: recipientsContent,
    }] : []),
    ...(donorList.length > 0 ? [{
      id: 'donors',
      label: `Top Donors (${donorList.length})`,
      description: `Top individual and corporate donors in the ${data.industry} industry`,
      content: donorsContent,
    }] : []),
    ...(topLegislators?.length > 0 ? [{
      id: 'legislators',
      label: `Legislators (${topLegislators.length})`,
      description: 'Current FL legislators who received contributions from this industry',
      content: legislatorsContent,
    }] : []),
    {
      id: 'sources',
      label: 'Sources',
      description: 'Data sources, methodology, and research tools',
      content: sourcesContent,
    },
  ];

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>
      <BackLinks links={[{ href: '/', label: 'home' }, { href: '/industries', label: 'industries' }]} />

      <EntityHeader
        name={data.industry}
        typeBadge={{ label: 'INDUSTRY', color: colorRaw }}
        meta={[
          `${fmt(data.total)} total hard money · ${data.pct.toFixed(1)}% of all FL contributions`,
          `${fmtCount(data.count)} individual contributions`,
        ]}
      />

      <TabbedProfile tabs={tabs} defaultTab="overview" />
    </main>
  );
}
