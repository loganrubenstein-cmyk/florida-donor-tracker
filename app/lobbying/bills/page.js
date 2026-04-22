import Link from 'next/link';
import SectionHeader from '@/components/shared/SectionHeader';
import { getDb } from '@/lib/db';
import { fmtCount } from '../../../lib/fmt';
import { slugify } from '@/lib/slugify';
import DataTrustBlock from '@/components/shared/DataTrustBlock';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Most Lobbied Bills',
  description: 'Florida bills with the most lobbyist disclosure filings, by session year. See which legislation attracted the most lobbying activity 2017–2026.',
};

// Appropriations bill patterns
const BUDGET_RE    = /^(HB|SB)\s*500[0-9]$/i;
const APPROP_RE    = /^(HB|SB)\s*250[0-9]$/i;
function billCategory(canon) {
  if (BUDGET_RE.test(canon))  return 'General Appropriations';
  if (APPROP_RE.test(canon))  return 'Appropriations';
  return '';
}

async function loadData() {
  const db = getDb();

  const [
    { data: topRows },
    { data: issueRows },
    { data: lobbyistRows },
    { count: uniqueBills },
    { data: summaryAgg },
  ] = await Promise.all([
    db.from('bill_year_stats')
      .select('bill_slug, year, bill_canon, filings, unique_lobbyists, unique_principals')
      .order('filings', { ascending: false })
      .limit(300),

    db.from('bill_issue_stats')
      .select('category, total_filings')
      .order('total_filings', { ascending: false })
      .limit(15),

    db.from('bill_lobbyist_totals')
      .select('lobbyist, total_filings, top_firm')
      .order('total_filings', { ascending: false })
      .limit(15),

    db.from('bill_year_stats').select('*', { count: 'exact', head: true }),

    db.from('bill_year_stats').select('filings').order('filings', { ascending: false }).limit(10000),
  ]);

  const totalFilings = (summaryAgg || []).reduce((s, r) => s + Number(r.filings || 0), 0);

  const bills = (topRows || []).map(r => ({
    slug:              r.bill_slug,
    year:              r.year,
    bill:              r.bill_canon,
    category:          billCategory(r.bill_canon),
    filings:           Number(r.filings),
    unique_lobbyists:  Number(r.unique_lobbyists),
    unique_principals: Number(r.unique_principals),
  }));

  return {
    bills,
    topIssues:    (issueRows || []).map(r => ({ category: r.category, total_filings: Number(r.total_filings) })),
    topLobbyists: (lobbyistRows || []).map(r => ({ lobbyist: r.lobbyist, total_filings: Number(r.total_filings), firms: r.top_firm ? [r.top_firm] : [] })),
    totals: {
      total_records:  totalFilings,
      unique_bills:   uniqueBills ?? 0,
    },
  };
}

