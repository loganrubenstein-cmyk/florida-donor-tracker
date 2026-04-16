import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import Link from 'next/link';
import SectionHeader from '@/components/shared/SectionHeader';
import { getDb } from '@/lib/db';
import { fmtMoneyCompact, fmtCount } from '../../lib/fmt';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import IECandidatesTable from '@/components/ie/IECandidatesTable';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Independent Expenditures',
  description: 'Florida independent expenditures and electioneering communications — $70.9M tracked across 492 committees.',
};

const TYPE_LABELS = {
  ECC: 'Electioneering Communication',
  ECI: 'EC In-Kind',
  IEC: 'Independent Expenditure – Communication',
  IEI: 'IE In-Kind',
  IEO: 'IE Opposition',
  IES: 'IE Support',
};
const TYPE_COLORS = {
  ECC: 'var(--teal)',   ECI: 'var(--teal)',
  IEC: 'var(--orange)', IEI: 'var(--orange)',
  IEO: 'var(--republican)', IES: 'var(--democrat)',
};

async function loadData() {
  const db = getDb();
  const [{ data: summaryRows }, { data: ieCommittees }, { data: dbCandidates }] = await Promise.all([
    db.from('ie_summary').select('total_amount, total_rows, num_committees, date_start, date_end, by_type').limit(1),
    db.from('ie_committees').select('acct_num, committee_name, total_amount, num_transactions, year_min, year_max')
      .order('total_amount', { ascending: false }).limit(50),
    db.from('ie_candidates').select('candidate_acct_num, candidate_name, total_ie_amount, num_expenditures, num_committees, by_year')
      .order('total_ie_amount', { ascending: false }),
  ]);

  // Fill missing committee names from committees table
  const missingAccts = (ieCommittees || []).filter(c => !c.committee_name).map(c => c.acct_num);
  const nameMap = {};
  if (missingAccts.length > 0) {
    const { data: rows } = await db.from('committees').select('acct_num, committee_name').in('acct_num', missingAccts);
    for (const r of rows || []) nameMap[r.acct_num] = r.committee_name;
  }

  // Read by_candidate/*.json for spending_committees
  const byAcctSpending = {};
  try {
    const dir = join(process.cwd(), 'public', 'data', 'ie', 'by_candidate');
    for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
      const d = JSON.parse(readFileSync(join(dir, f), 'utf-8'));
      if (d.candidate_acct_num && d.spending_committees) {
        byAcctSpending[String(d.candidate_acct_num)] = d.spending_committees;
      }
    }
  } catch {}

  // Batch-load committee names for all spending_committee acct_nums
  const allSpendAccts = [...new Set(
    Object.values(byAcctSpending).flat().map(c => String(c.acct_num))
  )];
  const commNameMap = {};
  if (allSpendAccts.length > 0) {
    const { data: rows } = await db.from('committees').select('acct_num, committee_name').in('acct_num', allSpendAccts);
    for (const r of rows || []) commNameMap[String(r.acct_num)] = r.committee_name;
  }
  for (const c of ieCommittees || []) {
    const n = c.committee_name || nameMap[c.acct_num];
    if (n) commNameMap[String(c.acct_num)] = n;
  }

  const s = summaryRows?.[0] || {};
  const byType = s.by_type ? JSON.parse(s.by_type) : [];
  const forAmount     = byType.filter(t => t.type_code === 'IES').reduce((s, t) => s + (parseFloat(t.total_amount) || 0), 0);
  const againstAmount = byType.filter(t => t.type_code === 'IEO').reduce((s, t) => s + (parseFloat(t.total_amount) || 0), 0);

  return {
    summary: {
      total_amount:   parseFloat(s.total_amount) || 0,
      total_rows:     s.total_rows || 0,
      num_committees: s.num_committees || 0,
      date_range:     { start: s.date_start, end: s.date_end },
      by_type:        byType,
      for_amount:     forAmount,
      against_amount: againstAmount,
    },
    committees: (ieCommittees || []).map(c => ({
      acct_num:         c.acct_num,
      committee_name:   c.committee_name || nameMap[c.acct_num] || `Committee ${c.acct_num}`,
      total_amount:     parseFloat(c.total_amount) || 0,
      num_transactions: c.num_transactions || 0,
      year_min:         c.year_min,
      year_max:         c.year_max,
    })),
    candidates: (dbCandidates || []).map(c => ({
      candidate_acct_num: c.candidate_acct_num,
      candidate_name:     c.candidate_name,
      total_ie_amount:    parseFloat(c.total_ie_amount) || 0,
      num_expenditures:   c.num_expenditures || 0,
      num_committees:     c.num_committees || 0,
      by_year:            c.by_year || [],
      spending_committees: (byAcctSpending[String(c.candidate_acct_num)] || [])
        .map(sc => ({
          acct_num: sc.acct_num,
          amount:   parseFloat(sc.amount) || 0,
          name:     commNameMap[String(sc.acct_num)] || `Committee ${sc.acct_num}`,
        }))
        .sort((a, b) => b.amount - a.amount),
    })),
  };
}

