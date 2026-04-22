import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadLegislator } from '@/lib/loadLegislator';
import { getPoliticianSlugByAcctNum } from '@/lib/loadCandidate';
import { fmtMoney, fmtMoneyCompact, fmtCount, fmtDate } from '@/lib/fmt';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import SourceLink from '@/components/shared/SourceLink';
import TabbedProfile from '@/components/shared/TabbedProfile';
import { buildMeta } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { legislator } = await loadLegislator(params.people_id);
  if (!legislator) return { title: 'Legislator' };
  const chamber = legislator.chamber === 'Senate' ? 'Florida Senator' : 'Florida Representative';
  return buildMeta({
    title: legislator.display_name,
    description: `${chamber} ${legislator.display_name} (${legislator.party}), District ${legislator.district}. Voting record, campaign finance, and committee assignments.`,
    path: `/legislator/${params.people_id}`,
  });
}

const PARTY_COLOR = { R: 'var(--republican)', D: 'var(--democrat)' };
const PARTY_LABEL = { R: 'Republican', D: 'Democrat', NPA: 'No Party Affiliation' };
const VOTE_COLOR  = { Yea: 'var(--green)', Nay: 'var(--republican)', NV: 'var(--text-dim)', Absent: 'var(--text-dim)' };
const ROLE_COLOR  = { Chair: 'var(--orange)', 'Vice Chair': 'var(--teal)', 'Ranking Member': 'var(--democrat)' };

function StatCard({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: '1.5rem', fontWeight: 400, color: color || 'var(--text)', fontFamily: 'var(--font-serif)' , fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '2px' }}>{label}</div>
    </div>
  );
}

