// components/industries/IndustriesList.js
// Server component — reads industry_summary.json at build time
import { readFileSync } from 'fs';
import { join } from 'path';
import BackLinks from '@/components/BackLinks';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import { slugify } from '@/lib/slugify';
import IndustryRanking from './IndustryRanking';

function fmt(n) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

const INDUSTRY_COLORS = {
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

export default function IndustriesList() {
  const raw = readFileSync(
    join(process.cwd(), 'public', 'data', 'industry_summary.json'),
    'utf-8'
  );
  const summary = JSON.parse(raw);
  const { total_amount, total_count, industries } = summary;

  // Optional year trend data for the interactive ranking
  let trendData = null;
  try {
    trendData = JSON.parse(readFileSync(
      join(process.cwd(), 'public', 'data', 'industry_trends.json'), 'utf-8'
    ));
  } catch {}

  // Sort by total desc for display
  const sorted = [...industries].sort((a, b) => b.total - a.total);
  const maxTotal = sorted[0]?.total || 1;

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      <BackLinks links={[{ href: '/', label: 'home' }, { href: '/influence', label: 'influence index' }]} />

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{
          display: 'inline-block', fontSize: '0.6rem', textTransform: 'uppercase',
          letterSpacing: '0.13em', padding: '0.28rem 0.7rem', borderRadius: '2px',
          marginBottom: '0.75rem', border: '1px solid rgba(160,192,255,0.3)',
          background: 'rgba(160,192,255,0.06)', color: 'var(--blue)',
        }}>
          Industries
        </div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.4rem, 3vw, 2rem)',
          fontWeight: 400, color: 'var(--text)', marginBottom: '0.3rem',
        }}>
          Which industries own Florida politics?
        </h1>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.6, maxWidth: '520px', marginBottom: '0.75rem' }}>
          Campaign contributions broken down by sector — real estate, healthcare, agriculture, energy, and more. Ranked by total direct giving. Click an industry to see its trend, top donors, and the candidates it funds.
        </p>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--orange)', fontWeight: 700 }}>{fmt(total_amount)}</span>
          <span>in direct (hard money) contributions</span>
          <span>{fmtCount(total_count)} transactions classified</span>
          <span>Florida Division of Elections</span>
        </div>
      </div>

      {/* Proportional composition strip */}
      <div style={{
        display: 'flex', height: '8px', borderRadius: '2px', overflow: 'hidden',
        marginBottom: '1.5rem', gap: '1px',
      }}>
        {sorted.map(ind => (
          <div
            key={ind.industry}
            title={`${ind.industry} — ${ind.pct.toFixed(1)}%`}
            style={{
              width: `${ind.pct}%`,
              background: INDUSTRY_COLORS[ind.industry] || '#444466',
              minWidth: ind.pct > 0.5 ? '2px' : '0',
            }}
          />
        ))}
      </div>

      {/* Labeled horizontal bar ranking — interactive year filter */}
      <div style={{ marginBottom: '2rem' }}>
        <IndustryRanking
          industriesAll={industries}
          trendData={trendData}
          colors={INDUSTRY_COLORS}
        />
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {[
                { label: '#',             align: 'center', width: '2rem' },
                { label: 'Industry',      align: 'left'   },
                { label: 'Hard Money',    align: 'right'  },
                { label: '% of Total',    align: 'right'  },
                { label: 'Contributions', align: 'right'  },
                { label: 'Top Candidate', align: 'left'   },
              ].map(({ label, align, width }) => (
                <th key={label} style={{
                  padding: '0.4rem 0.6rem', textAlign: align, width,
                  fontSize: '0.6rem', color: 'var(--text-dim)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((ind, i) => {
              const color = INDUSTRY_COLORS[ind.industry] || '#444466';
              const top = ind.top_candidates?.[0];
              return (
                <tr key={ind.industry} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center' }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem' }}>
                    <a href={`/industry/${slugify(ind.industry)}`}
                      style={{ color, textDecoration: 'none', fontWeight: 600 }}>
                      {ind.industry}
                    </a>
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--orange)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {fmt(ind.total)}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                      <div style={{
                        width: `${Math.round(ind.pct)}px`, height: '6px',
                        background: color, borderRadius: '1px', maxWidth: '60px',
                        minWidth: '2px',
                      }} />
                      <span style={{ color: 'var(--text-dim)' }}>{ind.pct.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                    {fmtCount(ind.count)}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.78rem', maxWidth: '200px' }}>
                    {top ? (
                      <a href={`/candidate/${top.acct_num}`}
                        style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                        {top.name}
                        <span style={{ color: 'var(--text-dim)', marginLeft: '0.4rem' }}>
                          {fmt(top.total)}
                        </span>
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <a href="/lobbying/issues" style={{ fontSize: '0.72rem', color: 'var(--teal)', border: '1px solid rgba(77,216,240,0.25)', borderRadius: '3px', padding: '0.35rem 0.75rem', textDecoration: 'none' }}>
          → Lobbying by issue area
        </a>
        <a href="/donors" style={{ fontSize: '0.72rem', color: 'var(--orange)', border: '1px solid rgba(255,176,96,0.25)', borderRadius: '3px', padding: '0.35rem 0.75rem', textDecoration: 'none' }}>
          → Browse all donors
        </a>
        <a href="/explorer" style={{ fontSize: '0.72rem', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.35rem 0.75rem', textDecoration: 'none' }}>
          → Transaction explorer
        </a>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <DataTrustBlock
          source="Florida Division of Elections — Campaign Finance Filings"
          sourceUrl="https://dos.fl.gov/elections/candidates-committees/campaign-finance/"
          
          direct={['contribution amounts', 'contributor occupation field']}
          normalized={['industry bucket derived from occupation using keyword classifier']}
          inferred={['industry assignment is automated — some contributors may be miscategorized']}
          caveats={[
            'Industry totals include hard money (direct candidate contributions) only — PAC-to-PAC transfers not included.',
            'Occupation field is self-reported by contributors and may be blank, abbreviated, or inconsistent.',
            '"Unclassified" category includes blank occupations and terms not matching any industry bucket.',
          ]}
        />
      </div>
    </main>
  );
}