export default async function LobbyingBillsPage() {
  const { bills, topIssues, topLobbyists, totals } = await loadData();

  const budgetBills = bills.filter(b => b.category);
  const policyBills = bills.filter(b => !b.category).slice(0, 100);
  const maxIssueFiling = topIssues[0]?.total_filings || 1;

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/lobbying" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Lobbying</Link>
        {' / '}
        <span>Bills</span>
      </div>

      <SectionHeader title="Most Lobbied Bills" eyebrow="FL Lobbying · 2017–2026" />
      <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '0.25rem', marginTop: '-0.75rem' }}>
        Florida House bills ranked by lobbyist disclosure filings per session year. Each filing represents one
        lobbyist–principal pair reporting activity on that bill. Bill numbers reset each session — entries are shown per year.
      </p>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '2rem' }}>
        Source: FL House Lobbyist Disclosure portal, 2017–2026. Not affiliated with the State of Florida.
      </p>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '2.5rem', padding: '1rem 1.25rem', background: 'var(--surface)', borderRadius: '3px', border: '1px solid var(--border)' }}>
        <StatBox value={fmtCount(totals.total_records)} label="Total Filings" />
        <StatBox value={fmtCount(totals.unique_bills)}  label="Bill-Sessions" />
        <StatBox value="2017–2026" label="Years Covered" color="var(--text-dim)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem', alignItems: 'start' }}>
        <div>
          {budgetBills.length > 0 && (
            <div style={{ marginBottom: '1.5rem', padding: '0.75rem 1rem', background: 'rgba(255,208,96,0.06)', border: '1px solid rgba(255,208,96,0.2)', borderRadius: '3px', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
              <strong style={{ color: 'var(--gold)' }}>Note:</strong> General Appropriations bills (HB 5001, SB 2500 etc.)
              dominate the filing count as they appear every session and every principal that touches the budget lobbies them.
              They are shown separately below.
            </div>
          )}

          <h2 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '0.75rem' }}>
            Appropriations Bills (shown separately)
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '2rem' }}>
            {budgetBills.slice(0, 10).map(b => (
              <BillRow key={`${b.slug}__${b.year}`} bill={b} maxFilings={budgetBills[0]?.filings || 1} isBudget />
            ))}
          </div>

          <h2 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '0.75rem' }}>
            Top Policy Bills
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {policyBills.map(b => (
              <BillRow key={`${b.slug}__${b.year}`} bill={b} maxFilings={policyBills[0]?.filings || 1} />
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div>
          <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '1rem' }}>
              Top Issue Categories
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {topIssues.map(iss => {
                const pct = (iss.total_filings / maxIssueFiling * 100).toFixed(0);
                return (
                  <div key={iss.category}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '2px' }}>
                      <span style={{ color: 'var(--text-dim)', flex: 1, marginRight: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{iss.category}</span>
                      <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>{fmtCount(iss.total_filings)}</span>
                    </div>
                    <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: '#4dd8f0', borderRadius: '2px', opacity: 0.6 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.75rem' }}>
              Most Active Lobbyists
              <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontWeight: 400, marginLeft: '0.4rem' }}>(by filings 2017–2026)</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {topLobbyists.map((l, i) => (
                <div key={l.lobbyist} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                    <span style={{ color: 'var(--text-dim)', width: '16px', flexShrink: 0 }}>{i + 1}.</span>
                    <div>
                      <Link href={`/lobbyist/${slugify(l.lobbyist)}`}
                        style={{ color: 'var(--teal)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                        {l.lobbyist}
                      </Link>
                      {l.firms[0] && <div style={{ color: 'var(--text-dim)', fontSize: '0.68rem' }}>{l.firms[0]}</div>}
                    </div>
                  </div>
                  <div style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', flexShrink: 0, marginLeft: '0.5rem' }}>
                    {fmtCount(l.total_filings)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '3rem' }}>
        <DataTrustBlock
          source="FL House Lobbyist Disclosure Portal"
          sourceUrl="https://www.flhouse.gov/Sections/Lobbyist/lobbyist.aspx"
          direct={['bill number', 'lobbyist name', 'principal name', 'filing year', 'issue category']}
          normalized={['filings aggregated by bill per session year', 'bill numbers treated as session-specific (reset each year)']}
          caveats={[
            'Coverage: 2017–2026 Florida House lobbyist disclosure filings only.',
            'Each filing = one lobbyist–principal pair for one year. Bill numbers reset each session — HB 220 in 2025 is unrelated to HB 220 in 2018.',
            'General Appropriations bills are separated because they appear every session and dominate raw filing counts.',
          ]}
        />
      </div>
    </main>
  );
}

function StatBox({ value, label, color = 'var(--teal)' }) {
  return (
    <div>
      <div style={{ fontSize: '1.3rem', fontWeight: 400, color, fontFamily: 'var(--font-serif)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  );
}

function BillRow({ bill, maxFilings, isBudget = false }) {
  const barPct = (bill.filings / maxFilings * 100).toFixed(1);

  return (
    <div style={{ padding: '0.6rem 0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.35rem', flexWrap: 'wrap', gap: '0.25rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Link
            href={`/lobbying/bill/${bill.slug}?year=${bill.year}`}
            style={{ fontSize: '0.82rem', fontWeight: 600, color: isBudget ? 'var(--gold)' : 'var(--teal)', fontFamily: 'var(--font-mono)', textDecoration: 'none' }}
          >
            {bill.bill}
          </Link>
          {bill.category && (
            <span style={{ fontSize: '0.68rem', color: 'var(--gold)', background: 'rgba(255,208,96,0.08)', padding: '1px 5px', borderRadius: '3px', border: '1px solid rgba(255,208,96,0.2)' }}>
              {bill.category}
            </span>
          )}
        </div>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{bill.year}</span>
      </div>

      <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', marginBottom: '0.4rem' }}>
        <div style={{ height: '100%', width: `${barPct}%`, background: isBudget ? '#ffd060' : '#4dd8f0', borderRadius: '2px', opacity: 0.7 }} />
      </div>

      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.72rem', color: 'var(--text-dim)', flexWrap: 'wrap' }}>
        <span><span style={{ color: isBudget ? 'var(--gold)' : 'var(--teal)', fontFamily: 'var(--font-mono)' }}>{fmtCount(bill.filings)}</span> filings</span>
        <span><span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{fmtCount(bill.unique_principals)}</span> principals</span>
        <span><span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{fmtCount(bill.unique_lobbyists)}</span> lobbyists</span>
      </div>
    </div>
  );
}
