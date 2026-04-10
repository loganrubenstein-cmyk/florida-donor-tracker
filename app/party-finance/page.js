import Link from 'next/link';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fmtMoney, fmtCount } from '../../lib/fmt';

export const metadata = {
  title: 'Party Finance — Florida Donor Tracker',
  description: 'Florida campaign finance breakdown by political party. Republican vs Democrat fundraising trends 2012–2026.',
};

function loadData() {
  const base = join(process.cwd(), 'public', 'data', 'party_finance');
  try {
    const summary = JSON.parse(readFileSync(join(base, 'summary.json'), 'utf8'));
    // Load REP and DEM detail files
    const rep = JSON.parse(readFileSync(join(base, 'by_party', 'rep.json'), 'utf8'));
    const dem = JSON.parse(readFileSync(join(base, 'by_party', 'dem.json'), 'utf8'));
    return { summary, rep, dem };
  } catch { return { summary: { parties: [] }, rep: null, dem: null }; }
}

const OFFICE_LABELS = {
  STR: 'State Representative',
  STS: 'State Senator',
  GOV: 'Governor',
  AGC: 'Attorney General',
  CFO: 'Chief Financial Officer',
  AGR: 'Commissioner of Agriculture',
  USH: 'U.S. House',
  USS: 'U.S. Senate',
  SCJ: 'Supreme Court Justice',
  DCA: 'District Court of Appeal',
  CCJ: 'Circuit Court Judge',
  CCE: 'County Commission',
  SHF: 'Sheriff',
  SOE: 'Supervisor of Elections',
  CLS: 'Clerk of Court',
};

