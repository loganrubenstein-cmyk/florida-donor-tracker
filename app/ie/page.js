import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import importDynamic from 'next/dynamic';
import Link from 'next/link';
import SectionHeader from '@/components/shared/SectionHeader';
import { getDb } from '@/lib/db';
import { fmtMoneyCompact, fmtCount } from '../../lib/fmt';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import { getPoliticianSlugByAcctNum } from '@/lib/loadCandidate';

const IEYearChart = importDynamic(() => import('@/components/ie/IEYearChart'), { ssr: false });

export const revalidate = 1800;

export const metadata = {
  title: 'Independent Expenditures',
  description: 'Florida independent expenditures and electioneering communications — $2.77B tracked across 1,698 committees from 1996–2026.',
};

async function loadData() {
  const db = getDb();

  const [
    { data: committeeRows },
    { data: yearRows },
    { count: committeeCount },
  ] = await Promise.all([
    db.from('ie_committee_totals')
      .select('committee_id, committee_name, total_amount, num_transactions, support_amount, oppose_amount, year_min, year_max')
      .order('total_amount', { ascending: false })
      .limit(50),
    db.from('ie_year_totals')
      .select('cycle, total_amount, num_transactions, num_committees, support_amount, oppose_amount')
      .order('cycle', { ascending: true }),
    db.from('ie_committee_totals').select('*', { count: 'exact', head: true }),
  ]);

  const yearData = (yearRows || []).map(r => ({
    cycle:            r.cycle,
    total_amount:     parseFloat(r.total_amount || 0),
    num_transactions: parseInt(r.num_transactions || 0),
    num_committees:   parseInt(r.num_committees || 0),
    support_amount:   parseFloat(r.support_amount || 0),
    oppose_amount:    parseFloat(r.oppose_amount || 0),
  }));

  const totalAmount       = yearData.reduce((s, r) => s + r.total_amount, 0);
  const totalTransactions = yearData.reduce((s, r) => s + r.num_transactions, 0);
  const totalSupport      = yearData.reduce((s, r) => s + r.support_amount, 0);
  const totalOppose       = yearData.reduce((s, r) => s + r.oppose_amount, 0);
  const peakRow           = [...yearData].sort((a, b) => b.total_amount - a.total_amount)[0];

  return {
    summary: {
      total_amount:       totalAmount,
      total_support:      totalSupport,
      total_oppose:       totalOppose,
      num_committees:     committeeCount ?? 0,
      total_transactions: totalTransactions,
      num_cycles:         yearData.length,
      peak_cycle:         peakRow?.cycle,
      peak_amount:        peakRow?.total_amount || 0,
      year_min:           yearData[0]?.cycle,
      year_max:           yearData.at(-1)?.cycle,
    },
    committees: (committeeRows || []).map(r => ({
      committee_id:     r.committee_id,
      committee_name:   r.committee_name,
      total_amount:     parseFloat(r.total_amount || 0),
      num_transactions: parseInt(r.num_transactions || 0),
      support_amount:   parseFloat(r.support_amount || 0),
      oppose_amount:    parseFloat(r.oppose_amount || 0),
      year_min:         r.year_min,
      year_max:         r.year_max,
    })),
    yearData,
  };
}

function loadTargetedCandidates() {
  try {
    const dir = join(process.cwd(), 'public', 'data', 'ie', 'by_candidate');
    const files = readdirSync(dir);
    const rows = files.map(f => {
      try { return JSON.parse(readFileSync(join(dir, f), 'utf-8')); } catch { return null; }
    }).filter(Boolean);
    return rows.sort((a, b) => (b.total_ie_amount || 0) - (a.total_ie_amount || 0));
  } catch {
    return [];
  }
}

