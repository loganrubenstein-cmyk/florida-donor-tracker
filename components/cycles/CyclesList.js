// components/cycles/CyclesList.js
// Server component — reads candidate_stats.json at build time
import { readFileSync } from 'fs';
import { join } from 'path';
import BackLinks from '@/components/BackLinks';
import SectionHeader from '@/components/shared/SectionHeader';
import DataTrustBlock from '@/components/shared/DataTrustBlock';

function fmt(n) {
  if (!n || n === 0) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function buildCycleSummaries(stats) {
  const byYear = {};
  for (const c of stats) {
    const y = c.election_year;
    if (!y) continue;
    if (!byYear[y]) byYear[y] = { year: y, candidates: 0, hard: 0, soft: 0, combined: 0, topCandidate: null };
    byYear[y].candidates++;
    byYear[y].hard     += c.hard_money_total  || 0;
    byYear[y].soft     += c.soft_money_total  || 0;
    byYear[y].combined += c.total_combined    || 0;
    if (!byYear[y].topCandidate || (c.total_combined || 0) > byYear[y].topCandidate.total) {
      byYear[y].topCandidate = { acct_num: c.acct_num, name: c.candidate_name, total: c.total_combined || 0 };
    }
  }
  return Object.values(byYear).sort((a, b) => Number(b.year) - Number(a.year));
}

export default function CyclesList() {
  const stats = JSON.parse(
    readFileSync(join(process.cwd(), 'public', 'data', 'candidate_stats.json'), 'utf-8')
  );
  const cycles = buildCycleSummaries(stats);
  const grandTotal = cycles.reduce((s, c) => s + c.combined, 0);

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      <BackLinks links={[{ href: '/', label: 'home' }, { href: '/elections', label: 'elections' }, { href: '/party-finance', label: 'party finance' }]} />

      <SectionHeader title="Election Cycles" eyebrow="Florida · 2008–present" />
      <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.6, maxWidth: '520px', marginTop: '-0.5rem', marginBottom: '0.75rem' }}>
        Compare campaign finance across every Florida election cycle since 2008. See which cycles had the most spending, which candidates dominated, and how the money has shifted over time.
      </p>
      <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <span>{cycles.length} election cycles tracked</span>
        <span style={{ color: 'var(--orange)', fontWeight: 700 }}>{fmt(grandTotal)} total</span>
        <span>Florida candidates · 2008–present</span>
      </div>

      {/* Timeline bar */}
      <div style={{ display: 'flex', gap: '2px', height: '8px', marginBottom: '2rem', alignItems: 'flex-end' }}>
        {[...cycles].reverse().map(c => {
          const pct = grandTotal > 0 ? (c.combined / grandTotal) * 100 : 0;
          return (
            <a key={c.year} href={`/cycle/${c.year}`} style={{ display: 'block', flex: 1, textDecoration: 'none' }}>
              <div style={{
                height: `${Math.max(pct * 0.8, 10)}%`, minHeight: '4px', maxHeight: '100%',
                background: 'var(--orange)', borderRadius: '1px', opacity: 0.6,
                transition: 'opacity 0.15s',
              }} />
            </a>
          );
        })}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {[
                { label: 'Cycle',       align: 'left'  },
                { label: 'Candidates',  align: 'right' },
                { label: 'Hard Money',  align: 'right' },
                { label: 'Soft Money',  align: 'right' },
                { label: 'Combined',    align: 'right' },
                { label: 'Top Raiser',  align: 'left'  },
              ].map(({ label, align }) => (
                <th key={label} style={{
                  padding: '0.4rem 0.6rem', textAlign: align,
                  fontSize: '0.6rem', color: 'var(--text-dim)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cycles.map(c => (
              <tr key={c.year} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                <td style={{ padding: '0.45rem 0.6rem' }}>
                  <a href={`/cycle/${c.year}`} style={{
                    color: 'var(--orange)', textDecoration: 'none',
                    fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.85rem',
                  }}>
                    {c.year}
                  </a>
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                  {c.candidates.toLocaleString()}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--blue)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                  {fmt(c.hard)}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--teal)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                  {c.soft > 0 ? fmt(c.soft) : <span style={{ opacity: 0.4 }}>—</span>}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--orange)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                  {fmt(c.combined)}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.68rem', maxWidth: '200px' }}>
                  {c.topCandidate?.acct_num ? (
                    <a href={`/candidate/${c.topCandidate.acct_num}`}
                      style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                      {c.topCandidate.name}
                      <span style={{ color: 'var(--text-dim)', marginLeft: '0.4rem', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                        {fmt(c.topCandidate.total)}
                      </span>
                    </a>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{
        marginTop: '2.5rem', padding: '0.85rem 1rem',
        border: '1px solid rgba(77,216,240,0.25)', borderRadius: '3px',
        background: 'rgba(77,216,240,0.04)', fontSize: '0.78rem', lineHeight: 1.5,
      }}>
        <span style={{ color: 'var(--text-dim)' }}>State-level only. For U.S. Senate, House, and Presidential candidates from Florida, see </span>
        <a href="/federal?cycle=2026" style={{ color: 'var(--teal)', textDecoration: 'none', fontWeight: 700 }}>
          FL Federal Candidates →
        </a>
      </div>

      <div style={{ marginTop: '3rem' }}>
        <DataTrustBlock
          source="Florida Division of Elections — Campaign Finance Filings"
          sourceUrl="https://dos.fl.gov/elections/candidates-committees/campaign-finance/"
          
          direct={['total raised per cycle', 'candidate and committee counts', 'party breakdown']}
          normalized={['soft money linked from committee contributions (2020 onward)', 'hard money direct from candidate filings (2008+)']}
          caveats={[
            'Soft money (PAC/committee receipts) linked from 2020 onward only — earlier cycles show hard money only.',
            'Cycle totals include all state-level offices. Federal candidates excluded.',
          ]}
        />
      </div>
    </main>
  );
}
