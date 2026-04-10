import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadLegislativeCommittee } from '@/lib/loadLegislativeCommittee';
import { fmtMoney, fmtMoneyCompact } from '@/lib/fmt';
import BackLinks from '@/components/BackLinks';
import DataTrustBlock from '@/components/shared/DataTrustBlock';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const result = await loadLegislativeCommittee(params.abbreviation);
  if (!result) return { title: 'Committee — Florida Donor Tracker' };
  const { committee } = result;
  return {
    title: `${committee.name} — Florida Donor Tracker`,
    description: `FL ${committee.chamber} ${committee.name} — membership roster, leadership, and campaign finance of committee members.`,
  };
}

const PARTY_COLOR  = { R: 'var(--republican)', D: 'var(--democrat)', NPA: 'var(--text-dim)' };
const PARTY_LABEL  = { R: 'R', D: 'D', NPA: 'NPA' };
const ROLE_BG      = { Chair: 'rgba(255,176,96,0.08)', 'Vice Chair': 'rgba(77,216,240,0.07)', 'Ranking Member': 'rgba(96,165,250,0.07)' };
const ROLE_BORDER  = { Chair: 'var(--orange)', 'Vice Chair': 'var(--teal)', 'Ranking Member': 'var(--democrat)' };
const ROLE_COLOR   = { Chair: 'var(--orange)', 'Vice Chair': 'var(--teal)', 'Ranking Member': 'var(--democrat)' };

function SectionHeader({ children }) {
  return (
    <div style={{
      fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase',
      color: 'var(--text-dim)', fontWeight: 600, marginBottom: '0.75rem',
      paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)',
    }}>
      {children}
    </div>
  );
}

