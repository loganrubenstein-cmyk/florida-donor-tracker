// components/candidate/CandidateProfile.js
import dynamic from 'next/dynamic';
import BackLinks from '@/components/BackLinks';
import TabbedProfile from '@/components/shared/TabbedProfile';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import NewsBlock from '@/components/shared/NewsBlock';
import SourceLink from '@/components/shared/SourceLink';
import { slugify } from '@/lib/slugify';
import { fmtMoneyCompact, fmtMoney } from '@/lib/fmt';

const QuarterlyChart      = dynamic(() => import('./QuarterlyChart'), { ssr: false });
const IndustryBreakdown   = dynamic(() => import('./IndustryBreakdown'), { ssr: false });
const TransactionExplorer = dynamic(() => import('@/components/explorer/TransactionExplorer'), { ssr: false });

const PARTY_COLOR = { REP: 'var(--republican)', DEM: 'var(--democrat)' };
const TYPE_COLOR  = { corporate: '#94a3b8', individual: 'var(--blue)' };

const LINK_TYPE_LABEL = {
  SOLICITATION_CONTROL:              'Solicitation',
  STATEMENT_OF_ORG_SUPPORT:          'Statement of Org',
  DIRECT_CONTRIBUTION_TO_CANDIDATE:  'Direct Contribution',
  OTHER_DISTRIBUTION_TO_CANDIDATE:   'Distribution',
  IEC_FOR_OR_AGAINST:                'Independent Expenditure',
  ECC_FOR_OR_AGAINST:                'Electioneering Comm.',
  ADMIN_OVERLAP_ONLY:                'Administrative',
  // Legacy labels (candidate_pc_links table fallback)
  chair:              'Chair',
  treasurer:          'Treasurer',
  solicitation:       'Solicitation',
  solicitation_stub:  'Solicitation',
  historical:         'Historical',
  historical_stub:    'Historical',
  direct_contribution: 'Direct Contribution',
  iec:                'Independent Expenditure',
  ecc:                'Electioneering Comm.',
  statement_of_org:   'Statement of Org',
  distribution:       'Distribution',
};

function fmt(n) {
  if (n == null || n === 0) return '$0';
  return fmtMoneyCompact(n);
}

function fmtDate(s) {
  if (!s || s === 'None' || s === 'null') return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
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

const OFFICE_SHORT = {
  STR: 'Rep', STS: 'Sen', GOV: 'Gov', LTG: 'Lt. Gov',
  ATG: 'AG', CFO: 'CFO', CAG: 'Ag Comm',
  USR: 'US Rep', USS: 'US Sen', PRE: 'President',
  STA: 'St. Atty', PUB: 'Pub. Def', CTJ: 'Ct. Judge', SEB: 'St. Exec',
};

function VendorBar({ vendor, maxAmount }) {
  const pct = maxAmount > 0 ? (vendor.total_amount / maxAmount) * 100 : 0;
  return (
    <div style={{ marginBottom: '0.6rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '0.2rem' }}>
        <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
          {vendor.vendor_name}
        </span>
        <span style={{ color: 'var(--orange)', whiteSpace: 'nowrap', marginLeft: '0.5rem' }}>
          {fmtMoney(vendor.total_amount)}
          <span style={{ color: 'var(--text-dim)', fontWeight: 400, marginLeft: '0.35rem' }}>
            ({vendor.pct.toFixed(1)}%)
          </span>
        </span>
      </div>
      <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--orange)', borderRadius: '2px' }} />
      </div>
    </div>
  );
}

const PARTY_LABEL = { REP: 'Republican', DEM: 'Democrat', NPA: 'Independent' };
const ETYPE_LABEL = { general: 'General', primary: 'Primary' };

function ElectionContextCard({ results }) {
  if (!results?.length) return null;
  // Show up to 4 most recent
  const rows = results.slice(0, 4);
  return (
    <div style={{ marginBottom: '2rem' }}>
      <SectionLabel>Election Results</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {rows.map((r, i) => {
          const won = r.winner;
          const cpv = r.cost_per_vote;
          const votes = r.total_votes;
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.55rem 0.85rem',
              border: `1px solid ${won ? 'rgba(128,255,160,0.25)' : 'var(--border)'}`,
              borderRadius: '4px',
              background: won ? 'rgba(128,255,160,0.04)' : 'transparent',
            }}>
              <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: won ? 'var(--green)' : 'var(--text-dim)', fontWeight: 700, minWidth: '36px' }}>
                {r.year}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', minWidth: '55px' }}>
                {ETYPE_LABEL[r.election_type] || r.election_type}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {won && <span style={{ color: 'var(--green)', marginRight: '5px', fontSize: '0.65rem' }}>✓</span>}
                {r.contest_name}
              </div>
              {votes > 0 && (
                <div style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                  {votes >= 1000 ? `${(votes/1000).toFixed(0)}K` : votes} votes
                </div>
              )}
              {cpv > 0 && (
                <div style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--teal)', whiteSpace: 'nowrap' }}>
                  ${cpv.toFixed(2)}/vote
                </div>
              )}
            </div>
          );
        })}
      </div>
      {results.length > 4 && (
        <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>
          +{results.length - 4} more election cycles
        </div>
      )}
      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>
        Source: FL Division of Elections results · Finance-matched only · <a href="/elections" style={{ color: 'var(--teal)', textDecoration: 'none' }}>→ elections page</a>
      </div>
    </div>
  );
}

