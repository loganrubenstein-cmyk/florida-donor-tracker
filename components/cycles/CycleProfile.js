// components/cycles/CycleProfile.js
// Server component
import Link from 'next/link';
import BackLinks from '@/components/BackLinks';
import { slugify } from '@/lib/slugify';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import TabbedProfile from '@/components/shared/TabbedProfile';
import EntityHeader from '@/components/shared/EntityHeader';
import { PARTY_COLOR } from '@/lib/partyUtils';
import { fmtMoneyCompact as fmt } from '@/lib/fmt';

function StatBox({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'var(--bg)', padding: '1rem 1.25rem',
      display: 'flex', flexDirection: 'column', gap: '0.25rem',
    }}>
      <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.3rem', fontFamily: 'var(--font-serif)', color: color || 'var(--orange)', fontWeight: 400 , fontVariantNumeric: 'tabular-nums' }}>
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

const PARTY_LABEL  = { REP: 'R', DEM: 'D', NPA: 'I', OTH: 'O', NOP: 'NPA', IND: 'Ind', LPF: 'Lib', WRI: 'W-I', ASP: 'ASP', CPF: 'CPF', MGT: 'NPA' };

const STATEWIDE = new Set([
  'Governor', 'GOVERNOR AND  LT.GOVERNOR', 'United States Senator', 'U.S. Senator',
  'Attorney General', 'ATTORNEY GENERAL', 'Chief Financial Officer', 'CHIEF FINANCIAL OFFICER',
  'Commissioner of Agriculture', 'COMMISSIONER OF AGRICULTURE',
]);

const HOUSE_CODES      = new Set(['STR']);
const SENATE_CODES     = new Set(['STS']);
const STATEWIDE_CODES  = new Set(['GOV', 'LTG', 'ATG', 'CFO', 'CAG']);