function LeaderCard({ member }) {
  const leg = member.legislators;
  if (!leg) return null;
  return (
    <div style={{
      padding: '0.85rem 1rem',
      background: ROLE_BG[member.role] || 'var(--surface)',
      border: `1px solid ${ROLE_BORDER[member.role] || 'var(--border)'}`,
      borderRadius: '4px',
    }}>
      <div style={{ fontSize: '0.6rem', color: ROLE_COLOR[member.role] || 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>
        {member.role}
      </div>
      <Link href={`/legislator/${leg.people_id}`} style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 600, fontSize: '0.88rem' }}>
        {leg.display_name}
      </Link>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>
        <span style={{ color: PARTY_COLOR[leg.party] || 'var(--text-dim)', fontWeight: 600 }}>
          {PARTY_LABEL[leg.party] || leg.party}
        </span>
        <span style={{ margin: '0 0.4rem', color: 'var(--border)' }}>·</span>
        District {leg.district}
        {leg.total_raised > 0 && (
          <>
            <span style={{ margin: '0 0.4rem', color: 'var(--border)' }}>·</span>
            <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              {fmtMoneyCompact(leg.total_raised)} raised
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export default async function CommitteePage({ params }) {
  const result = await loadLegislativeCommittee(params.abbreviation);
  if (!result) return notFound();

  const { committee, members, totalRaised, partyBreak, topDonors } = result;

  const leadership = members.filter(m => m.role !== 'Member');
  const regularMembers = members.filter(m => m.role === 'Member');
  const totalMembers = members.length;
  const rCount = partyBreak.R || 0;
  const dCount = partyBreak.D || 0;
  const rPct = totalMembers > 0 ? Math.round(rCount / totalMembers * 100) : 0;
  const dPct = totalMembers > 0 ? Math.round(dCount / totalMembers * 100) : 0;

  const chamberBadgeColor = committee.chamber === 'Senate' ? 'var(--teal)' : 'var(--orange)';

  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <BackLinks links={[
        { href: '/', label: 'home' },
        { href: '/legislators', label: 'legislators' },
        { href: '/legislature/committees', label: 'committees' },
      ]} />

      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
          <span style={{
            fontSize: '0.62rem', padding: '0.15rem 0.5rem',
            border: `1px solid ${chamberBadgeColor}`,
            borderRadius: '3px', color: chamberBadgeColor,
            fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
          }}>
            {committee.chamber}
          </span>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {committee.abbreviation}
          </span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.9rem', color: 'var(--text)', margin: '0 0 0.4rem' }}>
          {committee.name}
        </h1>
        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: 'var(--text-dim)', flexWrap: 'wrap' }}>
          <span>{totalMembers} members</span>
          {totalRaised > 0 && (
            <span style={{ color: 'var(--orange)' }}>
              {fmtMoneyCompact(totalRaised)} combined fundraising
            </span>
          )}
          {rCount > 0 && <span style={{ color: 'var(--republican)' }}>{rCount}R / {dCount}D</span>}
          {committee.url && (
            <a href={committee.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}>
              Official page ↗
            </a>
          )}
        </div>
      </div>

      {/* Leadership */}
      {leadership.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <SectionHeader>Leadership</SectionHeader>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
            {leadership.map((m, i) => <LeaderCard key={i} member={m} />)}
          </div>
        </div>
      )}

      {/* Party composition bar */}
      {totalMembers > 0 && (rPct + dPct > 0) && (
        <div style={{ marginBottom: '2rem' }}>
          <SectionHeader>Party Composition</SectionHeader>
          <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', background: 'var(--border)' }}>
            <div style={{ width: `${rPct}%`, background: 'var(--republican)' }} />
            <div style={{ width: `${dPct}%`, background: 'var(--democrat)' }} />
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.4rem', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
            {rCount > 0 && <span><span style={{ color: 'var(--republican)', fontWeight: 600 }}>R</span> {rCount} ({rPct}%)</span>}
            {dCount > 0 && <span><span style={{ color: 'var(--democrat)', fontWeight: 600 }}>D</span> {dCount} ({dPct}%)</span>}
          </div>
        </div>
      )}

      {/* All members table */}
      <div style={{ marginBottom: '2.5rem' }}>
        <SectionHeader>All Members ({totalMembers})</SectionHeader>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Member', 'Party', 'District', 'Role', 'Total Raised'].map(h => (
                  <th key={h} style={{
                    padding: '0.4rem 0.75rem', textAlign: 'left',
                    fontSize: '0.6rem', color: 'var(--text-dim)',
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                    fontWeight: 600, whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => {
                const leg = m.legislators;
                if (!leg) return null;
                return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(100,140,220,0.07)' }}>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <Link href={`/legislator/${leg.people_id}`} style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 500 }}>
                        {leg.display_name}
                      </Link>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <span style={{ color: PARTY_COLOR[leg.party] || 'var(--text-dim)', fontWeight: 600, fontSize: '0.7rem' }}>
                        {PARTY_LABEL[leg.party] || leg.party}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--teal)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                      {leg.district}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      {m.role !== 'Member' ? (
                        <span style={{ fontSize: '0.68rem', color: ROLE_COLOR[m.role] || 'var(--text-dim)' }}>{m.role}</span>
                      ) : (
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>Member</span>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                      {leg.total_raised > 0 ? fmtMoneyCompact(leg.total_raised) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top donors across committee */}
      {topDonors.length > 0 && (
        <div style={{ marginBottom: '2.5rem' }}>
          <SectionHeader>Who Funds This Committee</SectionHeader>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
            Top donors across committee members' campaign accounts — combined contributions
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Donor', 'Total to Committee', 'Recipients', '# Contributions'].map(h => (
                    <th key={h} style={{
                      padding: '0.4rem 0.75rem', textAlign: 'left',
                      fontSize: '0.6rem', color: 'var(--text-dim)',
                      textTransform: 'uppercase', letterSpacing: '0.07em',
                      fontWeight: 600, whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topDonors.map((d, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(100,140,220,0.07)' }}>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      {d.donor_slug ? (
                        <Link href={`/donor/${d.donor_slug}`} style={{ color: 'var(--text)', textDecoration: 'none', fontWeight: 500 }}>
                          {d.donor_name}
                        </Link>
                      ) : (
                        <span style={{ color: 'var(--text)', fontWeight: 500 }}>{d.donor_name}</span>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--orange)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600 }}>
                      {fmtMoneyCompact(d.total_amount)}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--teal)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                      {d.num_recipients}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                      {d.num_contributions.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '0.6rem' }}>
            Aggregated from FL Division of Elections candidate filings for committee members with matched campaign accounts.
          </div>
        </div>
      )}

      <div style={{ marginTop: '3rem' }}>
        <DataTrustBlock
          source="FL House + FL Senate websites · FL Division of Elections"
          lastUpdated="April 2026"
          direct={['committee name', 'membership roster', 'leadership roles']}
          normalized={['campaign finance totals matched from FL DoE candidate records by name + district']}
          caveats={[
            'Covers current 2024–2026 legislative term.',
            '"Combined fundraising" sums each member\'s total career fundraising — not committee-specific donations.',
            'Some members have no matched FL DoE campaign account.',
          ]}
        />
      </div>
    </main>
  );
}
