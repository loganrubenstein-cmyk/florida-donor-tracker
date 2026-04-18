import Link from 'next/link';
import { loadCommitteesDirectory } from '@/lib/loadLegislativeCommittee';
import { fmtMoneyCompact } from '@/lib/fmt';
import BackLinks from '@/components/BackLinks';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import SectionHeader from '@/components/shared/SectionHeader';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Florida Legislative Committees',
  description: 'All 65 Florida House and Senate legislative committees — membership, leadership, and campaign finance.',
};

const PARTY_COLOR = { R: 'var(--republican)', D: 'var(--democrat)', NPA: 'var(--text-dim)' };

function ChamberSection({ title, committees }) {
  if (!committees.length) return null;
  return (
    <section style={{ marginBottom: '2.5rem' }}>
      <div style={{
        fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase',
        color: 'var(--text-dim)', fontWeight: 600, marginBottom: '0.75rem',
        paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)',
      }}>
        {title} · {committees.length} committees
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Committee', 'Abbrev.', 'Chair', 'Members', 'Combined Raised'].map(h => (
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
            {committees.map(c => (
              <tr key={c.abbreviation} style={{ borderBottom: '1px solid rgba(100,140,220,0.07)' }}>
                <td style={{ padding: '0.5rem 0.75rem' }}>
                  <Link href={`/legislature/committee/${c.abbreviation}`} style={{ color: 'var(--teal)', textDecoration: 'none', fontWeight: 500 }}>
                    {c.name}
                  </Link>
                </td>
                <td style={{ padding: '0.5rem 0.75rem' }}>
                  <span style={{
                    fontSize: '0.62rem', padding: '0.15rem 0.4rem',
                    border: '1px solid var(--border)', borderRadius: '3px',
                    color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
                  }}>
                    {c.abbreviation}
                  </span>
                </td>
                <td style={{ padding: '0.5rem 0.75rem' }}>
                  {c.chair_name ? (
                    <span style={{ color: PARTY_COLOR[c.chair_party] || 'var(--text-dim)', fontSize: '0.75rem' }}>
                      {c.chair_name}
                    </span>
                  ) : <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>—</span>}
                </td>
                <td style={{ padding: '0.5rem 0.75rem', color: 'var(--teal)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                  {c.member_count || 0}
                </td>
                <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                  {c.total_raised > 0 ? fmtMoneyCompact(c.total_raised) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function CommitteesPage() {
  const { house, senate } = await loadCommitteesDirectory();

  const totalRaised = [...house, ...senate].reduce((s, c) => s + (c.total_raised || 0), 0);

  return (
    <main style={{ maxWidth: '1040px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <BackLinks links={[{ href: '/', label: 'home' }, { href: '/legislature', label: 'legislature' }]} />

      <SectionHeader title="Legislative Committees" eyebrow="FL Legislature · 2024–2026 Term" />
      <div style={{ marginBottom: '1.5rem', marginTop: '-0.75rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
          {house.length} House + {senate.length} Senate committees
          {totalRaised > 0 && (
            <span style={{ marginLeft: '0.75rem', color: 'var(--orange)' }}>
              {fmtMoneyCompact(totalRaised)} combined fundraising by members
            </span>
          )}
        </div>
      </div>

      <ChamberSection title="Florida House — Standing Committees" committees={house} />
      <ChamberSection title="Florida Senate — Standing Committees" committees={senate} />

      <div style={{ marginTop: '3rem' }}>
        <DataTrustBlock
          source="FL House + FL Senate websites · LobbyTools member export"
          
          direct={['committee name', 'membership roster', 'leadership roles']}
          normalized={['campaign finance totals matched from FL DoE candidate records']}
          caveats={[
            'Committee memberships reflect the 2024–2026 term only.',
            'Finance totals are cumulative per-legislator, not committee-specific.',
          ]}
        />
      </div>
    </main>
  );
}