export default function CandidateProfile({ data, cycles = [], electionResults = [] }) {
  const hm     = data.hard_money || {};
  const donors = hm.top_donors  || [];
  const pcs        = data.linked_pcs || [];
  const pcsWithData = pcs.filter(pc => pc.pc_acct && pc.link_type !== 'solicitation_stub' && pc.link_type !== 'historical_stub');
  const pcsStubOnly = pcs.filter(pc => !pc.pc_acct || pc.link_type === 'solicitation_stub' || pc.link_type === 'historical_stub');
  const party  = data.party_code;
  const partyColor = PARTY_COLOR[party] || null;

  const officeLabel = [data.office_desc, data.district ? `District ${data.district}` : null]
    .filter(Boolean).join(' · ');

  const researchLinks = [
    { label: 'FL DOE Candidate Page →', href: `https://dos.elections.myflorida.com/candidates/CanDetail.asp?account=${data.acct_num}` },
    { label: 'Campaign Finance Activity →', href: `https://dos.elections.myflorida.com/cgi-bin/TreSel.exe?account=${data.acct_num}` },
    { label: 'Google News →', href: `https://news.google.com/search?q=${encodeURIComponent((data.candidate_name || '') + ' Florida')}` },
    { label: 'OpenSecrets →', href: `https://www.opensecrets.org/search?q=${encodeURIComponent(data.candidate_name || '')}&type=politicians` },
  ];

  // ── Tab content ─────────────────────────────────────────────────────────────

  const overviewContent = (
    <div>
      {/* Combined stats grid */}
      <div className="rg-3" style={{
        gap: '1px', background: 'var(--border)',
        border: '1px solid var(--border)', borderRadius: '3px',
        marginBottom: '2rem', overflow: 'hidden',
      }}>
        {[
          { label: 'Hard Money (Direct)',   value: fmt(hm.total),              sub: `${(hm.num_contributions || 0).toLocaleString()} contributions` },
          { label: 'Soft Money (Linked PCs)', value: fmt(data.soft_money_total), sub: pcsWithData.length > 0 ? `${pcsWithData.length} committee${pcsWithData.length !== 1 ? 's' : ''} linked${pcsStubOnly.length > 0 ? ` + ${pcsStubOnly.length} historical` : ''}` : pcs.length > 0 ? `${pcs.length} affiliated (data unavailable)` : '0 committees linked' },
          { label: 'Combined Total',         value: fmt(data.total_combined),   sub: 'hard + soft' },
        ].map(({ label, value, sub }) => (
          <div key={label} style={{ background: 'var(--bg)', padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>
              {label}
            </div>
            <div style={{ fontSize: '1rem', color: 'var(--orange)', fontWeight: 700 }}>{value}</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>{sub}</div>
          </div>
        ))}
      </div>

      <ElectionContextCard results={electionResults} />

      {/* Hard money breakdown */}
      {hm.total > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <SectionLabel>Hard Money Breakdown</SectionLabel>
          <div className="rg-4" style={{
            gap: '1px', background: 'var(--border)',
            border: '1px solid var(--border)', borderRadius: '3px',
            marginBottom: '1.25rem', overflow: 'hidden',
          }}>
            {[
              { label: 'Individual', value: fmt(hm.individual_total) },
              { label: 'Corporate',  value: fmt(hm.corporate_total) },
              { label: 'Earliest',   value: fmtDate(hm.date_range?.earliest) },
              { label: 'Latest',     value: fmtDate(hm.date_range?.latest) },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: 'var(--bg)', padding: '0.75rem 1rem' }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>{label}</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text)', fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>

          {hm.by_quarter?.length > 0 && (
            <div style={{ marginBottom: '0.25rem' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                Quarterly Fundraising
              </div>
              <QuarterlyChart data={hm.by_quarter} />
            </div>
          )}
        </div>
      )}
    </div>
  );

  const donorsContent = (
    <div>
      {donors.length > 0 ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Top Donors (Hard Money)
            </div>
            <a
              href={`/explorer?recipient_acct=${data.acct_num}&recipient_type=candidate`}
              style={{ fontSize: '0.65rem', color: 'var(--teal)', textDecoration: 'none' }}
            >
              View all contributions →
            </a>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['#', 'Donor', 'Occupation', 'Type', 'Total', 'Contributions'].map(h => (
                  <th key={h} style={{
                    padding: '0.4rem 0.6rem',
                    textAlign: h === '#' || h === 'Contributions' ? 'center' : 'left',
                    fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
                    letterSpacing: '0.08em', fontWeight: 400,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {donors.map((donor, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>{i + 1}</td>
                  <td style={{ padding: '0.45rem 0.6rem', wordBreak: 'break-word' }}>
                    <a href={`/donor/${slugify(donor.name)}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                      {donor.name}
                    </a>
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.68rem', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {donor.occupation || '—'}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: TYPE_COLOR[donor.type] || 'var(--text-dim)', fontSize: '0.68rem' }}>
                    {donor.type}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--orange)', whiteSpace: 'nowrap' }}>
                    {fmtMoney(donor.total_amount)}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center' }}>
                    {(donor.num_contributions || 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>No donor data available.</p>
      )}
    </div>
  );

  const committeesContent = (
    <div>
      {pcs.length > 0 ? (
        <>
          <SectionLabel>Linked Political Committees (Soft Money)</SectionLabel>
          <p style={{ fontSize: '0.68rem', color: 'rgba(90,106,136,0.75)', lineHeight: 1.5, marginBottom: '0.75rem' }}>
            Links are based on FL Division of Elections filings — solicitation statements (DS-DE 102), direct contributions, and independent expenditures.
            Administrative overlaps (shared treasurer, address, phone) alone are not shown. Hover a confidence badge to see the source evidence.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Committee', 'Link Evidence', 'Total Raised', 'Contributions'].map(h => (
                  <th key={h} style={{
                    padding: '0.4rem 0.6rem',
                    textAlign: h === 'Contributions' ? 'center' : 'left',
                    fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
                    letterSpacing: '0.08em', fontWeight: 400,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pcs.map((pc, i) => {
                const isStub = !pc.pc_acct || pc.link_type === 'solicitation_stub' || pc.link_type === 'historical_stub';
                const isHistorical = pc.link_type === 'historical' || pc.link_type === 'historical_stub';
                const isStrong = pc.confidence_tier === 'strong';
                const tierColor  = isStrong ? 'var(--teal)' : 'var(--orange)';
                const tierLabel  = isStrong ? 'Strong' : 'Possible';
                return (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)', opacity: isHistorical ? 0.75 : 1 }}>
                    <td style={{ padding: '0.45rem 0.6rem', wordBreak: 'break-word' }}>
                      {isStub || !pc.pc_acct ? (
                        <span style={{ color: 'var(--text-dim)' }}>{pc.pc_name || '—'}</span>
                      ) : (
                        <a href={`/committee/${pc.pc_acct}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                          {pc.pc_name || pc.pc_acct}
                        </a>
                      )}
                    </td>
                    <td style={{ padding: '0.45rem 0.6rem', fontSize: '0.68rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--text-dim)' }}>{LINK_TYPE_LABEL[pc.link_type] || pc.link_type}</span>
                        <span title={pc.signal_evidence || undefined} style={{
                          fontSize: '0.55rem', padding: '0.1rem 0.35rem',
                          border: `1px solid ${tierColor}55`,
                          background: `${tierColor}11`,
                          color: tierColor,
                          borderRadius: '2px', fontFamily: 'var(--font-mono)',
                          cursor: pc.signal_evidence ? 'help' : 'default',
                          whiteSpace: 'nowrap',
                        }}>
                          {tierLabel}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '0.45rem 0.6rem', whiteSpace: 'nowrap' }}>
                      {isStub
                        ? <span style={{ color: 'var(--text-dim)', fontSize: '0.68rem' }}>data unavailable</span>
                        : <span style={{ color: 'var(--orange)' }}>{fmt(pc.total_received)}</span>
                      }
                    </td>
                    <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center' }}>
                      {isStub ? '—' : pc.num_contributions > 0 ? pc.num_contributions.toLocaleString() : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      ) : (
        <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>No linked political committees found.</p>
      )}
    </div>
  );

  const industriesContent = (
    <div>
      {hm.total > 0 ? (
        <IndustryBreakdown acctNum={data.acct_num} total={hm.total} />
      ) : (
        <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>No industry breakdown available.</p>
      )}
    </div>
  );

  const exp = data.expenditures || {};
  const expVendors = exp.top_vendors || [];
  const maxVendorAmount = expVendors.length > 0 ? expVendors[0].total_amount : 0;

  const expendituresContent = (
    <div>
      {exp.total_spent > 0 ? (
        <>
          {/* Summary stats */}
          <div className="rg-3" style={{
            gap: '1px', background: 'var(--border)',
            border: '1px solid var(--border)', borderRadius: '3px',
            marginBottom: '2rem', overflow: 'hidden',
          }}>
            {[
              { label: 'Total Spent',    value: fmtMoney(exp.total_spent) },
              { label: 'Expenditures',   value: (exp.num_expenditures || 0).toLocaleString() },
              { label: 'Period',         value: exp.date_start ? `${fmtDate(exp.date_start)} – ${fmtDate(exp.date_end)}` : '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: 'var(--bg)', padding: '1rem 1.25rem' }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>{label}</div>
                <div style={{ fontSize: '1rem', color: 'var(--orange)', fontWeight: 700 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Top vendors bar chart */}
          {expVendors.length > 0 && (
            <>
              <SectionLabel>Top Vendors / Payees</SectionLabel>
              {expVendors.map((v, i) => (
                <VendorBar key={i} vendor={v} maxAmount={maxVendorAmount} />
              ))}
            </>
          )}
        </>
      ) : (
        <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>No expenditure data available for this campaign account.</p>
      )}
    </div>
  );

  const transactionsContent = (
    <div>
      <TransactionExplorer
        initialRecipientAcct={data.acct_num}
        initialRecipientType="candidate"
        prefilterLabel={`Contributions to ${data.candidate_name || data.acct_num}`}
      />
    </div>
  );

  const sourcesContent = (
    <div>
      <SectionLabel>Research Links</SectionLabel>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        {researchLinks.map(({ label, href }) => (
          <a key={label} href={href} target="_blank" rel="noopener noreferrer" style={{
            padding: '0.35rem 0.75rem', border: '1px solid var(--border)',
            color: 'var(--text-dim)', fontSize: '0.72rem', borderRadius: '3px',
            textDecoration: 'none', fontFamily: 'var(--font-mono)',
          }}>
            {label}
          </a>
        ))}
      </div>

      <NewsBlock articles={data.news} />

      <DataTrustBlock
        source="Florida Division of Elections"
        sourceUrl={`https://dos.elections.myflorida.com/candidates/CanDetail.asp?account=${data.acct_num}`}
        direct={['candidate_name', 'party_code', 'office_desc', 'district', 'election_year', 'status_desc', 'amount', 'contribution_date']}
        normalized={['hard_money_total', 'soft_money_total', 'combined_total']}
        inferred={['linked_pc_connections', 'donor_profile_links']}
        classified={['donor_type (individual vs. corporate)', 'industry_sector']}
        caveats={[
          'Soft money total is the sum of all linked Political Committees\' reported contributions — not money the candidate directly raised.',
          'Industry breakdown is derived from contributor occupation strings, which are self-reported and often blank.',
          'Linked PC connections are based on official chairperson/treasurer filings — not contribution flow.',
        ]}
      />
    </div>
  );

  const tabs = [
    { id: 'overview',      label: 'Overview',      content: overviewContent },
    { id: 'donors',        label: 'Donors',        content: donorsContent },
    { id: 'committees',    label: 'Committees',    content: committeesContent },
    { id: 'industries',    label: 'Industries',    content: industriesContent },
    { id: 'expenditures',  label: 'Expenditures',  content: expendituresContent },
    { id: 'transactions',  label: 'Transactions',  content: transactionsContent },
    { id: 'sources',       label: 'Sources',       content: sourcesContent },
  ];

  return (
    <main className="m-padx" style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      <BackLinks links={[{ href: '/', label: 'home' }, { href: '/candidates', label: 'candidates' }]} />

      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '0.65rem', padding: '0.15rem 0.5rem',
            border: '1px solid var(--teal)', color: 'var(--teal)',
            borderRadius: '3px', textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            candidate
          </span>
          {party && (
            <span style={{
              fontSize: '0.65rem', padding: '0.15rem 0.45rem',
              border: `1px solid ${partyColor}`, color: partyColor,
              borderRadius: '3px', letterSpacing: '0.06em', fontWeight: 'bold',
            }}>
              {party}
            </span>
          )}
          {data.election_year && (
            <span style={{
              fontSize: '0.65rem', padding: '0.15rem 0.45rem',
              border: '1px solid var(--border)', color: 'var(--text-dim)',
              borderRadius: '3px', fontFamily: 'var(--font-mono)',
            }}>
              {data.election_year}
            </span>
          )}
        </div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.4rem, 3vw, 2rem)',
          fontWeight: 400, color: '#fff', lineHeight: 1.2, marginBottom: '0.4rem',
        }}>
          {data.candidate_name || `Account #${data.acct_num}`}
        </h1>
        {officeLabel && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>
            {officeLabel}
          </div>
        )}
        <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
          Acct #{data.acct_num}
          {data.status_desc ? ` · ${data.status_desc}` : ''}
        </div>
        <SourceLink type="candidate" id={data.acct_num} />
      </div>

      {/* Cycle connector pill bar */}
      {cycles.length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
            Other elections — {data.candidate_name}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {cycles.map(c => {
              const officeLabel = OFFICE_SHORT[c.office_code] || c.office_code;
              const distLabel   = c.district && c.district !== '000' ? ` · Dist ${c.district.replace(/^0+/, '')}` : '';
              return (
                <a
                  key={c.acct_num}
                  href={`/candidate/${c.acct_num}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                    padding: '0.2rem 0.55rem',
                    border: '1px solid rgba(100,140,220,0.25)',
                    borderRadius: '3px',
                    fontSize: '0.68rem',
                    color: 'var(--text-dim)',
                    textDecoration: 'none',
                    fontFamily: 'var(--font-mono)',
                    whiteSpace: 'nowrap',
                    transition: 'border-color 0.12s, color 0.12s',
                  }}
                >
                  <span style={{ color: 'var(--orange)', fontWeight: 700 }}>{c.year}</span>
                  <span>{officeLabel}{distLabel}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      <TabbedProfile tabs={tabs} defaultTab="overview" />
    </main>
  );
}
