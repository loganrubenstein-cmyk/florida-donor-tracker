import Link from 'next/link';
import { getDb } from '@/lib/db';
import { fmtMoney, fmtMoneyCompact, fmtCount } from '../../lib/fmt';
import DataTrustBlock from '@/components/shared/DataTrustBlock';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Independent Expenditures — Florida Donor Tracker',
  description: 'Florida independent expenditures and electioneering communications — $70.9M tracked across 492 committees.',
};

async function loadData() {
  try {
    const db = getDb();
    const [{ data: summaryRows }, { data: committees }, { data: candidates }] = await Promise.all([
      db.from('ie_summary').select('total_amount, total_rows, num_committees, date_start, date_end, by_type').limit(1),
      db.from('ie_committees').select('acct_num, committee_name, total_amount, num_transactions, year_min, year_max')
        .order('total_amount', { ascending: false }).limit(50),
      db.from('ie_candidates').select('candidate_acct_num, candidate_name, total_ie_amount, num_expenditures, num_committees, by_year')
        .order('total_ie_amount', { ascending: false }),
    ]);
    const s = summaryRows?.[0] || {};
    return {
      summary: {
        total_amount:   parseFloat(s.total_amount) || 0,
        total_rows:     s.total_rows || 0,
        num_committees: s.num_committees || 0,
        date_range:     { start: s.date_start, end: s.date_end },
        by_type:        s.by_type ? JSON.parse(s.by_type) : [],
      },
      committees: (committees || []).map(c => ({
        acct_num:         c.acct_num,
        committee_name:   c.committee_name,
        total_amount:     parseFloat(c.total_amount) || 0,
        num_transactions: c.num_transactions || 0,
        year_min:         c.year_min,
        year_max:         c.year_max,
      })),
      targetedCandidates: (candidates || []).map(c => ({
        candidate_acct_num: c.candidate_acct_num,
        candidate_name:     c.candidate_name,
        total_ie_amount:    parseFloat(c.total_ie_amount) || 0,
        num_expenditures:   c.num_expenditures || 0,
        num_committees:     c.num_committees || 0,
        by_year:            c.by_year || [],
      })),
    };
  } catch { return { summary: {}, committees: [], targetedCandidates: [] }; }
}

const TYPE_LABELS = {
  ECC: 'Electioneering Communication',
  ECI: 'EC In-Kind',
  IEC: 'Independent Expenditure – Communication',
  IEI: 'IE In-Kind',
  IEO: 'IE Opposition',
  IES: 'IE Support',
};
const TYPE_COLORS = {
  ECC: 'var(--teal)',
  ECI: 'var(--teal)',
  IEC: 'var(--orange)',
  IEI: 'var(--orange)',
  IEO: 'var(--republican)',
  IES: 'var(--democrat)',
};

