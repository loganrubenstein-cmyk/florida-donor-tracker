import Link from 'next/link';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { notFound } from 'next/navigation';
import { fmtMoney, fmtCount, fmtDate } from '../../../lib/fmt';

// Pre-generate all legislator pages at build time
export async function generateStaticParams() {
  try {
    const idx = JSON.parse(readFileSync(
      join(process.cwd(), 'public', 'data', 'legislators', 'index.json'), 'utf8'
    ));
    return idx.map(l => ({ people_id: String(l.people_id) }));
  } catch { return []; }
}

export async function generateMetadata({ params }) {
  const leg = loadLegislator(params.people_id);
  if (!leg) return { title: 'Legislator — Florida Donor Tracker' };
  return {
    title: `${leg.name} — Florida Donor Tracker`,
    description: `${leg.role === 'Sen' ? 'Florida Senator' : 'Florida Representative'} ${leg.name} (${leg.party}), ${leg.district}. Voting record and campaign finance.`,
  };
}

function loadLegislator(people_id) {
  const base = join(process.cwd(), 'public', 'data', 'legislators');
  const filePath = join(base, `${people_id}.json`);
  if (!existsSync(filePath)) return null;

  try {
    const profile = JSON.parse(readFileSync(filePath, 'utf8'));
    const xref = JSON.parse(readFileSync(join(base, 'donor_crossref.json'), 'utf8'));
    const finance = xref.find(x => String(x.people_id) === String(people_id)) || null;
    return { ...profile, finance };
  } catch { return null; }
}

const PARTY_COLOR = { D: 'var(--democrat)', R: 'var(--republican)' };
const VOTE_COLOR  = { Yea: 'var(--green)', Nay: 'var(--republican)', NV: 'var(--text-dim)', Absent: 'var(--text-dim)' };

