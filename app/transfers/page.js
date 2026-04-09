import Link from 'next/link';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fmtMoney, fmtCount } from '../../lib/fmt';

export const metadata = {
  title: 'Committee Transfers — Florida Donor Tracker',
  description: 'Florida committee-to-committee money transfers — $147M tracked. See which committees are funding other committees.',
};

function loadData() {
  const base = join(process.cwd(), 'public', 'data', 'transfers');
  try {
    const summary  = JSON.parse(readFileSync(join(base, 'summary.json'), 'utf8'));
    const topFlows = JSON.parse(readFileSync(join(base, 'top_flows.json'), 'utf8'));
    // sender_name is pre-baked into top_flows.json — no index lookup needed
    return { summary, topFlows };
  } catch { return { summary: {}, topFlows: [] }; }
}

export default function TransfersPage() {
  const { summary, topFlows } = loadData();

  // Group by sender to show top sending committees
  const bySender = {};
  for (const f of topFlows) {
    const key = f.sender_acct_num;
    if (!bySender[key]) {
      bySender[key] = { acct_num: key, name: f.sender_name, total: 0, flows: [] };
    }
    bySender[key].total += f.total_amount;
    bySender[key].flows.push(f);
  }
  const senders = Object.values(bySender).sort((a, b) => b.total - a.total).slice(0, 20);
  const maxSender = senders[0]?.total || 1;

  // Top individual flows (sorted by amount)
  const top30flows = [...topFlows].sort((a, b) => b.total_amount - a.total_amount).slice(0, 30);
  const maxFlow = top30flows[0]?.total_amount || 1;

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <span>Transfers</span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', color: 'var(--text)', marginBottom: '0.25rem' }}>
        Committee-to-Committee Transfers
      </h1>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '0.25rem' }}>
        Money moved between Florida political committees. Transfers show how PC/PAC networks funnel money —
        a single large donor can fund many candidates through a chain of committee transfers.
      </p>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '2rem' }}>
        Source: Florida Division of Elections. Not affiliated with the State of Florida. All data from public records.
      </p>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '2.5rem', padding: '1rem 1.25rem', background: 'var(--surface)', borderRadius: '6px', border: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>{fmtMoney(summary.total_amount || 0)}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Transferred</div>
        </div>
        <StatBox value={fmtCount(summary.total_transfers)} label="Transfers" />
        <StatBox value={fmtCount(summary.num_sending_committees)} label="Sending Committees" />
        <StatBox value={fmtCount(summary.num_unique_recipients)} label="Recipients" />
        <StatBox value={fmtCount(summary.num_linked_to_committee)} label="Linked to Profiles" color="var(--orange)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
        {/* Top senders */}
        <div>
          <h2 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '0.75rem' }}>
            Top Sending Committees
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {senders.map((s, i) => (
              <div key={s.acct_num} style={{ padding: '0.6rem 0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.3rem' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', width: '20px', flexShrink: 0 }}>{i + 1}.</span>
                    <Link href={`/committee/${s.acct_num}`} style={{ fontSize: '0.78rem', color: 'var(--text)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.name}
                    </Link>
                  </div>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--teal)', fontFamily: 'var(--font-mono)', marginLeft: '0.5rem', flexShrink: 0 }}>
                    {fmtMoney(s.total)}
                  </span>
                </div>
                <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px' }}>
                  <div style={{ height: '100%', width: `${(s.total / maxSender * 100).toFixed(1)}%`, background: 'var(--teal)', borderRadius: '2px', opacity: 0.6 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top individual flows */}
        <div>
          <h2 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '0.75rem' }}>
            Largest Individual Transfers
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {top30flows.map((f, i) => (
              <div key={i} style={{ padding: '0.6rem 0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--orange)', fontFamily: 'var(--font-mono)' }}>
                    {fmtMoney(f.total_amount)}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                    {f.years?.join(', ')}
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '0.15rem' }}>
                  <span style={{ color: 'var(--text)' }}>
                    <Link href={`/committee/${f.sender_acct_num}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>
                      {f.sender_name}
                    </Link>
                  </span>
                  <span style={{ margin: '0 0.3rem', color: 'var(--teal)' }}>→</span>
                  {f.transferee_acct_num ? (
                    <Link href={`/committee/${f.transferee_acct_num}`} style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>
                      {f.transferee_name}
                    </Link>
                  ) : (
                    <span>{f.transferee_name}</span>
                  )}
                </div>
                <div style={{ height: '2px', background: 'var(--border)', borderRadius: '1px' }}>
                  <div style={{ height: '100%', width: `${(f.total_amount / maxFlow * 100).toFixed(1)}%`, background: 'var(--orange)', borderRadius: '1px', opacity: 0.5 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text)' }}>Data notes:</strong> Transfers sourced from FL Division of Elections expenditure filings where payee type indicates a political committee.
        Some recipients may not have active committee profiles in this database if they are out-of-state or federal entities.
        Date range: {summary.date_range?.start?.slice(0,4)} – {summary.date_range?.end?.slice(0,4)}.{' '}
        {summary.dropped_rows_out_of_range_date > 0 && (
          <>{summary.dropped_rows_out_of_range_date.toLocaleString()} rows with out-of-range dates were excluded. </>
        )}
        <Link href="/network/graph" style={{ color: 'var(--teal)' }}>View in network graph →</Link>
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