export default function CycleProfile({ year, candidates, topDonors = [], electionCycle = null }) {
  // Aggregate totals
  const total_hard     = candidates.reduce((s, c) => s + (c.hard_money_total  || 0), 0);
  const total_soft     = candidates.reduce((s, c) => s + (c.soft_money_total  || 0), 0);
  const total_combined = candidates.reduce((s, c) => s + (c.total_combined    || 0), 0);
  const hasSoft        = total_soft > 0;

  // Top 20 by combined
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
  const partyRows = Object.entries(byParty).sort(([, a], [, b]) => b.total - a.total);

  // Chamber breakdown
  const byChamber = { House: { total: 0, count: 0 }, Senate: { total: 0, count: 0 }, Statewide: { total: 0, count: 0 }, Other: { total: 0, count: 0 } };
  for (const c of candidates) {
    const code = (c.office_code || '').toUpperCase();
    const key = HOUSE_CODES.has(code) ? 'House' : SENATE_CODES.has(code) ? 'Senate' : STATEWIDE_CODES.has(code) ? 'Statewide' : 'Other';
    byChamber[key].total += c.total_combined || 0;
    byChamber[key].count++;
  }
  const chamberEntries = Object.entries(byChamber).filter(([, v]) => v.total > 0);
  const chamberMax = Math.max(...chamberEntries.map(([, v]) => v.total));

  // Statewide election results
  const seen = new Set();
  const statewideRaces = (electionCycle?.finance_races_top50 || []).filter(r => {
    if (!STATEWIDE.has(r.contest_name)) return false;
    const key = r.contest_name.toLowerCase().replace(/[^a-z]/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return r.candidates.some(c => c.finance_acct_num && c.candidate_name !== 'UnderVotes');
  });

  // ── Overview ───────────────────────────────────────────────────────────────
  const overviewContent = (
    <div style={{ paddingTop: '1.25rem' }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
        {/* Party bars */}
        <div>
          <SectionLabel>By Party</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {partyRows.map(([party, pdata]) => {
              const pct = total_combined > 0 ? (pdata.total / total_combined) * 100 : 0;
              const color = PARTY_COLOR[party] || 'var(--text-dim)';
              return (
                <div key={party}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.82rem', color }}>
                      {PARTY_LABEL[party] || party}
                      <span style={{ fontWeight: 400, color: 'var(--text-dim)', marginLeft: '0.4rem', fontSize: '0.62rem' }}>
                        {pdata.count}
                      </span>
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color, whiteSpace: 'nowrap' }}>
                      {fmt(pdata.total)}
                    </span>
                  </div>
                  <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px', opacity: 0.7 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chamber bars */}
        <div>
          <SectionLabel>By Chamber</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {chamberEntries.map(([chamber, cdata]) => {
              const pct = chamberMax > 0 ? (cdata.total / chamberMax) * 100 : 0;
              const color = chamber === 'House' ? 'var(--teal)' : chamber === 'Senate' ? 'var(--blue)' : chamber === 'Statewide' ? 'var(--orange)' : 'var(--text-dim)';
              return (
                <div key={chamber}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.82rem', color }}>
                      {chamber}
                      <span style={{ fontWeight: 400, color: 'var(--text-dim)', marginLeft: '0.4rem', fontSize: '0.62rem' }}>
                        {cdata.count}
                      </span>
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--orange)', whiteSpace: 'nowrap' }}>
                      {fmt(cdata.total)}
                    </span>
                  </div>
                  <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px', opacity: 0.6 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* By office */}
      <div style={{ marginBottom: '1rem' }}>
        <SectionLabel>By Office — Top Races</SectionLabel>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <tbody>
            {topOffices.map(([office, data]) => {
              const raceSlug = encodeURIComponent(office.toLowerCase().replace(/\s+/g, '-'));
              return (
              <tr key={office} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                <td style={{ padding: '0.35rem 0.5rem', fontSize: '0.68rem', maxWidth: '160px', wordBreak: 'break-word' }}>
                  <Link href={`/race/${raceSlug}/${year}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                    {office}
                  </Link>
                </td>
                <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                  {data.count}
                </td>
                <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right', color: 'var(--orange)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                  {fmt(data.total)}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!hasSoft && (
        <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginTop: '0.75rem' }}>
          Soft money (PAC) linkage available from 2020 onward only.
        </div>
      )}
    </div>
  );

  // ── Top Fundraisers ────────────────────────────────────────────────────────
  const fundraisersContent = (
    <div style={{ paddingTop: '1.25rem' }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: '1rem', lineHeight: 1.5 }}>
        Top 20 candidates by total funds raised in the {year} cycle, combining direct contributions and linked committee money.
        {hasSoft && (
          <> Soft money reflects committees linked via FL DOE Statement of Solicitation.{' '}
            <a href="/methodology" style={{ color: 'var(--teal)', textDecoration: 'none' }}>See methodology →</a>
          </>
        )}
      </div>
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
                <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.72rem', maxWidth: '140px', wordBreak: 'break-word' }}>
                  {c.office_desc || '—'}
                </td>
                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--blue)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                  {fmt(c.hard_money_total)}
                </td>
                {hasSoft && (
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--teal)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                    {c.soft_money_total > 0 ? fmt(c.soft_money_total) : <span style={{ opacity: 0.3 }}>—</span>}
                  </td>
                )}
                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--orange)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                  {fmt(c.total_combined)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ── Top Donors ────────────────────────────────────────────────────────────
  const donorsContent = topDonors.length > 0 ? (
    <div style={{ paddingTop: '1.25rem' }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: '1rem', lineHeight: 1.5 }}>
        Top hard-money donors in the {year} cycle by total contributions to candidate accounts. Hard money only — does not include PAC transfers.
      </div>
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
              <tr key={d.slug || d.name} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>
                  {i + 1}
                </td>
                <td style={{ padding: '0.4rem 0.6rem', wordBreak: 'break-word', maxWidth: '260px' }}>
                  <a href={`/donor/${d.slug || slugify(d.name)}`}
                    style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                    {d.name}
                  </a>
                  <a href={`/follow?donor=${d.slug || slugify(d.name)}`}
                    style={{ marginLeft: '0.4rem', fontSize: '0.58rem', color: 'var(--teal)', textDecoration: 'none', opacity: 0.6 }}
                    title="Follow this donor's money">
                    follow
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
                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                  {d.num_contributions.toLocaleString()}
                </td>
                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--orange)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                  {fmt(d.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  ) : null;

  // ── Election Results ───────────────────────────────────────────────────────
  const electionContent = statewideRaces.length > 0 ? (
    <div style={{ paddingTop: '1.25rem' }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: '1rem', lineHeight: 1.5 }}>
        Statewide race results with campaign finance matched to Florida Division of Elections filing data.
        Bars show total raised; winner indicated with ✓.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '0.85rem' }}>
        {statewideRaces.map(race => {
          const real = race.candidates.filter(c => c.finance_acct_num && c.candidate_name !== 'UnderVotes');
          const sorted = [...real].sort((a, b) => (b.total_raised || 0) - (a.total_raised || 0));
          const maxR = sorted[0]?.total_raised || 1;
          const contestLabel = race.contest_name
            .replace('GOVERNOR AND  LT.GOVERNOR', 'Governor')
            .replace('COMMISSIONER OF AGRICULTURE', 'Commissioner of Agriculture')
            .replace('CHIEF FINANCIAL OFFICER', 'Chief Financial Officer')
            .replace('ATTORNEY GENERAL', 'Attorney General');
          return (
            <div key={race.contest_name} style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '0.85rem 1rem', background: 'var(--surface)' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {contestLabel}
              </div>
              {sorted.map(c => (
                <div key={c.candidate_name} style={{ marginBottom: '0.45rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.18rem' }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: PARTY_COLOR[c.party] || 'var(--text-dim)', display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.78rem', color: c.winner ? 'var(--text)' : 'var(--text-dim)', fontWeight: c.winner ? 600 : 400, flex: 1 }}>
                      {c.winner && <span style={{ color: 'var(--green)', marginRight: '3px', fontSize: '0.58rem' }}>✓</span>}
                      <a href={`/candidate/${c.finance_acct_num}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {c.candidate_name}
                      </a>
                    </span>
                    <span style={{ fontSize: '0.63rem', fontFamily: 'var(--font-mono)', color: 'var(--orange)', whiteSpace: 'nowrap' }}>
                      {fmt(c.total_raised)}
                    </span>
                  </div>
                  <div style={{ height: '2px', borderRadius: '1px', background: PARTY_COLOR[c.party] || 'var(--text-dim)', width: `${Math.max(1, (c.total_raised / maxR) * 100)}%`, opacity: c.winner ? 0.7 : 0.25, marginLeft: '12px' }} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', marginTop: '0.6rem' }}>
        Finance data: FL Division of Elections hard money raised through election date. Click candidate name for full profile.
      </div>
    </div>
  ) : null;

  // ── Sources ───────────────────────────────────────────────────────────────
  const sourcesContent = (
    <div style={{ paddingTop: '1.25rem' }}>
      <DataTrustBlock
        source="Florida Division of Elections — Campaign Finance Filings"
        sourceUrl="https://dos.elections.myflorida.com/campaign-finance/"
        direct={['candidate and committee totals per cycle', 'party breakdown', 'office breakdown']}
        normalized={['soft money linked from committee contributions (2020 onward)', 'combined totals = hard + linked soft money']}
        caveats={[
          'Cycle totals include all state-level races. Federal candidates excluded.',
          'Soft money linkage available from 2020 onward only.',
        ]}
      />
    </div>
  );

  // ── Build tabs ─────────────────────────────────────────────────────────────
  const tabs = [
    {
      id: 'overview',
      label: 'Overview',
      description: `Stats, party breakdown, chamber breakdown, and top offices for ${year}`,
      content: overviewContent,
    },
    {
      id: 'fundraisers',
      label: 'Top Fundraisers (20)',
      description: `Top 20 candidates by total raised in ${year}`,
      content: fundraisersContent,
    },
    ...(topDonors.length > 0 ? [{
      id: 'donors',
      label: `Top Donors (${topDonors.length})`,
      description: `Top hard-money donors in the ${year} cycle`,
      content: donorsContent,
    }] : []),
    ...(statewideRaces.length > 0 ? [{
      id: 'elections',
      label: `Election Results (${statewideRaces.length})`,
      description: `Statewide race results with finance data matched for ${year}`,
      content: electionContent,
    }] : []),
    {
      id: 'sources',
      label: 'Sources',
      description: 'Data sources and methodology',
      content: sourcesContent,
    },
  ];

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>
      <BackLinks links={[{ href: '/', label: 'home' }, { href: '/cycles', label: 'cycles' }]} />

      <EntityHeader
        name={`${year} Florida Elections`}
        typeBadge={{ label: 'ELECTION CYCLE', color: 'var(--orange)' }}
        meta={[
          `${candidates.length.toLocaleString()} candidates · ${fmt(total_combined)} raised`,
          hasSoft ? 'Hard + soft money combined' : 'Hard money only · soft money linked from 2020',
        ]}
      />

      <TabbedProfile tabs={tabs} defaultTab="overview" />
    </main>
  );
}
