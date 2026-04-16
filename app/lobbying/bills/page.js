import Link from 'next/link';
import SectionHeader from '@/components/shared/SectionHeader';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fmtCount } from '../../../lib/fmt';
import { slugify } from '@/lib/slugify';
import DataTrustBlock from '@/components/shared/DataTrustBlock';

export const metadata = {
  title: 'Most Lobbied Bills',
  description: 'Florida bills with the most lobbyist disclosure filings. See which legislation attracted the most lobbying activity 2016–2026.',
};

function loadData() {
  const base = join(process.cwd(), 'public', 'data', 'lobbyist_disclosures');
  try {
    const topBills   = JSON.parse(readFileSync(join(base, 'top_bills.json'), 'utf8'));
    const byIssue    = JSON.parse(readFileSync(join(base, 'by_issue.json'), 'utf8'));
    const topLobbyists = JSON.parse(readFileSync(join(base, 'top_lobbyists.json'), 'utf8'));
    const summary    = JSON.parse(readFileSync(join(base, 'summary.json'), 'utf8'));
    return { topBills, byIssue, topLobbyists, summary };
  } catch { return { topBills: [], byIssue: [], topLobbyists: [], summary: {} }; }
}

const ISSUE_COLORS = {
  'Budget': '#ffd060',
  'General Appropriations': '#ffd060',
  'Health': '#80ffa0',
  'Education': '#4dd8f0',
  'Insurance': '#a0c0ff',
  'Transportation': '#ffb060',
  'Criminal Justice': '#f87171',
  'Environment': '#80ffa0',
  'Economic Development': '#4dd8f0',
  'Government Operations': '#a0c0ff',
  'Taxation': '#ffd060',
};
function issueColor(cat) {
  for (const [k, v] of Object.entries(ISSUE_COLORS)) {
    if (cat.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return 'var(--text-dim)';
}

export default function LobbyingBillsPage() {
  const { topBills, byIssue, topLobbyists, summary } = loadData();
  const totals = summary.totals || {};

  // Group top bills: budget bills separate from policy bills
  const budgetBills = topBills.filter(b => b.category);
  const policyBills = topBills.filter(b => !b.category).slice(0, 100);

  // Top issue categories (clean labels only)
  const topIssues = byIssue
    .filter(i => i.category.length > 3 && i.category.length < 80)
    .slice(0, 20);
  const maxIssueFiling = topIssues[0]?.total_filings || 1;

  return (
    <main style={{ maxWidth: '1040px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/lobbying" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Lobbying</Link>
        {' / '}
        <span>Bills</span>
      </div>

      <SectionHeader title="Most Lobbied Bills" eyebrow="FL Lobbying · 2016–2026" />
      <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '0.25rem', marginTop: '-0.75rem' }}>
        Florida House bills ranked by number of lobbyist disclosure filings. Each filing represents one
        lobbyist–principal pair reporting activity on the bill for a given year.
      </p>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '2rem' }}>
        Source: FL House Lobbyist Disclosure portal, 2016–2026. Not affiliated with the State of Florida. All data from public records.
      </p>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '2.5rem', padding: '1rem 1.25rem', background: 'var(--surface)', borderRadius: '6px', border: '1px solid var(--border)' }}>
        <StatBox value={fmtCount(totals.total_records)} label="Total Filings" />
        <StatBox value={fmtCount(totals.unique_bills)} label="Unique Bills" />
        <StatBox value={fmtCount(totals.unique_lobbyists)} label="Unique Lobbyists" />
        <StatBox value={fmtCount(totals.unique_principals)} label="Unique Principals" />
        <StatBox value="2016–2026" label="Years Covered" color="var(--text-dim)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem', alignItems: 'start' }}>
        <div>
          {/* Budget/Appropriations bills note */}
          {budgetBills.length > 0 && (
            <div style={{ marginBottom: '1.5rem', padding: '0.75rem 1rem', background: 'rgba(255,208,96,0.06)', border: '1px solid rgba(255,208,96,0.2)', borderRadius: '4px', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
              <strong style={{ color: 'var(--gold)' }}>Note:</strong> General Appropriations bills (HB 5001, SB 2500 etc.)
              dominate the filing count as they appear every session and every principal that touches the budget lobbies them.
              They are shown separately below.
            </div>
          )}

          {/* Budget bills */}
          <h2 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '0.75rem' }}>
            Appropriations Bills (shown separately)
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '2rem' }}>
            {budgetBills.slice(0, 6).map(b => <BillRow key={b.slug} bill={b} maxFilings={budgetBills[0]?.filings || 1} isBudget />)}
          </div>

          {/* Policy bills */}
          <h2 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '0.75rem' }}>
            Top Policy Bills
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {policyBills.map(b => <BillRow key={b.slug} bill={b} maxFilings={policyBills[0]?.filings || 1} />)}
          </div>
        </div>

        {/* Sidebar */}
        <div>
          {/* Top issue categories */}
          <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '1rem' }}>
              Top Issue Categories
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {topIssues.slice(0, 15).map(iss => {
                const pct = (iss.total_filings / maxIssueFiling * 100).toFixed(0);
                const color = issueColor(iss.category);
                return (
                  <div key={iss.category}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '2px' }}>
                      <span style={{ color: 'var(--text-dim)', flex: 1, marginRight: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{iss.category}</span>
                      <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>{fmtCount(iss.total_filings)}</span>
                    </div>
                    <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px', opacity: 0.7 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top lobbyists */}
          <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.75rem' }}>
              Most Active Lobbyists
              <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontWeight: 400, marginLeft: '0.4rem' }}>(by filings 2016–2026)</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {topLobbyists.slice(0, 15).map((l, i) => {
                const slug = slugify(l.lobbyist);
                return (
                  <div key={l.lobbyist} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.75rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                      <span style={{ color: 'var(--text-dim)', width: '16px', flexShrink: 0 }}>{i + 1}.</span>
                      <div>
                        <Link href={`/lobbyist/${slug}`} style={{ color: 'var(--text)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                          {l.lobbyist}
                        </Link>
                        {l.firms?.[0] && <div style={{ color: 'var(--text-dim)', fontSize: '0.68rem' }}>{l.firms[0]}</div>}
                      </div>
                    </div>
                    <div style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', flexShrink: 0, marginLeft: '0.5rem' }}>
                      {fmtCount(l.total_filings)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '3rem' }}>
        <DataTrustBlock
          source="FL House Lobbyist Disclosure Portal"
          sourceUrl="https://www.flhouse.gov/Sections/Lobbyist/lobbyist.aspx"
          
          direct={['bill number', 'lobbyist name', 'principal name', 'filing year', 'issue category']}
          normalized={['filings aggregated by bill across years and lobbyist-principal pairs']}
          caveats={[
            'Coverage: 2016–2026 Florida House lobbyist disclosure filings only.',
            'Each filing = one lobbyist–principal pair for one year. A bill with 500 filings had 500 such pairs report activity on it.',
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
      <div style={{ fontSize: '1.3rem', fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{value}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  );
}

function billSourceUrl(billStr) {
  // Extract bill number for FL House search link
  // e.g. "HB 5101" → https://www.myfloridahouse.gov/...
  // e.g. "SB 1234" → https://www.flsenate.gov/...
  const m = billStr.match(/^(HB|SB)\s+(\d+)/i);
  if (!m) return null;
  const type = m[1].toUpperCase();
  const num = m[2];
  if (type === 'SB') return `https://www.flsenate.gov/Session/Bill/2024/${num}`;
  return `https://www.myfloridahouse.gov/Sections/Bills/bills.aspx`;
}

function BillRow({ bill, maxFilings, isBudget = false }) {
  const barPct = (bill.filings / maxFilings * 100).toFixed(1);
  const yearStr = bill.years.length > 1
    ? `${bill.years[0]}–${bill.years[bill.years.length - 1]}`
    : `${bill.years[0]}`;
  const principals = bill.top_principals || [];

  return (
    <div style={{ padding: '0.6rem 0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.35rem', flexWrap: 'wrap', gap: '0.25rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Link href={`/lobbying/bill/${bill.slug}`} style={{ fontSize: '0.82rem', fontWeight: 600, color: isBudget ? 'var(--gold)' : 'var(--teal)', fontFamily: 'var(--font-mono)', textDecoration: 'none' }}>
            {bill.bill}
          </Link>
          {bill.category && (
            <span style={{ fontSize: '0.68rem', color: 'var(--gold)', background: 'rgba(255,208,96,0.08)', padding: '1px 5px', borderRadius: '3px', border: '1px solid rgba(255,208,96,0.2)' }}>
              {bill.category}
            </span>
          )}
          {bill.issues.length > 0 && !bill.category && (
            <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
              {bill.issues[0]}
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{yearStr}</div>
      </div>

      {/* Bar */}
      <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', marginBottom: '0.4rem' }}>
        <div style={{ height: '100%', width: `${barPct}%`, background: isBudget ? 'var(--gold)' : 'var(--teal)', borderRadius: '2px', opacity: 0.7 }} />
      </div>

      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.72rem', color: 'var(--text-dim)', flexWrap: 'wrap', marginBottom: principals.length > 0 ? '0.45rem' : 0 }}>
        <span><span style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>{fmtCount(bill.filings)}</span> filings</span>
        <span><span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{fmtCount(bill.unique_principals)}</span> principals</span>
        <span><span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{fmtCount(bill.unique_lobbyists)}</span> lobbyists</span>
      </div>

      {/* Top principals inline */}
      {principals.length > 0 && (
        <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
          <span style={{ color: 'rgba(200,216,240,0.4)', marginRight: '0.35rem' }}>Top principals:</span>
          {principals.slice(0, 5).join(' · ')}
          {principals.length > 5 && <span style={{ opacity: 0.5 }}> +{principals.length - 5} more</span>}
        </div>
      )}
    </div>
  );
}