export default async function IEPage() {
  const { summary, committees, targetedCandidates } = await loadData();

  const byType  = summary.by_type || [];
  const maxType = byType[0]?.total_amount || 1;
  const top25   = committees.slice(0, 25);

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <span>Independent Expenditures</span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', color: 'var(--text)', marginBottom: '0.25rem' }}>
        Independent Expenditures
      </h1>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '0.25rem' }}>
        Florida independent expenditures (IE) and electioneering communications (EC) — spending by committees
        to advocate for or against candidates, without coordinating with campaigns.
      </p>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '2rem' }}>
        Source: Florida Division of Elections. Not affiliated with the State of Florida. All data from public records.
      </p>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '2.5rem', padding: '1rem 1.25rem', background: 'var(--surface)', borderRadius: '6px', border: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--orange)', fontFamily: 'var(--font-mono)' }}>{fmtMoney(summary.total_amount || 0)}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total IE / EC Spending</div>
        </div>
        <StatBox value={fmtCount(summary.num_committees)} label="Committees" />
        <StatBox value={fmtCount(summary.total_rows)} label="Transactions" />
        <StatBox value={summary.date_range?.start?.slice(0,4) + '–' + summary.date_range?.end?.slice(0,4)} label="Date Range" color="var(--text-dim)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '2rem', alignItems: 'start' }}>
        <div>
          {/* Top committees */}
          <h2 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '0.75rem' }}>
            Top Committees by IE/EC Spending
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {top25.map((c, i) => (
              <CommitteeRow key={c.acct_num} committee={c} rank={i + 1} maxAmount={top25[0]?.total_amount || 1} />
            ))}
            {committees.length > 25 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', padding: '0.5rem 0.75rem' }}>
                +{committees.length - 25} more committees
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div>
          {/* By type breakdown */}
          <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '1rem' }}>
              By Expenditure Type
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {byType.map(t => {
                const pct = (t.total_amount / maxType * 100).toFixed(0);
                const color = TYPE_COLORS[t.type_code] || 'var(--text-dim)';
                const label = TYPE_LABELS[t.type_code] || t.label || t.type_code;
                return (
                  <div key={t.type_code}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '2px' }}>
                      <span style={{ color: 'var(--text-dim)', flex: 1, marginRight: '0.5rem' }}>{label}</span>
                      <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{fmtMoneyCompact(t.total_amount)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <div style={{ flex: 1, height: '4px', background: 'var(--border)', borderRadius: '2px' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px', opacity: 0.7 }} />
                      </div>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', width: '28px', textAlign: 'right' }}>{fmtCount(t.num_rows)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* What is IE */}
          <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.5rem' }}>What is an IE?</div>
            <p style={{ margin: '0 0 0.5rem' }}>
              An <strong style={{ color: 'var(--text)' }}>independent expenditure</strong> is campaign spending by a committee to
              expressly advocate for or against a candidate — without coordinating with the campaign.
            </p>
            <p style={{ margin: '0 0 0.5rem' }}>
              An <strong style={{ color: 'var(--text)' }}>electioneering communication</strong> refers to a candidate by name
              within 30 days of a primary or 60 days of a general election.
            </p>
            <p style={{ margin: 0 }}>
              Both are disclosed to the FL Division of Elections but are separate from direct candidate contributions.{' '}
              <Link href="/methodology" style={{ color: 'var(--teal)' }}>More →</Link>
            </p>
          </div>
        </div>
      </div>

      {/* Targeted candidates */}
      {targetedCandidates.length > 0 && (
        <div style={{ marginTop: '2.5rem' }}>
          <h2 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '0.4rem' }}>
            Candidates Targeted by IE / EC Spending
          </h2>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '1rem', lineHeight: 1.6 }}>
            {targetedCandidates.length} candidates identified from IE filing descriptions — amounts shown are spending traceable to each candidate.
            Name matching is approximate; some filings could not be linked.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.5rem' }}>
            {targetedCandidates.map(c => {
              const maxYear = c.by_year?.reduce((m, y) => y.year > m ? y.year : m, 0);
              const minYear = c.by_year?.reduce((m, y) => y.year < m ? y.year : m, 9999);
              const yearStr = minYear === maxYear ? String(minYear) : `${minYear}–${maxYear}`;
              return (
                <div key={c.candidate_acct_num} style={{
                  padding: '0.6rem 0.85rem', background: 'var(--surface)',
                  border: '1px solid var(--border)', borderRadius: '4px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.25rem' }}>
                    <Link href={`/candidate/${c.candidate_acct_num}`} style={{
                      fontSize: '0.82rem', fontWeight: 500, color: 'var(--teal)', textDecoration: 'none',
                    }}>
                      {c.candidate_name}
                    </Link>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--orange)', fontFamily: 'var(--font-mono)', flexShrink: 0, marginLeft: '0.5rem' }}>
                      {fmtMoney(c.total_ie_amount)}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    {fmtCount(c.num_expenditures)} exp · {c.num_committees} committee{c.num_committees !== 1 ? 's' : ''} · {yearStr}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ maxWidth: '900px', margin: '2rem auto 0', padding: '0 1.5rem' }}>
        <DataTrustBlock
          source="Florida Division of Elections — IE/EC Filings"
          sourceUrl="https://dos.elections.myflorida.com/independent-expenditures/"
          lastUpdated="April 2026"
          direct={['committee name', 'total amount', 'transaction count', 'expenditure type']}
          normalized={['IE vs EC classification (based on filing type code)']}
          caveats={[
            'Covers committee-level totals only — individual transaction detail is not yet loaded.',
            'Does not include federal IE filings (FEC). Florida state filings only.',
            '21 candidates identified from IE filing descriptions — matching is approximate (name substring). Some filings could not be linked to a candidate.',
          ]}
        />
      </div>
    </main>
  );
}

function StatBox({ value, label, color = 'var(--teal)' }) {
  return (
    <div>
      <div style={{ fontSize: '1.3rem', fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{value}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  );
}

function CommitteeRow({ committee: c, rank, maxAmount }) {
  const pct = (c.total_amount / maxAmount * 100).toFixed(1);
  const yearStr = c.year_min && c.year_max
    ? (c.year_min === c.year_max ? String(c.year_min) : `${c.year_min}–${c.year_max}`)
    : '';

  return (
    <div style={{ padding: '0.6rem 0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.3rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', width: '20px', flexShrink: 0 }}>{rank}.</span>
          <Link href={`/committee/${c.acct_num}`} style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.committee_name}
          </Link>
        </div>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--orange)', fontFamily: 'var(--font-mono)', marginLeft: '0.5rem', flexShrink: 0 }}>
          {fmtMoney(c.total_amount)}
        </span>
      </div>
      <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', marginBottom: '0.3rem' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--orange)', borderRadius: '2px', opacity: 0.6 }} />
      </div>
      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
        <span>{fmtCount(c.num_transactions)} transactions</span>
        {yearStr && <span>{yearStr}</span>}
      </div>
    </div>
  );
}