export default async function IEPage() {
  const { summary, committees, candidates } = await loadData();

  const byType  = summary.by_type || [];
  const maxType = Math.max(...byType.map(t => parseFloat(t.total_amount) || 0), 1);
  const top25   = committees.slice(0, 25);

  const dateRange = (summary.date_range?.start?.slice(0, 4) || '') +
    '–' + (summary.date_range?.end?.slice(0, 4) || '');

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
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
          { value: fmtMoneyCompact(summary.total_amount), label: 'Total IE / EC', color: 'var(--orange)' },
          { value: fmtCount(summary.num_committees),     label: 'Committees',     color: 'var(--teal)'   },
          { value: fmtCount(summary.total_rows),         label: 'Transactions',   color: 'var(--blue)'   },
          { value: summary.for_amount > 0 ? fmtMoneyCompact(summary.for_amount) : '—', label: 'IE Support', color: 'var(--democrat)' },
          { value: summary.against_amount > 0 ? fmtMoneyCompact(summary.against_amount) : '—', label: 'IE Opposition', color: 'var(--republican)' },
          { value: dateRange, label: 'Date Range', color: 'var(--text-dim)' },
        ].map(({ value, label, color }, i, arr) => (
          <div key={label} style={{
            padding: '1rem 1.1rem',
            borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.35rem' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Targeted Candidates — FIRST ────────────────────── */}
      {candidates.length > 0 && (
        <div style={{ marginBottom: '3rem' }}>
          <div style={{
            fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--text-dim)', fontWeight: 600,
            marginBottom: '0.6rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)',
          }}>
            Candidates Targeted by IE / EC Spending — {candidates.length} identified
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '1rem', lineHeight: 1.6 }}>
            Amounts are total outside spending traceable to each candidate from IE filing descriptions.
            Click a row to see which committees spent. Click a name to view their campaign finance profile.
          </p>
          <IECandidatesTable candidates={candidates} />
        </div>
      )}

      {/* ── Committees + Sidebar ───────────────────────────── */}
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
              <CommitteeRow key={c.acct_num} committee={c} rank={i + 1} maxAmount={top25[0]?.total_amount || 1} />
            ))}
            {committees.length > 25 && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', padding: '0.5rem 0.75rem' }}>
                +{committees.length - 25} more committees
              </div>
            )}
          </div>
        </div>

        <div>
          {/* By expenditure type */}
          <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text)', marginBottom: '1rem' }}>
              By Expenditure Type
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {byType.map(t => {
                const amt = parseFloat(t.total_amount) || 0;
                const pct = (amt / maxType * 100).toFixed(0);
                const color = TYPE_COLORS[t.type_code] || 'var(--text-dim)';
                const label = TYPE_LABELS[t.type_code] || t.label || t.type_code;
                return (
                  <div key={t.type_code}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '2px' }}>
                      <span style={{ color: 'var(--text-dim)', flex: 1, marginRight: '0.5rem' }}>{label}</span>
                      <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{fmtMoneyCompact(amt)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <div style={{ flex: 1, height: '4px', background: 'var(--border)', borderRadius: '2px' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px', opacity: 0.7 }} />
                      </div>
                      <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)', width: '30px', textAlign: 'right' }}>
                        {fmtCount(t.num_rows)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* What is an IE */}
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
            <p style={{ margin: 0 }}>
              Both are disclosed to the FL Division of Elections but are separate from direct contributions.{' '}
              <Link href="/methodology" style={{ color: 'var(--teal)' }}>More →</Link>
            </p>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '2rem auto 0' }}>
        <DataTrustBlock
          source="Florida Division of Elections — IE/EC Filings"
          sourceUrl="https://dos.elections.myflorida.com/independent-expenditures/"
          direct={['committee name', 'total amount', 'transaction count', 'expenditure type']}
          normalized={['IE vs EC classification (based on filing type code)', 'candidate name matching from filing descriptions']}
          caveats={[
            'Candidate matching is approximate — extracted from IE filing purpose descriptions.',
            'Does not include federal IE filings (FEC). Florida state filings only.',
            'Support vs. opposition split reflects IES/IEO type codes — some filings use general IE codes without explicit direction.',
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
          <Link href={`/committee/${c.acct_num}`} style={{
            fontSize: '0.78rem', fontWeight: 500, color: 'var(--text)', textDecoration: 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {c.committee_name}
          </Link>
        </div>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--orange)', fontFamily: 'var(--font-mono)', marginLeft: '0.5rem', flexShrink: 0 }}>
          {fmtMoneyCompact(c.total_amount)}
        </span>
      </div>
      <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', marginBottom: '0.3rem' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--orange)', borderRadius: '2px', opacity: 0.55 }} />
      </div>
      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
        <span>{fmtCount(c.num_transactions)} transactions</span>
        {yearStr && <span>{yearStr}</span>}
      </div>
    </div>
  );
}