function SectionHeader({ children }) {
  return (
    <div style={{ fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 600, marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)' }}>
      {children}
    </div>
  );
}

export default async function LegislatorPage({ params }) {
  const { legislator: leg, memberships, votes, sponsorships, topDonors, disclosure } = await loadLegislator(params.people_id);
  if (!leg) return notFound();

  const partyColor = PARTY_COLOR[leg.party] || 'var(--text-dim)';
  const partyLabel = PARTY_LABEL[leg.party] || leg.party;
  const chamberLabel = leg.chamber === 'Senate' ? 'Florida Senate' : 'Florida House';
  const politicianSlug = leg.acct_num ? getPoliticianSlugByAcctNum(leg.acct_num) : null;

  const totalVotes = (leg.votes_yea || 0) + (leg.votes_nay || 0) + (leg.votes_nv || 0) + (leg.votes_absent || 0);
  const partPct = leg.participation_rate != null ? Math.round(leg.participation_rate * 100) : null;
  const yeaPct  = totalVotes > 0 ? Math.round((leg.votes_yea || 0) / totalVotes * 100) : 0;
  const nayPct  = totalVotes > 0 ? Math.round((leg.votes_nay || 0) / totalVotes * 100) : 0;

  // ── Overview tab ──────────────────────────────────────────────────────────
  const OverviewTab = (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
      {/* Left: committees + bio */}
      <div>
        {memberships.length > 0 && (
          <div style={{ padding: '1.25rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', marginBottom: '1.25rem' }}>
            <SectionHeader>Committee Assignments</SectionHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {memberships.map((m, i) => {
                const roleColor = ROLE_COLOR[m.role];
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: i < memberships.length - 1 ? '1px solid rgba(100,140,220,0.07)' : 'none' }}>
                    <Link href={`/legislature/committee/${encodeURIComponent(m.abbreviation)}`} style={{ color: 'var(--teal)', textDecoration: 'none', fontSize: '0.78rem' }}>
                      {m.legislative_committees?.name || m.abbreviation}
                    </Link>
                    {m.role !== 'Member' && (
                      <span style={{ fontSize: '0.62rem', color: roleColor || 'var(--text-dim)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', marginLeft: '0.5rem' }}>{m.role}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* District / Bio info */}
        <div style={{ padding: '1.25rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px' }}>
          <SectionHeader>District Info</SectionHeader>
          {leg.counties && leg.counties.length > 0 && (
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>Counties</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text)' }}>{leg.counties.join(', ')}</div>
            </div>
          )}
          {leg.term_limit_year && (
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>Term Limit</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--orange)', fontFamily: 'var(--font-mono)' }}>{leg.term_limit_year}</div>
            </div>
          )}
          {leg.email && (
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>Email</div>
              <a href={`mailto:${leg.email}`} style={{ fontSize: '0.75rem', color: 'var(--teal)', textDecoration: 'none' }}>{leg.email}</a>
            </div>
          )}
          {leg.twitter && (
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginBottom: '0.25rem' }}>Twitter</div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{leg.twitter}</span>
            </div>
          )}
        </div>
      </div>

      {/* Right: finance + quick stats */}
      <div>
        {/* Vote summary card */}
        {totalVotes > 0 && (
          <div style={{ padding: '1.25rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', marginBottom: '1.25rem' }}>
            <SectionHeader>Vote Summary</SectionHeader>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <StatCard label="Yea" value={fmtCount(leg.votes_yea || 0)} color="var(--green)" />
              <StatCard label="Nay" value={fmtCount(leg.votes_nay || 0)} color="var(--republican)" />
              <StatCard label="Total" value={fmtCount(totalVotes)} color="var(--text-dim)" />
            </div>
            {partPct != null && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: '4px' }}>
                  <span>Participation rate</span>
                  <span style={{ color: partPct >= 90 ? 'var(--green)' : 'var(--orange)' }}>{partPct}%</span>
                </div>
                <div style={{ height: '5px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
                  <div style={{ width: `${yeaPct}%`, background: 'var(--green)' }} />
                  <div style={{ width: `${nayPct}%`, background: 'var(--republican)' }} />
                </div>
              </div>
            )}
            <div style={{ marginTop: '0.75rem' }}>
              <Link href={`/legislator/${leg.people_id}?tab=votes`} style={{ fontSize: '0.7rem', color: 'var(--teal)', textDecoration: 'none' }}>
                View full voting record →
              </Link>
            </div>
          </div>
        )}

        {/* Finance card */}
        <div style={{ padding: '1.25rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', marginBottom: '1.25rem' }}>
          <SectionHeader>Campaign Finance</SectionHeader>
          {leg.total_raised ? (
            <>
              <div style={{ fontSize: '1.8rem', fontWeight: 400, color: 'var(--orange)', fontFamily: 'var(--font-serif)', marginBottom: '0.25rem' , fontVariantNumeric: 'tabular-nums' }}>
                {fmtMoneyCompact(leg.total_raised)}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>raised · FL Division of Elections</div>
              {leg.acct_num && (
                <Link href={`/candidate/${leg.acct_num}`} style={{ display: 'block', padding: '0.4rem 0.75rem', background: 'rgba(255,176,96,0.08)', border: '1px solid rgba(255,176,96,0.2)', borderRadius: '3px', color: 'var(--orange)', textDecoration: 'none', fontSize: '0.72rem', textAlign: 'center' }}>
                  Full candidate finance profile →
                </Link>
              )}
              {topDonors.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>Top Donors</div>
                  {topDonors.slice(0, 5).map((d, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid rgba(100,140,220,0.07)', fontSize: '0.72rem' }}>
                      {d.donor_slug
                        ? <Link href={`/donor/${d.donor_slug}`} style={{ color: 'var(--orange)', textDecoration: 'none' }}>{d.donor_name}</Link>
                        : <span style={{ color: 'var(--text-dim)' }}>{d.donor_name}</span>
                      }
                      <span style={{ color: 'var(--orange)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmtMoney(d.total_amount, 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>No matching FL DoE candidate record found.</div>
          )}
        </div>

        {/* Donor cross-ref */}
        {leg.donor_slug && (
          <div style={{ padding: '0.75rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            Also appears as a political donor:{' '}
            <Link href={`/donor/${leg.donor_slug}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>view donor profile →</Link>
          </div>
        )}
      </div>
    </div>
  );

  // ── Voting Record tab ─────────────────────────────────────────────────────
  const VotesTab = (
    <div>
      {totalVotes > 0 && (
        <div style={{ padding: '1.25rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <StatCard label="Yea" value={`${fmtCount(leg.votes_yea || 0)} (${yeaPct}%)`} color="var(--green)" />
            <StatCard label="Nay" value={`${fmtCount(leg.votes_nay || 0)} (${nayPct}%)`} color="var(--republican)" />
            <StatCard label="Not Voting" value={fmtCount((leg.votes_nv || 0) + (leg.votes_absent || 0))} color="var(--text-dim)" />
            <StatCard label="Total Roll Calls" value={fmtCount(totalVotes)} color="var(--text-dim)" />
          </div>
          {partPct != null && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: '4px' }}>
                <span>Participation rate (yea + nay / total)</span>
                <span style={{ color: partPct >= 90 ? 'var(--green)' : 'var(--orange)' }}>{partPct}%</span>
              </div>
              <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: `${yeaPct}%`, background: 'var(--green)' }} />
                <div style={{ width: `${nayPct}%`, background: 'var(--republican)' }} />
              </div>
            </div>
          )}
        </div>
      )}
      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.75rem' }}>
        Floor Votes ({votes.length} shown — sessions 2025 + 2026)
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Bill', 'Title', 'Date', 'Vote', 'Lobbyists'].map(h => (
                <th key={h} style={{ padding: '0.35rem 0.6rem', textAlign: 'left', fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {votes.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '1.5rem', color: 'var(--text-dim)', fontSize: '0.78rem' }}>No vote records found.</td></tr>
            )}
            {votes.map((v, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(100,140,220,0.07)' }}>
                <td style={{ padding: '0.35rem 0.6rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                  {v.bill_slug ? (
                    <Link href={`/lobbying/bill/${v.bill_slug}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                      {v.bill_display || v.bill_number}
                    </Link>
                  ) : (
                    <span style={{ color: 'var(--text-dim)' }}>{v.bill_display || v.bill_number || `#${v.bill_id}`}</span>
                  )}
                </td>
                <td style={{ padding: '0.35rem 0.6rem', color: 'var(--text)', maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.bill_title || '—'}
                </td>
                <td style={{ padding: '0.35rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                  {v.vote_date ? fmtDate(v.vote_date) : '—'}
                </td>
                <td style={{ padding: '0.35rem 0.6rem', fontWeight: 600, color: VOTE_COLOR[v.vote_text] || 'var(--text-dim)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                  {v.vote_text}
                </td>
                <td style={{ padding: '0.35rem 0.6rem', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                  {v.lobbyist_count > 0 ? (
                    <Link href={`/lobbying/bill/${v.bill_slug}`} style={{ color: 'var(--blue)', textDecoration: 'none' }}>
                      {fmtCount(v.lobbyist_count)}
                    </Link>
                  ) : (
                    <span style={{ color: 'var(--text-dim)' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {votes.length === 200 && (
        <div style={{ marginTop: '0.75rem', fontSize: '0.7rem', color: 'var(--text-dim)' }}>Showing most recent 200 votes.</div>
      )}
    </div>
  );

  // ── Bills Sponsored tab ───────────────────────────────────────────────────
  const BillsTab = (
    <div>
      {sponsorships.length === 0 ? (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', padding: '1rem 0' }}>No bill sponsorship records loaded yet.</div>
      ) : (
        <>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.75rem' }}>
            {sponsorships.length} bills — sessions 2025 + 2026
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Bill', 'Title', 'Role', 'Lobbyists'].map(h => (
                  <th key={h} style={{ padding: '0.35rem 0.6rem', textAlign: 'left', fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sponsorships.map((s, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(100,140,220,0.07)' }}>
                  <td style={{ padding: '0.35rem 0.6rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                    {s.bill_slug ? (
                      <Link href={`/lobbying/bill/${s.bill_slug}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                        {s.bill_display || s.bill_number}
                      </Link>
                    ) : (
                      <span style={{ color: 'var(--text-dim)' }}>{s.bill_display || s.bill_number || `#${s.bill_id}`}</span>
                    )}
                  </td>
                  <td style={{ padding: '0.35rem 0.6rem', color: 'var(--text)', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.bill_title || '—'}
                  </td>
                  <td style={{ padding: '0.35rem 0.6rem', fontSize: '0.68rem', color: s.sponsor_type === 'Primary' ? 'var(--orange)' : 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                    {s.sponsor_type}
                  </td>
                  <td style={{ padding: '0.35rem 0.6rem', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                    {s.lobbyist_count > 0 ? (
                      <Link href={`/lobbying/bill/${s.bill_slug}`} style={{ color: 'var(--blue)', textDecoration: 'none' }}>
                        {fmtCount(s.lobbyist_count)}
                      </Link>
                    ) : (
                      <span style={{ color: 'var(--text-dim)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );

  // ── Finance tab ───────────────────────────────────────────────────────────
  const FinanceTab = (
    <div>
      {leg.acct_num ? (
        <>
          <div style={{ padding: '1.25rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '2rem', fontWeight: 400, color: 'var(--orange)', fontFamily: 'var(--font-serif)' , fontVariantNumeric: 'tabular-nums' }}>
              {fmtMoneyCompact(leg.total_raised)}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: '1rem' }}>raised · FL Division of Elections</div>
            <Link href={`/candidate/${leg.acct_num}`} style={{ display: 'inline-block', padding: '0.45rem 1rem', background: 'rgba(255,176,96,0.08)', border: '1px solid rgba(255,176,96,0.25)', borderRadius: '3px', color: 'var(--orange)', textDecoration: 'none', fontSize: '0.75rem' }}>
              Full candidate finance profile with donor breakdown →
            </Link>
          </div>
          {topDonors.length > 0 && (
            <div style={{ padding: '1.25rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px' }}>
              <SectionHeader>Top Donors</SectionHeader>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Donor', 'Amount', 'Contributions'].map(h => (
                      <th key={h} style={{ padding: '0.35rem 0.6rem', textAlign: 'left', fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topDonors.map((d, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(100,140,220,0.07)' }}>
                      <td style={{ padding: '0.35rem 0.6rem' }}>
                        {d.donor_slug
                          ? <Link href={`/donor/${d.donor_slug}`} style={{ color: 'var(--orange)', textDecoration: 'none' }}>{d.donor_name}</Link>
                          : <span style={{ color: 'var(--text-dim)' }}>{d.donor_name}</span>
                        }
                      </td>
                      <td style={{ padding: '0.35rem 0.6rem', color: 'var(--orange)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>{fmtMoney(d.total_amount)}</td>
                      <td style={{ padding: '0.35rem 0.6rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>{d.num_contributions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div style={{ padding: '1.25rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
          No FL Division of Elections candidate record matched for this legislator.
          This is common for members who ran unopposed, are in their first term, or whose name differs between LegiScan and state records.
        </div>
      )}
    </div>
  );

  // ── Disclosures tab ───────────────────────────────────────────────────────
  const DisclosuresTab = disclosure ? (
    <div>
      <div style={{ padding: '1.25rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
              {disclosure.filing_type} · {disclosure.filing_year}
            </div>
            {disclosure.net_worth != null && (
              <div style={{ fontSize: '1.8rem', fontWeight: 400, color: 'var(--teal)', fontFamily: 'var(--font-serif)' , fontVariantNumeric: 'tabular-nums' }}>
                {fmtMoney(disclosure.net_worth)}
              </div>
            )}
            {disclosure.net_worth != null && (
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '2px' }}>net worth (self-reported)</div>
            )}
          </div>
          {disclosure.source_url && (
            <a href={disclosure.source_url} target="_blank" rel="noopener noreferrer"
               style={{ fontSize: '0.7rem', padding: '0.3rem 0.75rem', background: 'rgba(77,216,240,0.06)', border: '1px solid rgba(77,216,240,0.2)', borderRadius: '3px', color: 'var(--teal)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              View source PDF ↗
            </a>
          )}
        </div>

        {disclosure.income_sources?.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <SectionHeader>Income Sources</SectionHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {disclosure.income_sources.map((src, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0.3rem 0', borderBottom: '1px solid rgba(100,140,220,0.07)', fontSize: '0.76rem' }}>
                  <div>
                    <span style={{ color: 'var(--text)' }}>{src.source || src.name || '—'}</span>
                    {src.address && <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginLeft: '0.5rem' }}>{src.address}</span>}
                  </div>
                  {src.amount != null && (
                    <span style={{ color: 'var(--orange)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', whiteSpace: 'nowrap', marginLeft: '1rem' }}>
                      {fmtMoney(src.amount)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {disclosure.real_estate?.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <SectionHeader>Real Estate Holdings</SectionHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {disclosure.real_estate.map((re, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0.3rem 0', borderBottom: '1px solid rgba(100,140,220,0.07)', fontSize: '0.76rem' }}>
                  <div>
                    <span style={{ color: 'var(--text)' }}>{re.description || re.address || '—'}</span>
                    {re.county && <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginLeft: '0.5rem' }}>{re.county} County</span>}
                  </div>
                  {re.value != null && (
                    <span style={{ color: 'var(--orange)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', whiteSpace: 'nowrap', marginLeft: '1rem' }}>
                      {fmtMoney(re.value)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {disclosure.business_interests?.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <SectionHeader>Business Interests</SectionHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {disclosure.business_interests.map((biz, i) => (
                <div key={i} style={{ padding: '0.3rem 0', borderBottom: '1px solid rgba(100,140,220,0.07)', fontSize: '0.76rem' }}>
                  <span style={{ color: 'var(--text)' }}>{biz.entity || biz.name || '—'}</span>
                  {biz.title && <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginLeft: '0.5rem' }}>· {biz.title}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {disclosure.liabilities?.length > 0 && (
          <div>
            <SectionHeader>Liabilities</SectionHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {disclosure.liabilities.map((lib, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0.3rem 0', borderBottom: '1px solid rgba(100,140,220,0.07)', fontSize: '0.76rem' }}>
                  <span style={{ color: 'var(--text)' }}>{lib.creditor || lib.description || '—'}</span>
                  {lib.amount != null && (
                    <span style={{ color: 'var(--republican)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', whiteSpace: 'nowrap', marginLeft: '1rem' }}>
                      {fmtMoney(lib.amount)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
        Financial disclosures are self-reported and filed annually with the Florida Commission on Ethics.
        {' '}<a href="https://disclosure.floridaethics.gov/PublicSearch/Filings" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>
          Search all FL Ethics disclosures ↗
        </a>
      </div>
    </div>
  ) : (
    <div style={{ padding: '1.25rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
      No financial disclosure found for this legislator. Disclosures are filed annually with the Florida Commission on Ethics.{' '}
      <a href="https://disclosure.floridaethics.gov/PublicSearch/Filings" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>
        Search manually ↗
      </a>
    </div>
  );

  const tabs = [
    { id: 'overview',     label: 'Overview',                      content: OverviewTab },
    { id: 'votes',        label: `Votes (${fmtCount(totalVotes)})`, content: VotesTab },
    ...(sponsorships.length > 0 ? [{ id: 'bills', label: `Bills (${sponsorships.length})`, content: BillsTab }] : []),
    { id: 'finance',      label: 'Finance',                       content: FinanceTab },
    { id: 'disclosures',  label: 'Disclosures',                   content: DisclosuresTab },
  ];

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2.5rem 1.5rem 4rem' }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: '1rem', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/legislators" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Legislators</Link>
        {' / '}
        <span>{leg.display_name}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2.1rem', color: 'var(--text)', margin: '0 0 0.4rem' }}>
            {leg.display_name}
          </h1>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', color: partyColor, fontWeight: 600 }}>{partyLabel}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{chamberLabel}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>District {leg.district}</span>
            {leg.leadership_title && (
              <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: 'rgba(255,176,96,0.1)', border: '1px solid rgba(255,176,96,0.3)', borderRadius: '3px', color: 'var(--orange)' }}>
                {leg.leadership_title}
              </span>
            )}
            {leg.term_limit_year && leg.term_limit_year <= 2026 && (
              <span style={{ fontSize: '0.62rem', padding: '0.15rem 0.5rem', background: 'rgba(255,176,96,0.06)', border: '1px solid rgba(255,176,96,0.2)', borderRadius: '3px', color: 'var(--orange)', fontFamily: 'var(--font-mono)' }}>
                terms out {leg.term_limit_year}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {politicianSlug && (
            <Link href={`/politician/${politicianSlug}`}
               style={{ fontSize: '0.7rem', padding: '0.25rem 0.6rem', background: 'var(--surface)', border: '1px solid rgba(77,216,240,0.25)', borderRadius: '3px', color: 'var(--teal)', textDecoration: 'none' }}>
              Campaign history →
            </Link>
          )}
          {leg.ballotpedia && (
            <a href={`https://ballotpedia.org/${encodeURIComponent(leg.ballotpedia)}`} target="_blank" rel="noopener noreferrer"
               style={{ fontSize: '0.7rem', padding: '0.25rem 0.6rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--teal)', textDecoration: 'none' }}>
              Ballotpedia ↗
            </a>
          )}
          {leg.acct_num && (
            <Link href={`/timeline?acct=${leg.acct_num}`}
               style={{ fontSize: '0.7rem', padding: '0.25rem 0.6rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--teal)', textDecoration: 'none' }}>
              Fundraising timeline →
            </Link>
          )}
          <Link href={`/district?chamber=${leg.chamber}&district=${leg.district}`}
             style={{ fontSize: '0.7rem', padding: '0.25rem 0.6rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--teal)', textDecoration: 'none' }}>
            District money →
          </Link>
          {leg.acct_num && (
            <SourceLink type="candidate" id={leg.acct_num} />
          )}
        </div>
      </div>

      {/* Contact strip */}
      {(leg.district_office?.phone || leg.capitol_office?.phone || leg.email) && (
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', padding: '0.75rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px', marginBottom: '1.5rem', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
          {leg.district_office?.phone && (
            <span>District: <span style={{ color: 'var(--text)' }}>{leg.district_office.phone}</span></span>
          )}
          {leg.capitol_office?.phone && (
            <span>Capitol: <span style={{ color: 'var(--text)' }}>{leg.capitol_office.phone}</span></span>
          )}
          {leg.email && (
            <a href={`mailto:${leg.email}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>{leg.email}</a>
          )}
          {leg.twitter && (
            <span style={{ fontFamily: 'var(--font-mono)' }}>{leg.twitter}</span>
          )}
        </div>
      )}

      {/* Tabbed content */}
      <TabbedProfile tabs={tabs} defaultTab="overview" />

      <div style={{ marginTop: '3rem' }}>
        <DataTrustBlock
          source="LobbyTools (contact + district) · LegiScan API (votes + bills) · FL Division of Elections (finance) · FL Commission on Ethics (disclosures)"
          
          direct={['name', 'party', 'district', 'chamber', 'leadership title', 'contact info', 'committee assignments', 'individual vote records']}
          normalized={['finance totals matched from FL DoE candidate records by name + district']}
          caveats={[
            'Voting covers floor votes only (Third Reading / Final Passage). Committee votes excluded.',
            'Finance data matched by name — not all legislators have a confirmed matching campaign account.',
            'Sessions covered: 2025 and 2026 Regular Sessions via LegiScan.',
            'Committee assignments scraped from flsenate.gov and flhouse.gov — current term only.',
          ]}
        />
      </div>
    </main>
  );
}
