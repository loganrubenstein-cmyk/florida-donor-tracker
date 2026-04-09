import Link from 'next/link';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fmtMoney, fmtCount } from '../../lib/fmt';

export const metadata = {
  title: 'Legislators — Florida Donor Tracker',
  description: 'Florida legislators with voting records, party breakdown, and campaign finance cross-references.',
};

function loadData() {
  const base = join(process.cwd(), 'public', 'data', 'legislators');
  try {
    const idx   = JSON.parse(readFileSync(join(base, 'index.json'), 'utf8'));
    const xref  = JSON.parse(readFileSync(join(base, 'donor_crossref.json'), 'utf8'));
    const votes = JSON.parse(readFileSync(join(base, 'votes', 'summary.json'), 'utf8'));
    // build a map of people_id → finance data
    const financeMap = {};
    for (const x of xref) {
      financeMap[x.people_id] = x;
    }
    return { legislators: idx, financeMap, votesSummary: votes };
  } catch { return { legislators: [], financeMap: {}, votesSummary: {} }; }
}

const PARTY_COLOR = { D: 'var(--democrat)', R: 'var(--republican)' };
const PARTY_LABEL = { D: 'Democrat', R: 'Republican', NP: 'Non-Partisan' };

export default function LegislatorsPage() {
  const { legislators, financeMap, votesSummary } = loadData();

  // Group by chamber and party
  const senators  = legislators.filter(l => l.role === 'Sen').sort((a, b) => a.name.localeCompare(b.name));
  const reps      = legislators.filter(l => l.role === 'Rep').sort((a, b) => a.name.localeCompare(b.name));

  const repR = reps.filter(l => l.party === 'R').length;
  const repD = reps.filter(l => l.party === 'D').length;
  const senR = senators.filter(l => l.party === 'R').length;
  const senD = senators.filter(l => l.party === 'D').length;

  const withFinance = legislators.filter(l => financeMap[l.people_id]).length;

  return (
    <main style={{ maxWidth: '1040px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <span>Legislators</span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', color: 'var(--text)', marginBottom: '0.25rem' }}>
        Florida Legislators
      </h1>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '0.25rem' }}>
        Current Florida House and Senate members with floor vote records and campaign finance cross-references.
        Data from LegiScan (voting) and FL Division of Elections (finance).
      </p>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '2rem' }}>
        Not affiliated with the State of Florida. All data from public records.
      </p>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '2.5rem', padding: '1rem 1.25rem', background: 'var(--surface)', borderRadius: '6px', border: '1px solid var(--border)' }}>
        <StatBox value={legislators.length} label="Total Legislators" />
        <StatBox value={senators.length} label="Senators" color="var(--teal)" />
        <StatBox value={reps.length} label="Representatives" color="var(--teal)" />
        <StatBox value={fmtCount(votesSummary.total_bills || 0)} label="Bills Tracked" />
        <StatBox value={fmtCount(votesSummary.total_roll_calls || 0)} label="Roll Calls" />
        <StatBox value={withFinance} label="Finance Cross-Refs" color="var(--orange)" />
      </div>

      {/* Party composition bars */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
        <ChamberBreakdown label="Florida Senate" total={senators.length} repCount={senR} demCount={senD} />
        <ChamberBreakdown label="Florida House" total={reps.length} repCount={repR} demCount={repD} />
      </div>

      {/* Senate */}
      <h2 style={{ fontSize: '1.1rem', color: 'var(--text)', marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)' }}>
        Florida Senate — {senators.length} members
      </h2>
      <LegislatorTable legislators={senators} financeMap={financeMap} />

      {/* House */}
      <h2 style={{ fontSize: '1.1rem', color: 'var(--text)', margin: '2rem 0 0.75rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)' }}>
        Florida House — {reps.length} members
      </h2>
      <LegislatorTable legislators={reps} financeMap={financeMap} />

      <div style={{ marginTop: '2rem', padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text)' }}>Data notes:</strong> Voting records cover floor votes only (Third Reading / Final Passage).
        Committee votes excluded. Sessions 2025 Regular and 2026 Regular via LegiScan API.
        Finance cross-references match by candidate name — approximately 73% of legislators matched (164/224).
        Participation rate = votes cast ÷ total roll calls in tracked sessions.{' '}
        <Link href="/methodology" style={{ color: 'var(--teal)' }}>Full methodology →</Link>
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

function ChamberBreakdown({ label, total, repCount, demCount }) {
  const other = total - repCount - demCount;
  const repPct = total ? (repCount / total * 100) : 0;
  const demPct = total ? (demCount / total * 100) : 0;
  return (
    <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px' }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.75rem' }}>{label}</div>
      <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.5rem', background: 'var(--border)' }}>
        <div style={{ width: `${repPct}%`, background: 'var(--republican)' }} />
        <div style={{ width: `${demPct}%`, background: 'var(--democrat)' }} />
      </div>
      <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.75rem' }}>
        <span style={{ color: 'var(--republican)' }}>R {repCount}</span>
        <span style={{ color: 'var(--democrat)' }}>D {demCount}</span>
        {other > 0 && <span style={{ color: 'var(--text-dim)' }}>Other {other}</span>}
      </div>
    </div>
  );
}

function LegislatorTable({ legislators, financeMap }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Name', 'District', 'Party', 'Yea', 'Nay', 'Abstain', 'Participation', 'Finance'].map(h => (
              <th key={h} style={{ padding: '0.4rem 0.6rem', textAlign: 'left', fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {legislators.map(l => {
            const fin = financeMap[l.people_id];
            const vc  = l.vote_counts || {};
            const total = (vc.yea || 0) + (vc.nay || 0) + (vc.nv || 0) + (vc.absent || 0);
            const pct  = total > 0 ? Math.round(((vc.yea || 0) + (vc.nay || 0)) / total * 100) : 0;
            const partyClr = PARTY_COLOR[l.party] || 'var(--text-dim)';

            return (
              <tr key={l.people_id} style={{ borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }}>
                <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                  {fin?.state_acct_num ? (
                    <Link href={`/candidate/${fin.state_acct_num}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>
                      {l.name}
                    </Link>
                  ) : l.name}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{l.district}</td>
                <td style={{ padding: '0.45rem 0.6rem' }}>
                  <span style={{ color: partyClr, fontWeight: 600, fontSize: '0.72rem' }}>{l.party}</span>
                </td>
                <td style={{ padding: '0.45rem 0.6rem', color: 'var(--green)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{vc.yea || 0}</td>
                <td style={{ padding: '0.45rem 0.6rem', color: 'var(--republican)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{vc.nay || 0}</td>
                <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>{(vc.nv || 0) + (vc.absent || 0)}</td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right' }}>
                  <span style={{ color: pct >= 80 ? 'var(--teal)' : pct >= 50 ? 'var(--orange)' : 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    {pct}%
                  </span>
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right' }}>
                  {fin ? (
                    <Link href={`/candidate/${fin.state_acct_num}`} style={{ color: 'var(--orange)', textDecoration: 'none', fontSize: '0.75rem' }}>
                      {fmtMoney(fin.state_total_raised)}
                    </Link>
                  ) : (
                    <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