export default function PartyFinancePage() {
  const { summary, rep, dem } = loadData();
  const parties = summary.parties || [];

  const repData = parties.find(p => p.party_code === 'REP');
  const demData = parties.find(p => p.party_code === 'DEM');
  const total = summary.total_raised_all || 0;

  // Merge by_year for REP + DEM for chart data
  const yearMap = {};
  for (const yr of (rep?.by_year || [])) {
    if (!yearMap[yr.year]) yearMap[yr.year] = { year: yr.year, rep: 0, dem: 0 };
    yearMap[yr.year].rep = yr.total_raised;
  }
  for (const yr of (dem?.by_year || [])) {
    if (!yearMap[yr.year]) yearMap[yr.year] = { year: yr.year, rep: 0, dem: 0 };
    yearMap[yr.year].dem = yr.total_raised;
  }
  const yearData = Object.values(yearMap).sort((a, b) => a.year - b.year);
  const maxYearTotal = Math.max(...yearData.map(y => y.rep + y.dem), 1);

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/research" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Research</Link>
        {' / '}
        <span>Party Finance</span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', color: 'var(--text)', marginBottom: '0.25rem' }}>
        Party Finance
      </h1>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '0.25rem' }}>
        Florida candidate fundraising aggregated by political party. Hard and soft money totals, office breakdown,
        and year-over-year trends.
      </p>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '2rem' }}>
        Source: Florida Division of Elections. Not affiliated with the State of Florida. All data from public records.
      </p>

      {/* REP vs DEM head-to-head */}
      {repData && demData && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2.5rem' }}>
          <PartyCard party={repData} color="var(--republican)" total={total} />
          <PartyCard party={demData} color="var(--democrat)" total={total} />
        </div>
      )}

      {/* Year-over-year bar chart */}
      {yearData.length > 0 && (
        <div style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '1rem' }}>
            Fundraising by Year — Republican vs Democrat
          </h2>
          <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {yearData.filter(y => y.year >= 2012).map(y => {
                const repW = (y.rep / maxYearTotal * 100).toFixed(1);
                const demW = (y.dem / maxYearTotal * 100).toFixed(1);
                return (
                  <div key={y.year} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '36px', fontSize: '0.72rem', color: 'var(--text-dim)', textAlign: 'right', flexShrink: 0 }}>{y.year}</div>
                    <div style={{ flex: 1, display: 'flex', gap: '2px', height: '20px', alignItems: 'stretch' }}>
                      <div style={{ width: `${repW}%`, background: 'var(--republican)', borderRadius: '2px 0 0 2px', minWidth: y.rep > 0 ? '2px' : '0' }} title={`R: ${fmtMoney(y.rep)}`} />
                      <div style={{ width: `${demW}%`, background: 'var(--democrat)', borderRadius: '0 2px 2px 0', minWidth: y.dem > 0 ? '2px' : '0' }} title={`D: ${fmtMoney(y.dem)}`} />
                    </div>
                    <div style={{ width: '80px', fontSize: '0.7rem', color: 'var(--republican)', textAlign: 'right', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{fmtMoney(y.rep)}</div>
                    <div style={{ width: '80px', fontSize: '0.7rem', color: 'var(--democrat)', textAlign: 'right', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{fmtMoney(y.dem)}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border)', fontSize: '0.72rem' }}>
              <span style={{ color: 'var(--republican)' }}>■ Republican</span>
              <span style={{ color: 'var(--democrat)' }}>■ Democrat</span>
            </div>
          </div>
        </div>
      )}

      {/* Office breakdown for REP and DEM side by side */}
      {(rep || dem) && (
        <div style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '1rem' }}>
            Fundraising by Office
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {rep && <OfficeBreakdown party={rep} color="var(--republican)" />}
            {dem && <OfficeBreakdown party={dem} color="var(--democrat)" />}
          </div>
        </div>
      )}

      {/* All parties table */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '0.75rem' }}>All Parties</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Party', 'Candidates', 'Total Raised', 'Hard Money', 'Soft Money'].map(h => (
                  <th key={h} style={{ padding: '0.4rem 0.75rem', textAlign: h === 'Party' || h === 'Candidates' ? 'left' : 'right', fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parties.filter(p => p.total_raised > 10000).map(p => (
                <tr key={p.party_code} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.45rem 0.75rem' }}>
                    <span style={{ color: p.party_code === 'REP' ? 'var(--republican)' : p.party_code === 'DEM' ? 'var(--democrat)' : 'var(--text)', fontWeight: 600, fontSize: '0.75rem' }}>
                      {p.party_code}
                    </span>
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', marginLeft: '0.5rem' }}>{p.party_label}</span>
                  </td>
                  <td style={{ padding: '0.45rem 0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{fmtCount(p.num_candidates)}</td>
                  <td style={{ padding: '0.45rem 0.75rem', color: 'var(--orange)', fontFamily: 'var(--font-mono)', textAlign: 'right', fontWeight: 600 }}>{fmtMoney(p.total_raised)}</td>
                  <td style={{ padding: '0.45rem 0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{fmtMoney(p.hard_money)}</td>
                  <td style={{ padding: '0.45rem 0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{fmtMoney(p.soft_money)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text)' }}>Data notes:</strong> Aggregated from FL Division of Elections candidate finance records.
        Hard money = direct contributions; soft money = PC/PAC transfers and other committee receipts.
        Includes all candidates who filed, not just winners or major-party candidates.
        Year reflects candidate&apos;s election year, not when money was raised.
      </div>
      <DataTrustBlock
        source="Florida Division of Elections — Candidate Finance Records"
        sourceUrl="https://dos.elections.myflorida.com/campaign-finance/"
        lastUpdated="April 2026"
        direct={['party affiliation', 'total raised', 'contribution amounts']}
        normalized={['hard money vs soft money split', 'office-level aggregation']}
        caveats={[
          'Federal candidates (U.S. House, Senate, President) excluded — FL state races only.',
          'Party totals include all filed candidates, not just competitive or major-party races.',
          'Soft money linked via PC/ECO affiliations — see methodology for confidence levels.',
        ]}
      />
    </main>
  );
}

function PartyCard({ party, color, total }) {
  const pct = total > 0 ? (party.total_raised / total * 100).toFixed(1) : '0';
  const partyLabel = party.party_code === 'REP' ? 'Republican' : party.party_code === 'DEM' ? 'Democrat' : party.party_label;

  return (
    <div style={{ padding: '1.25rem', background: 'var(--surface)', border: `1px solid ${color}44`, borderRadius: '6px' }}>
      <div style={{ fontSize: '0.95rem', fontWeight: 700, color, marginBottom: '0.75rem' }}>{partyLabel}</div>
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
          {fmtMoney(party.total_raised)}
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>total raised · {pct}% of all FL candidate fundraising</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.75rem' }}>
        <div>
          <div style={{ color: 'var(--text-dim)' }}>Candidates</div>
          <div style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{fmtCount(party.num_candidates)}</div>
        </div>
        <div>
          <div style={{ color: 'var(--text-dim)' }}>Hard Money</div>
          <div style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{fmtMoney(party.hard_money)}</div>
        </div>
      </div>
    </div>
  );
}

function OfficeBreakdown({ party, color }) {
  const partyLabel = party.party_code === 'REP' ? 'Republican' : party.party_code === 'DEM' ? 'Democrat' : party.party_label;
  const topOffice = party.by_office?.[0];
  const maxOfc = topOffice ? topOffice.total_raised : 1;

  return (
    <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px' }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 600, color, marginBottom: '0.75rem' }}>{partyLabel}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {(party.by_office || []).slice(0, 7).map(o => {
          const pct = (o.total_raised / maxOfc * 100).toFixed(0);
          const label = OFFICE_LABELS[o.office_code] || o.office_code;
          return (
            <div key={o.office_code}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '2px' }}>
                <span style={{ color: 'var(--text-dim)' }}>{label}</span>
                <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{fmtMoney(o.total_raised)}</span>
              </div>
              <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px', opacity: 0.7 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