export default function LegislatorPage({ params }) {
  const leg = loadLegislator(params.people_id);
  if (!leg) return notFound();

  const vc = leg.vote_counts || {};
  const total = (vc.yea || 0) + (vc.nay || 0) + (vc.nv || 0) + (vc.absent || 0);
  const yeaPct = total > 0 ? Math.round((vc.yea || 0) / total * 100) : 0;
  const nayPct = total > 0 ? Math.round((vc.nay || 0) / total * 100) : 0;
  const partPct = total > 0 ? Math.round(((vc.yea || 0) + (vc.nay || 0)) / total * 100) : 0;
  const chamberLabel = leg.role === 'Sen' ? 'Florida Senate' : 'Florida House';
  const partyLabel   = leg.party === 'R' ? 'Republican' : leg.party === 'D' ? 'Democrat' : leg.party;
  const partyColor   = PARTY_COLOR[leg.party] || 'var(--text-dim)';

  const recentVotes = (leg.recent_votes || []).slice(0, 50);

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/legislators" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Legislators</Link>
        {' / '}
        <span>{leg.name}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', color: 'var(--text)', margin: 0 }}>
            {leg.name}
          </h1>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.82rem', color: partyColor, fontWeight: 600 }}>{partyLabel}</span>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>{chamberLabel}</span>
            <span style={{ fontSize: '0.82rem', color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>{leg.district}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {leg.ballotpedia && (
            <a href={`https://ballotpedia.org/${encodeURIComponent(leg.ballotpedia)}`} target="_blank" rel="noopener noreferrer"
               style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--teal)', textDecoration: 'none' }}>
              Ballotpedia ↗
            </a>
          )}
          {leg.finance?.state_acct_num && (
            <Link href={`/candidate/${leg.finance.state_acct_num}`}
                  style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--orange)', textDecoration: 'none' }}>
              Finance profile →
            </Link>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left: voting record */}
        <div>
          {/* Vote summary */}
          <div style={{ padding: '1.25rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '1rem' }}>
              Floor Vote Record — Sessions {leg.sessions?.join(', ')}
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <VoteStat label="Yea" value={vc.yea || 0} color="var(--green)" pct={yeaPct} />
              <VoteStat label="Nay" value={vc.nay || 0} color="var(--republican)" pct={nayPct} />
              <VoteStat label="Not Voting / Absent" value={(vc.nv || 0) + (vc.absent || 0)} color="var(--text-dim)" />
              <VoteStat label="Total Votes" value={total} color="var(--text-dim)" />
            </div>
            {/* Participation bar */}
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '4px' }}>
                <span>Participation rate (yea+nay / total roll calls)</span>
                <span style={{ color: partPct >= 80 ? 'var(--green)' : 'var(--orange)' }}>{partPct}%</span>
              </div>
              <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px' }}>
                <div style={{ height: '100%', width: `${yeaPct}%`, background: 'var(--green)', borderRadius: '3px 0 0 3px' }} />
              </div>
              <div style={{ height: '6px', background: 'transparent', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '-6px', left: `${yeaPct}%`, width: `${nayPct}%`, height: '6px', background: 'var(--republican)' }} />
              </div>
            </div>
          </div>

          {/* Recent votes table */}
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.75rem' }}>
            Recent Floor Votes ({recentVotes.length} shown)
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Bill</th>
                  <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Title</th>
                  <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Date</th>
                  <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left', fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Vote</th>
                </tr>
              </thead>
              <tbody>
                {recentVotes.map((v, i) => {
                  const voteColor = VOTE_COLOR[v.vote_text] || 'var(--text-dim)';
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.35rem 0.5rem', color: 'var(--teal)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                        {v.bill_number || `#${v.bill_id}`}
                      </td>
                      <td style={{ padding: '0.35rem 0.5rem', color: 'var(--text-dim)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v.bill_title}
                      </td>
                      <td style={{ padding: '0.35rem 0.5rem', color: 'var(--text-dim)', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>
                        {v.date ? fmtDate(v.date) : ''}
                      </td>
                      <td style={{ padding: '0.35rem 0.5rem', fontWeight: 600, color: voteColor, fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                        {v.vote_text}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar: finance data */}
        <div>
          {leg.finance ? (
            <div style={{ padding: '1.25rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '1rem' }}>
                Campaign Finance
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--orange)', fontFamily: 'var(--font-mono)' }}>
                  {fmtMoney(leg.finance.state_total_raised)}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>raised · FL Division of Elections</div>
              </div>
              {leg.finance.state_acct_num && (
                <Link href={`/candidate/${leg.finance.state_acct_num}`}
                      style={{ display: 'block', padding: '0.4rem 0.75rem', background: 'rgba(255,176,96,0.1)', border: '1px solid rgba(255,176,96,0.25)', borderRadius: '4px', color: 'var(--orange)', textDecoration: 'none', fontSize: '0.78rem', textAlign: 'center', marginBottom: '0.75rem' }}>
                  Full candidate finance profile →
                </Link>
              )}
              {leg.finance.donor_total_gave > 0 && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                  Also appears as donor: <Link href={`/donor/${leg.finance.donor_slug}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                    {fmtMoney(leg.finance.donor_total_gave)} donated
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', marginBottom: '1.5rem', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
              No campaign finance record matched for this legislator.
            </div>
          )}

          {/* LD — check if lobbyist disclosure data for this district */}
          <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.5rem' }}>Data Sources</div>
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              <li>Voting records: LegiScan API (floor votes only, sessions {leg.sessions?.join(', ')})</li>
              <li>Finance: FL Division of Elections candidate records</li>
              {leg.ballotpedia && <li>Biography: <a href={`https://ballotpedia.org/${encodeURIComponent(leg.ballotpedia)}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}>Ballotpedia ↗</a></li>}
            </ul>
            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
              Not affiliated with the State of Florida. All data from public records.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function VoteStat({ label, value, color, pct }) {
  return (
    <div>
      <div style={{ fontSize: '1.3rem', fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>
        {fmtCount(value)}
        {pct !== undefined && (
          <span style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--text-dim)', marginLeft: '0.3rem' }}>
            ({pct}%)
          </span>
        )}
      </div>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  );
}
