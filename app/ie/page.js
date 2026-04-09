import Link from 'next/link';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fmtMoney, fmtMoneyCompact, fmtCount } from '../../lib/fmt';

export const metadata = {
  title: 'Independent Expenditures — Florida Donor Tracker',
  description: 'Florida independent expenditures and electioneering communications — $70.9M tracked across 492 committees.',
};

function loadData() {
  const base = join(process.cwd(), 'public', 'data', 'ie');
  try {
    const summary = JSON.parse(readFileSync(join(base, 'summary.json'), 'utf8'));
    const byCommDir = join(base, 'by_committee');
    const fs = require('fs');
    const files = fs.readdirSync(byCommDir).filter(f => f.endsWith('.json'));
    const committees = files.map(f => {
      try {
        return JSON.parse(fs.readFileSync(join(byCommDir, f), 'utf8'));
      } catch { return null; }
    }).filter(Boolean);
    committees.sort((a, b) => (b.total_amount || 0) - (a.total_amount || 0));
    return { summary, committees };
  } catch { return { summary: {}, committees: [] }; }
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

export default function IEPage() {
  const { summary, committees } = loadData();

  const byType    = summary.by_type || [];
  const maxType   = byType[0]?.total_amount || 1;
  const top25     = committees.slice(0, 25);

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
              <CommitteeRow key={c.acct_num} committee={c} rank={i + 1} maxAmount={top25[0].total_amount} />
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
  const byYear = c.by_year || [];
  const yearStr = byYear.length > 0
    ? `${byYear[0].year}–${byYear[byYear.length - 1].year}`
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