export default async function IEPage() {
  const { summary, committees, yearData } = await loadData();
  const top25  = committees.slice(0, 25);
  const targetedCandidates = loadTargetedCandidates();

  const dateRange = summary.year_min && summary.year_max
    ? `${summary.year_min}–${summary.year_max}`
    : '—';

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/committees" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Committees</Link>
        {' / '}
        <span>Independent Expenditures</span>
      </div>

      <SectionHeader title="Independent Expenditures" eyebrow="Florida · Outside Spending" />
      <p style={{ color: 'var(--text)', opacity: 0.72, fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '0.25rem', marginTop: '-0.75rem' }}>
        Florida independent expenditures (IE) and electioneering communications (EC) — spending by committees
        to advocate for or against candidates, without coordinating with campaigns.
      </p>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '2rem' }}>
        Source: Florida Division of Elections. Not affiliated with the State of Florida. All data from public records.
      </p>

      {/* Stats bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)',
        marginBottom: '2.5rem', background: 'var(--surface)',
        borderRadius: '3px', border: '1px solid var(--border)', overflow: 'hidden',
      }}>
        {[
          { value: fmtMoneyCompact(summary.total_amount),       label: 'Total IE / EC',   color: 'var(--orange)' },
          { value: fmtCount(summary.num_committees),            label: 'Committees',       color: 'var(--teal)'   },
          { value: fmtCount(summary.total_transactions),        label: 'Transactions',     color: 'var(--blue)'   },
          { value: dateRange,                                   label: 'Date Range',       color: 'var(--text-dim)' },
          { value: summary.peak_cycle ? `${summary.peak_cycle} · ${fmtMoneyCompact(summary.peak_amount)}` : '—', label: 'Peak Year', color: 'var(--gold)' },
        ].map(({ value, label, color }, i) => (
          <div key={label} style={{ padding: '1rem 1.1rem', borderRight: '1px solid var(--border)' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 400, color, fontFamily: 'var(--font-serif)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.35rem' }}>{label}</div>
          </div>
        ))}
        {/* Support / Oppose breakdown */}
        <div style={{ padding: '1rem 1.1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: '0.62rem', color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>For</span>
              <span style={{ fontSize: '0.88rem', fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{fmtMoneyCompact(summary.total_support)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: '0.62rem', color: 'var(--republican)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Against</span>
              <span style={{ fontSize: '0.88rem', fontFamily: 'var(--font-mono)', color: 'var(--republican)' }}>{fmtMoneyCompact(summary.total_oppose)}</span>
            </div>
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.35rem' }}>For / Against (partial)</div>
        </div>
      </div>

      {/* Top committees + year chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '2rem', alignItems: 'start' }}>
        <div>
          <div style={{
            fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--text-dim)', fontWeight: 600,
            marginBottom: '1rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)',
          }}>
            Top Committees by IE/EC Spending
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {top25.map((c, i) => (
              <CommitteeRow key={c.committee_id || i} committee={c} rank={i + 1} maxAmount={top25[0]?.total_amount || 1} />
            ))}
            {committees.length > 25 && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', padding: '0.5rem 0.75rem' }}>
                +{(summary.num_committees - 25).toLocaleString()} more committees
              </div>
            )}
          </div>
        </div>

        <div>
          <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.75rem' }}>
              Spending by Year
            </div>
            <IEYearChart data={yearData} />
            <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginTop: '0.5rem', lineHeight: 1.5 }}>
              Peak: {summary.peak_cycle} ({fmtMoneyCompact(summary.peak_amount)}).
              Includes all calendar years, not just election cycles.
            </div>
          </div>

          <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.5rem' }}>What is an IE?</div>
            <p style={{ margin: '0 0 0.5rem' }}>
              An <strong style={{ color: 'var(--text)' }}>independent expenditure</strong> is campaign spending by a committee to
              expressly advocate for or against a candidate — without coordinating with the campaign.
            </p>
            <p style={{ margin: '0 0 0.5rem' }}>
              An <strong style={{ color: 'var(--text)' }}>electioneering communication</strong> refers to a candidate by name
              within 30 days of a primary or 60 days of a general election.
            </p>
            <p style={{ margin: '0 0 0.5rem' }}>
              Both are disclosed to the FL Division of Elections but are separate from direct contributions.{' '}
              <Link href="/methodology" style={{ color: 'var(--teal)' }}>More →</Link>
            </p>
            <p style={{ margin: 0 }}>
              Note: Candidate targeting and support/opposition direction are partially derivable from purpose text — coverage
              varies by filing era. Committee name and total amount are the most reliably complete fields.
            </p>
          </div>
        </div>
      </div>

      {targetedCandidates.length > 0 && (
        <div style={{ marginTop: '2.5rem' }}>
          <div style={{
            fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--text-dim)', fontWeight: 600,
            marginBottom: '0.4rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)',
          }}>
            Top Targeted Candidates
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', lineHeight: 1.55, marginBottom: '1rem' }}>
            Candidates named in IE/EC purpose text, matched to FL DOE finance records. Only matched candidates are shown —
            {' '}{targetedCandidates.length} of the ~{Math.round(targetedCandidates.length / 0.26)} unique targets parsed.
            This is the cut that makes IE different from direct contributions: outside spending on a specific candidate, without coordination.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.5rem' }}>
            {targetedCandidates.slice(0, 12).map((c) => {
              const polSlug = c.candidate_acct_num ? getPoliticianSlugByAcctNum(c.candidate_acct_num) : null;
              const href = polSlug ? `/politician/${polSlug}` : `/candidate/${c.candidate_acct_num}`;
              const yrs = (c.by_year || []).map(y => y.year);
              const yrRange = yrs.length ? (yrs[0] === yrs[yrs.length - 1] ? String(yrs[0]) : `${yrs[0]}–${yrs[yrs.length - 1]}`) : '';
              return (
                <Link key={c.candidate_acct_num} href={href} style={{
                  textDecoration: 'none', padding: '0.7rem 0.85rem',
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
                  display: 'flex', flexDirection: 'column', gap: '0.3rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--orange)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.candidate_name}
                    </span>
                    <span style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)', color: 'var(--orange)', fontWeight: 700, flexShrink: 0 }}>
                      {fmtMoneyCompact(c.total_ie_amount)}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
                    <span>{c.num_committees} committee{c.num_committees !== 1 ? 's' : ''}</span>
                    <span>{c.num_expenditures} expenditures</span>
                    {yrRange && <span>{yrRange}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ maxWidth: '900px', margin: '2rem auto 0' }}>
        <DataTrustBlock
          source="Florida Division of Elections — IE/EC Filings"
          sourceUrl="https://dos.fl.gov/elections/candidates-committees/campaign-finance/"
          direct={['committee name', 'total amount', 'transaction count', 'expenditure date', 'purpose']}
          normalized={['committee linked to profile by name match', 'calendar year derived from expenditure date']}
          caveats={[
            'Candidate targeting is not reliably derivable from purpose text in FL state filings.',
            'Does not include federal IE filings (FEC). Florida state filings only.',
            'Support vs. opposition direction is partially parsed from purpose text — coverage varies by filing era and committee.',
            'Historical filings back to 1996 — data quality and completeness vary by era.',
          ]}
        />
      </div>
    </main>
  );
}

function CommitteeRow({ committee: c, rank, maxAmount }) {
  const pct = (c.total_amount / maxAmount * 100).toFixed(1);
  const yearStr = c.year_min && c.year_max
    ? (c.year_min === c.year_max ? String(c.year_min) : `${c.year_min}–${c.year_max}`)
    : '';
  return (
    <div style={{ padding: '0.6rem 0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.3rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', width: '20px', flexShrink: 0 }}>{rank}.</span>
          {c.committee_id ? (
            <Link href={`/committee/${c.committee_id}`} style={{
              fontSize: '0.78rem', fontWeight: 500, color: 'var(--teal)', textDecoration: 'none',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {c.committee_name}
            </Link>
          ) : (
            <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.committee_name}
            </span>
          )}
        </div>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--orange)', fontFamily: 'var(--font-mono)', marginLeft: '0.5rem', flexShrink: 0 }}>
          {fmtMoneyCompact(c.total_amount)}
        </span>
      </div>
      <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', marginBottom: '0.3rem' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--orange)', borderRadius: '2px', opacity: 0.55 }} />
      </div>
      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.68rem', color: 'var(--text-dim)', flexWrap: 'wrap' }}>
        <span>{fmtCount(c.num_transactions)} transactions</span>
        {yearStr && <span>{yearStr}</span>}
        {c.support_amount > 0 && (
          <span style={{ color: 'var(--green)' }}>For {fmtMoneyCompact(c.support_amount)}</span>
        )}
        {c.oppose_amount > 0 && (
          <span style={{ color: 'var(--republican)' }}>Against {fmtMoneyCompact(c.oppose_amount)}</span>
        )}
      </div>
    </div>
  );
}
