// components/cycles/CycleProfile.js
// Server component
import BackLinks from '@/components/BackLinks';
import { slugify } from '@/lib/slugify';
import DataTrustBlock from '@/components/shared/DataTrustBlock';

function fmt(n) {
  if (!n || n === 0) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function StatBox({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--bg)', padding: '1rem 1.25rem',
      display: 'flex', flexDirection: 'column', gap: '0.25rem',
    }}>
      <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.3rem', fontFamily: 'var(--font-mono)', color: color || 'var(--orange)', fontWeight: 700 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>{sub}</div>}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
      letterSpacing: '0.1em', marginBottom: '0.75rem',
    }}>
      {children}
    </div>
  );
}

const PARTY_COLOR  = { REP: 'var(--republican)', DEM: 'var(--democrat)' };
const PARTY_LABEL  = { REP: 'R', DEM: 'D', NPA: 'I', OTH: 'O' };

export default function CycleProfile({ year, candidates, topDonors = [] }) {
  // Aggregate totals
  const total_hard     = candidates.reduce((s, c) => s + (c.hard_money_total  || 0), 0);
  const total_soft     = candidates.reduce((s, c) => s + (c.soft_money_total  || 0), 0);
  const total_combined = candidates.reduce((s, c) => s + (c.total_combined    || 0), 0);
  const hasSoft        = total_soft > 0;

  // Top by combined
  const top20 = [...candidates]
    .sort((a, b) => (b.total_combined || 0) - (a.total_combined || 0))
    .slice(0, 20);

  // By office
  const byOffice = {};
  for (const c of candidates) {
    const o = c.office_desc || 'Unknown';
    if (!byOffice[o]) byOffice[o] = { count: 0, total: 0 };
    byOffice[o].count++;
    byOffice[o].total += c.total_combined || 0;
  }
  const topOffices = Object.entries(byOffice)
    .sort(([, a], [, b]) => b.total - a.total)
    .slice(0, 8);

  // Party breakdown
  const byParty = {};
  for (const c of candidates) {
    const p = c.party_code || 'OTH';
    if (!byParty[p]) byParty[p] = { count: 0, total: 0 };
    byParty[p].count++;
    byParty[p].total += c.total_combined || 0;
  }
  const partyRows = Object.entries(byParty)
    .sort(([, a], [, b]) => b.total - a.total);

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      <BackLinks links={[{ href: '/', label: 'home' }, { href: '/cycles', label: 'cycles' }]} />

      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{
            fontSize: '0.65rem', padding: '0.15rem 0.5rem',
            border: '1px solid var(--orange)', color: 'var(--orange)',
            borderRadius: '2px', fontFamily: 'var(--font-mono)', fontWeight: 'bold',
          }}>
            ELECTION CYCLE
          </span>
        </div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.5rem, 4vw, 2.4rem)',
          fontWeight: 400, color: '#fff', marginBottom: '0.4rem', lineHeight: 1.1,
        }}>
          {year} Florida Elections
        </h1>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
          {candidates.length.toLocaleString()} candidates · Florida Division of Elections
          {!hasSoft && ' · Soft money (PAC) linked from 2020 onward only'}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '1px', background: 'var(--border)', marginBottom: '2rem',
      }}>
        <StatBox label="Combined Total"    value={fmt(total_combined)} />
        <StatBox label="Hard Money"        value={fmt(total_hard)}
          sub="Direct candidate contributions" color="var(--blue)" />
        <StatBox label="Soft Money (PACs)" value={hasSoft ? fmt(total_soft) : 'N/A'}
          sub={hasSoft ? 'Linked political committees' : 'Linked from 2020 onward'}
          color={hasSoft ? 'var(--teal)' : 'var(--text-dim)'} />
        <StatBox label="Candidates"        value={candidates.length.toLocaleString()}
          color="var(--text-dim)" />
      </div>

      {/* By office */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
        <div>
          <SectionLabel>By Office — Top Races</SectionLabel>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
            <tbody>
              {topOffices.map(([office, data]) => (
                <tr key={office} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.35rem 0.5rem', color: 'var(--text-dim)', fontSize: '0.68rem', maxWidth: '160px', wordBreak: 'break-word' }}>
                    {office}
                  </td>
                  <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                    {data.count}
                  </td>
                  <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: 'var(--orange)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                    {fmt(data.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <SectionLabel>By Party</SectionLabel>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
            <tbody>
              {partyRows.map(([party, data]) => (
                <tr key={party} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.35rem 0.5rem' }}>
                    <span style={{
                      color: PARTY_COLOR[party] || 'var(--text-dim)',
                      fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.7rem',
                    }}>
                      {PARTY_LABEL[party] || party}
                    </span>
                  </td>
                  <td style={{ padding: '0.35rem 0.5rem', color: 'var(--text-dim)', fontSize: '0.68rem' }}>
                    {data.count} candidates
                  </td>
                  <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: PARTY_COLOR[party] || 'var(--orange)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                    {fmt(data.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top 20 candidates */}
      <div style={{ marginBottom: '2rem' }}>
        <SectionLabel>Top Fundraisers — {year}</SectionLabel>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['#', 'Candidate', 'Party', 'Office', 'Hard', hasSoft ? 'Soft' : null, 'Total']
                  .filter(Boolean)
                  .map((h, j) => (
                  <th key={h} style={{
                    padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                    textAlign: j === 0 || j === 2 ? 'center' : j >= 4 ? 'right' : 'left',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {top20.map((c, i) => (
                <tr key={c.acct_num} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', wordBreak: 'break-word', maxWidth: '220px' }}>
                    <a href={`/candidate/${c.acct_num}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                      {c.candidate_name}
                    </a>
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>
                    <span style={{
                      fontSize: '0.62rem', fontWeight: 700,
                      color: PARTY_COLOR[c.party_code] || 'var(--text-dim)',
                    }}>
                      {PARTY_LABEL[c.party_code] || c.party_code || '—'}
                    </span>
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.65rem', maxWidth: '140px', wordBreak: 'break-word' }}>
                    {c.office_desc || '—'}
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--blue)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                    {fmt(c.hard_money_total)}
                  </td>
                  {hasSoft && (
                    <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--teal)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                      {c.soft_money_total > 0 ? fmt(c.soft_money_total) : <span style={{ opacity: 0.3 }}>—</span>}
                    </td>
                  )}
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--orange)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                    {fmt(c.total_combined)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top hard-money donors */}
      {topDonors.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <SectionLabel>Top Hard-Money Donors — {year}</SectionLabel>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['#', 'Donor', 'Type', 'Contributions', 'Total'].map((h, j) => (
                    <th key={h} style={{
                      padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                      textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                      textAlign: j === 0 || j === 2 ? 'center' : j >= 3 ? 'right' : 'left',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topDonors.map((d, i) => (
                  <tr key={d.name} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                    <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>
                      {i + 1}
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', wordBreak: 'break-word', maxWidth: '260px' }}>
                      <a href={`/donor/${slugify(d.name)}`}
                        style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                        {d.name}
                      </a>
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>
                      <span style={{
                        fontSize: '0.55rem', padding: '0.1rem 0.4rem',
                        border: `1px solid ${d.is_corporate ? 'rgba(160,192,255,0.4)' : 'rgba(128,255,160,0.4)'}`,
                        color: d.is_corporate ? 'var(--blue)' : 'var(--green)',
                        borderRadius: '2px', fontFamily: 'var(--font-mono)',
                      }}>
                        {d.is_corporate ? 'CORP' : 'IND'}
                      </span>
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                      {d.num_contributions.toLocaleString()}
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--orange)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                      {fmt(d.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
            Hard money (direct candidate contributions) only
          </div>
        </div>
      )}

      <div style={{ marginTop: '3rem' }}>
        <DataTrustBlock
          source="Florida Division of Elections — Campaign Finance Filings"
          sourceUrl="https://dos.elections.myflorida.com/campaign-finance/"
          lastUpdated="April 2026"
          direct={['candidate and committee totals per cycle', 'party breakdown', 'office breakdown']}
          normalized={['soft money linked from committee contributions (2020 onward)', 'combined totals = hard + linked soft money']}
          caveats={[
            'Cycle totals include all state-level races. Federal candidates excluded.',
            'Soft money linkage available from 2020 onward only.',
          ]}
        />
      </div>
    </main>
  );
}
