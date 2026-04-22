// components/donors/DonorProfile.js
import dynamic from 'next/dynamic';
import BackLinks from '@/components/BackLinks';
import IndustryPeers from './IndustryPeers';
import TabbedProfile from '@/components/shared/TabbedProfile';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import FreshnessBadge from '@/components/shared/FreshnessBadge';
import EntityHeader from '@/components/shared/EntityHeader';
import RelationshipsBlock from '@/components/shared/RelationshipsBlock';
import NewsBlock from '@/components/shared/NewsBlock';
import SourceLink from '@/components/shared/SourceLink';
import AnimatedStat from '@/components/shared/AnimatedStat';
import { slugify } from '@/lib/slugify';
import { fmtMoneyCompact, fmtMoney, fmtCount, fmtAvgContribution, avgContribution } from '@/lib/fmt';
import { getPoliticianSlugByAcctNum } from '@/lib/loadCandidate';
import InsightStrip from '@/components/shared/InsightStrip';

const DonorYearChart      = dynamic(() => import('./DonorYearChart'), { ssr: false });
const TransactionExplorer = dynamic(() => import('@/components/explorer/TransactionExplorer'), { ssr: false });

function StatBox({ label, value, rawValue, sub, color, hero }) {
  return (
    <div style={{
      background: hero ? 'rgba(8,8,24,0.9)' : 'var(--bg)',
      padding: '1.1rem 1.35rem',
      display: 'flex', flexDirection: 'column', gap: '0.3rem',
      position: 'relative', overflow: 'hidden',
      ...(hero ? { boxShadow: 'inset 0 -2px 0 0 ' + (color || 'var(--orange)') } : {}),
    }}>
      {hero && (
        <div style={{
          position: 'absolute', bottom: '-30px', left: '-20px',
          width: '160px', height: '100px', borderRadius: '50%',
          background: color || 'var(--orange)',
          opacity: 0.07, filter: 'blur(28px)', pointerEvents: 'none',
        }} />
      )}
      <div style={{ fontSize: '0.57rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </div>
      <div style={{ fontSize: hero ? '1.75rem' : '1.25rem', fontFamily: 'var(--font-serif)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
        {rawValue != null
          ? <AnimatedStat value={rawValue} format="compact" color={hero ? (color || 'var(--orange)') : 'var(--text)'} />
          : <span style={{ color: hero ? (color || 'var(--orange)') : 'var(--text)' }}>{value}</span>
        }
      </div>
      {sub && (
        <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>{sub}</div>
      )}
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

function CommitteeTable({ committees }) {
  if (!committees.length) return <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>No committee contributions recorded.</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['#', 'Committee', 'Contributions', 'Total'].map((h, j) => (
              <th key={h} style={{
                padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                textAlign: j === 0 ? 'center' : j >= 2 ? 'right' : 'left',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {committees.map((c, i) => (
            <tr key={c.acct_num} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
              <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>{i + 1}</td>
              <td style={{ padding: '0.4rem 0.6rem', maxWidth: '340px', wordBreak: 'break-word' }}>
                <a href={`/committee/${c.acct_num}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                  {c.committee_name || `Committee #${c.acct_num}`}
                </a>
              </td>
              <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                {fmtCount(c.num_contributions)}
              </td>
              <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--orange)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {fmtMoney(c.total)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CandidateTable({ candidates }) {
  if (!candidates.length) return <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>No direct candidate contributions recorded.</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['#', 'Candidate', 'Office', 'Party', 'Year', 'Total'].map((h, j) => (
              <th key={h} style={{
                padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                textAlign: j === 0 || j === 3 || j === 4 ? 'center' : j === 5 ? 'right' : 'left',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {candidates.map((c, i) => {
            const pColor = c.party === 'REP' ? 'var(--republican)' : c.party === 'DEM' ? 'var(--democrat)' : 'var(--text-dim)';
            const polSlug = c.acct_num ? getPoliticianSlugByAcctNum(c.acct_num) : null;
            return (
              <tr key={c.acct_num} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>{i + 1}</td>
                <td style={{ padding: '0.4rem 0.6rem', maxWidth: '240px', wordBreak: 'break-word' }}>
                  <a href={polSlug ? `/politician/${polSlug}` : `/candidate/${c.acct_num}`} style={{ color: 'var(--orange)', textDecoration: 'none' }}>
                    {c.candidate_name || `#${c.acct_num}`}
                  </a>
                </td>
                <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.7rem' }}>{c.office || '—'}</td>
                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>
                  {c.party && (
                    <span style={{
                      fontSize: '0.58rem', padding: '0.05rem 0.3rem',
                      border: `1px solid ${pColor}`, color: pColor,
                      borderRadius: '2px', fontWeight: 'bold',
                    }}>{c.party}</span>
                  )}
                </td>
                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                  {c.year || '—'}
                </td>
                <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--blue)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {fmtMoney(c.total)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function DonorProfile({ data, annotations = {} }) {
  const committees = data.committees || [];
  const candidates = data.candidates || [];
  const byYear     = data.by_year    || [];
  const lobbyists  = data.lobbyist_principals || [];
  const contracts  = data.state_contracts || [];
  const federal    = data.federal || null;
  const corpActive = data.corp_status === 'A';

  const norm = s => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const normName = norm(data.name || '');
  const annotation = Object.values(annotations).find(e => norm(e.canonical_name) === normName) || null;
  const articles = annotation?.articles || [];

  const typeColor = data.is_corporate ? 'var(--orange)' : 'var(--teal)';
  const typeLabel = data.is_corporate ? 'Corporate / Org' : 'Individual';

  const location = data.top_location
    ? data.top_location.replace(/,\s*\d{5}(-\d{4})?$/, '').trim()
    : null;

  // ── Tab content ─────────────────────────────────────────────────────────────

  const overviewContent = (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <FreshnessBadge />
      </div>
      {/* Stats grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '1px', background: 'var(--border)', marginBottom: '2rem',
      }}>
        <StatBox label="Combined Total" rawValue={data.total_combined} value={fmtMoneyCompact(data.total_combined)} hero
          sub={avgContribution(data.total_combined, data.num_contributions) != null
            ? `${(data.num_contributions || 0).toLocaleString()} gifts · avg ${fmtAvgContribution(data.total_combined, data.num_contributions)}`
            : null} />
        <StatBox label="PAC / Soft Money" rawValue={data.total_soft} value={fmtMoneyCompact(data.total_soft)}
          sub={`${data.num_committees || 0} committees`} color="var(--teal)" />
        <StatBox label="Direct / Hard Money" rawValue={data.total_hard > 0 ? data.total_hard : null} value={data.total_hard > 0 ? fmtMoneyCompact(data.total_hard) : '—'}
          sub={candidates.length > 0 ? `${data.num_candidates} candidates` : 'No direct contributions'}
          color="var(--blue)" />
        <StatBox label="Lobbyist Principals" value={lobbyists.length > 0 ? lobbyists.length : '—'}
          sub={lobbyists.length > 0 ? 'Employer(s) lobby FL legislature' : 'No lobbyist match'}
          color="var(--orange)" />
        {contracts.length > 0 && (
          <StatBox
            label="State Contracts"
            value={fmtMoneyCompact(contracts.reduce((s, c) => s + c.total_contract_amount, 0))}
            sub={`${contracts.length} vendor match${contracts.length > 1 ? 'es' : ''}`}
            color="var(--gold)"
          />
        )}
        {federal && (
          <StatBox
            label="Federal Giving"
            value={fmtMoneyCompact(federal.total_amount)}
            sub={`${federal.num_contributions.toLocaleString()} FEC gifts`}
            color="var(--blue)"
          />
        )}
      </div>

      {/* Year-by-year chart */}
      {byYear.length > 1 && (
        <div style={{ marginBottom: '2rem' }}>
          <SectionLabel>Contributions Over Time</SectionLabel>
          <DonorYearChart data={byYear} />
        </div>
      )}

      {/* Top recipients preview */}
      {(committees.length > 0 || candidates.length > 0) && (() => {
        const topCommittees = committees.slice(0, 5).map(c => ({
          name: c.committee_name || `Committee #${c.acct_num}`,
          href: `/committee/${c.acct_num}`,
          amount: c.total,
          color: 'var(--teal)',
        }));
        const topCandidates = candidates.slice(0, 3).map(c => ({
          name: c.candidate_name || `#${c.acct_num}`,
          href: c.acct_num ? `/candidate/${c.acct_num}` : '#',
          amount: c.total,
          color: 'var(--blue)',
        }));
        const rows = [...topCommittees, ...topCandidates]
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 6);
        return (
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <SectionLabel>Top Recipients</SectionLabel>
              <a href={`?tab=committees`} style={{ fontSize: '0.65rem', color: 'var(--teal)', textDecoration: 'none' }}>
                View all →
              </a>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {rows.map((r, i) => {
                const pct = data.total_combined > 0 ? (r.amount / data.total_combined) * 100 : 0;
                return (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '1fr auto',
                    alignItems: 'center', gap: '0.75rem',
                    padding: '0.45rem 0',
                    borderBottom: i < rows.length - 1 ? '1px solid rgba(100,140,220,0.06)' : 'none',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <a href={r.href} style={{
                        color: r.color, textDecoration: 'none', fontSize: '0.75rem',
                        display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {r.name}
                      </a>
                      <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', marginTop: '0.25rem' }}>
                        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: r.color, borderRadius: '2px', opacity: 0.6 }} />
                      </div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--orange)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {fmtMoneyCompact(r.amount)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {federal && (
        <div style={{
          marginBottom: '1.25rem',
          padding: '0.85rem 1rem',
          border: '1px solid rgba(160,192,255,0.25)',
          borderRadius: '3px',
          background: 'rgba(160,192,255,0.04)',
          fontSize: '0.78rem',
          color: 'var(--text)',
        }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.35rem' }}>
            Federal giving (FEC)
          </div>
          <div>
            {fmtMoneyCompact(federal.total_amount)} across {federal.num_contributions.toLocaleString()} contributions
            {Array.isArray(federal.cycles) && federal.cycles.length > 0 ? ` · cycles ${federal.cycles.join(', ')}` : ''}.
          </div>
          <a href="/federal/donors" style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: '0.72rem' }}>
            View FL federal donors →
          </a>
        </div>
      )}

      {/* Industry cross-reference + peers */}
      {data.industry && data.industry !== 'Not Employed' && data.industry !== 'Other' && (
        <div style={{ marginBottom: '1rem' }}>
          <a href={`/industry/${slugify(data.industry)}`} style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            fontSize: '0.7rem', color: 'var(--text-dim)', textDecoration: 'none',
            padding: '0.4rem 0.75rem', border: '1px solid rgba(100,140,220,0.15)',
            borderRadius: '3px', fontFamily: 'var(--font-mono)',
          }}>
            → browse top {data.industry} donors
          </a>
          <IndustryPeers industry={data.industry} currentSlug={data.slug} />
        </div>
      )}
    </div>
  );

  const committeesContent = (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          PAC &amp; Committee Contributions — Top {committees.length}
        </div>
        <a href={`/explorer?donor_slug=${data.slug}&recipient_type=committee`} style={{ fontSize: '0.65rem', color: 'var(--teal)', textDecoration: 'none' }}>
          View all →
        </a>
      </div>
      <CommitteeTable committees={committees} />
      <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
        <a href="/flow" className="cross-link">
          Explore money flows across all industries →
        </a>
      </div>
    </div>
  );

  const candidatesContent = (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Direct Candidate Contributions — Top {candidates.length}
        </div>
        <a href={`/explorer?donor_slug=${data.slug}&recipient_type=candidate`} style={{ fontSize: '0.65rem', color: 'var(--teal)', textDecoration: 'none' }}>
          View all →
        </a>
      </div>
      <CandidateTable candidates={candidates} />
    </div>
  );

  const lobbyingContent = (
    <div>
      <RelationshipsBlock
        label="Lobbyist Principal Connections"
        description="This donor's name closely matches one or more registered FL lobbyist principals. Their employer actively lobbies the Florida legislature."
        items={lobbyists.map(l => ({
          href: `/principal/${l.principal_slug || slugify(l.principal_name)}`,
          name: l.principal_name,
          badge: `${l.match_score}% match`,
          accentColor: 'var(--blue)',
        }))}
        emptyText={<>No lobbyist principal connections found. Name-based matching did not link this donor to any registered principal.{' '}<a href="/principals" style={{ color: 'var(--teal)', textDecoration: 'none' }}>Search principals manually →</a></>}
      />
    </div>
  );

  const contractsContent = (
    <div>
      {contracts.length > 0 ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              FL State Contract Matches — {contracts.length} vendor{contracts.length > 1 ? 's' : ''}
            </div>
            <a href="/contracts" style={{ fontSize: '0.65rem', color: 'var(--teal)', textDecoration: 'none' }}>
              Browse all contracts →
            </a>
          </div>
          <div style={{
            background: 'rgba(255,208,96,0.04)', border: '1px solid rgba(255,208,96,0.15)',
            borderRadius: '4px', padding: '0.75rem 1rem', marginBottom: '1rem',
          }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
              This donor&apos;s name closely matches one or more vendors that received FL state contracts
              via the FACTS procurement system. This may indicate the same company both donates to
              campaigns and receives state business.
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['#', 'Vendor', 'Top Agency', 'Contracts', 'Years', 'Total Received'].map((h, j) => (
                    <th key={h} style={{
                      padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                      textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                      textAlign: j === 0 || j === 3 ? 'center' : j === 5 ? 'right' : 'left',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contracts.map((c, i) => (
                  <tr key={c.vendor_slug} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                    <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>{i + 1}</td>
                    <td style={{ padding: '0.4rem 0.6rem', maxWidth: '260px', wordBreak: 'break-word' }}>
                      <a href="/contracts" style={{ color: 'var(--gold)', textDecoration: 'none' }}>
                        {c.vendor_name}
                      </a>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.15rem' }}>
                        {c.match_score >= 99 ? 'exact match' : `${Math.round(c.match_score)}% name match`}
                      </div>
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.7rem', maxWidth: '180px' }}>
                      {c.top_agency || '—'}
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                      {fmtCount(c.num_contracts)}
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                      {c.year_range || '—'}
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--gold)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {fmtMoney(c.total_contract_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>
          No state contract matches found. This donor&apos;s name was not matched to any vendor in
          the FL Accountability Contract Tracking System (FACTS).
        </p>
      )}
    </div>
  );

  const transactionsContent = (
    <div>
      <TransactionExplorer
        initialDonorSlug={data.slug}
        prefilterLabel={`Contributions from ${data.name}`}
      />
    </div>
  );

  const sourcesContent = (
    <div>
      <NewsBlock articles={data.news || []} />

      {data.corp_number && (
        <div style={{ marginBottom: '2rem' }}>
          <SectionLabel>FL Corporate Registration (Sunbiz)</SectionLabel>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderLeft: `3px solid ${corpActive ? 'var(--green)' : 'var(--text-dim)'}`,
            borderRadius: '3px', padding: '0.75rem 1rem',
            display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start',
          }}>
            <div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>Corp Number</div>
              <a href={`https://dos.fl.gov/sunbiz/search/`}
                target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--green)', textDecoration: 'none' }}>
                {data.corp_number} ↗
              </a>
            </div>
            {data.corp_ein && (
              <div>
                <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>EIN</div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text)' }}>{data.corp_ein}</span>
              </div>
            )}
            <div>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>Status</div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: corpActive ? 'var(--green)' : 'var(--text-dim)' }}>
                {corpActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            {data.corp_match_score && (
              <div>
                <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.2rem' }}>Name Match</div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                  {data.corp_match_score >= 99 ? 'exact' : `${data.corp_match_score}%`}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <SectionLabel>Research Links</SectionLabel>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        {[
          { label: 'Find Donor Overlap →', href: '/compare', internal: true },
          { label: 'FL Elections Search →', href: `https://dos.fl.gov/elections/candidates-committees/campaign-finance/contributions/#${encodeURIComponent(data.name || '')}` },
          { label: 'Google →', href: `https://www.google.com/search?q=${encodeURIComponent((data.name || '') + ' Florida political donation')}` },
          ...(lobbyists.length > 0 ? [{ label: 'FL Lobbyist Registry →', href: 'https://www.floridalobbyist.gov/LobbyistInformation/SearchLobbyist' }] : []),
          { label: 'Sunbiz Corp Search →', href: `https://dos.fl.gov/sunbiz/search/` },
        ].map(({ label, href, internal }) => (
          <a key={label} href={href} {...(!internal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            style={{
              padding: '0.35rem 0.75rem', border: '1px solid var(--border)',
              color: internal ? 'var(--teal)' : 'var(--text-dim)', fontSize: '0.72rem', borderRadius: '3px',
              textDecoration: 'none', fontFamily: 'var(--font-mono)',
            }}>
            {label}
          </a>
        ))}
      </div>

      <DataTrustBlock
        source="Florida Division of Elections"
        sourceUrl="https://dos.fl.gov/elections/candidates-committees/campaign-finance/"
        direct={['amount', 'contribution_date', 'contributor_address', 'occupation']}
        normalized={['contributor_name', 'slug']}
        inferred={['committee_links', 'candidate_links', 'lobbyist_principal_match', 'corp_match']}
        classified={['entity_type', 'industry']}
        caveats={[
          'Name deduplication is exact-match only — contributions from the same person filed under different spellings are not merged.',
          'is_corporate flag is a keyword heuristic, not a verified legal classification.',
          lobbyists.length > 0
            ? 'Lobbyist principal link is inferred by name similarity — not confirmed by the Lobbyist Registration Office.'
            : null,
          data.corp_number
            ? `FL corporation match is fuzzy name-based (score: ${data.corp_match_score >= 99 ? 'exact' : data.corp_match_score + '%'}) — verify via Sunbiz before drawing legal conclusions.`
            : null,
        ].filter(Boolean)}
      />
    </div>
  );

  const tabs = [
    { id: 'overview',     label: 'Overview',     description: 'Total contributions, giving history, and top recipients',       content: overviewContent },
    { id: 'committees',   label: 'Committees',   description: 'Political committees (PACs) this donor contributed to',         content: committeesContent },
    { id: 'candidates',   label: 'Candidates',   description: 'Candidates who received direct contributions from this donor',  content: candidatesContent },
    { id: 'transactions', label: 'Transactions', description: 'Individual contribution records from the FL Division of Elections', content: transactionsContent },
    { id: 'lobbying',     label: 'Lobbying',     description: 'FL registered lobbying principal linked to this donor by name', content: lobbyingContent },
    ...(contracts.length > 0 ? [{ id: 'contracts', label: 'Contracts', description: 'FL state contracts awarded to this entity', content: contractsContent }] : []),
    { id: 'sources',      label: 'In The News',  description: 'Recent news coverage, research links, and data sources',        content: sourcesContent },
  ];

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>
      <BackLinks links={[{ href: '/', label: 'home' }, { href: '/donors', label: 'donors' }]} />

      {/* Header */}
      <EntityHeader
        name={data.name}
        typeBadge={{ label: typeLabel, color: typeColor }}
        badges={[
          ...(lobbyists.length > 0 ? [{ label: 'LOBBYIST PRINCIPAL', color: 'var(--blue)' }] : []),
          ...(contracts.length > 0 ? [{ label: 'STATE CONTRACTOR', color: 'var(--gold)' }] : []),
          ...(data.industry && data.industry !== 'Not Employed' && data.industry !== 'Other'
            ? [{ label: data.industry, color: 'rgba(100,140,220,0.5)', href: `/industry/${slugify(data.industry)}` }]
            : []),
          ...(data.corp_number ? [{ label: corpActive ? 'ACTIVE CORP' : 'INACTIVE CORP', color: corpActive ? 'var(--green)' : 'var(--text-dim)', href: `https://dos.fl.gov/sunbiz/search/` }] : []),
          ...(annotation ? [{ label: 'INVESTIGATION', color: 'var(--orange)', href: '/investigations' }] : []),
        ]}
        meta={[
          location || null,
          data.top_occupation || null,
          `${fmtCount(data.num_contributions)} contributions recorded`,
        ]}
      >
        <SourceLink type="donor" />
        {data.name && /state\s+of\s+florida/i.test(data.name) && (
          <div style={{
            marginTop: '0.75rem',
            border: '1px solid var(--border)',
            borderLeft: '3px solid var(--gold)',
            background: 'var(--surface)',
            padding: '0.7rem 0.9rem',
            borderRadius: '3px',
            fontSize: '0.72rem',
            color: 'var(--text-dim)',
            lineHeight: 1.55,
          }}>
            <strong style={{ color: 'var(--text)' }}>Not a political donor in the usual sense.</strong>{' '}
            The State of Florida appears here because of the state&rsquo;s tax check-off
            contribution system, which routes small per-taxpayer amounts to qualifying
            candidates. These are public funds, not discretionary donations.
          </div>
        )}
      </EntityHeader>

      <InsightStrip insights={data.insights} />

      <div style={{ marginBottom: '1.25rem' }}>
        <a
          href={`/follow?donor=${encodeURIComponent(data.slug)}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            fontSize: '0.74rem', color: 'var(--teal)', textDecoration: 'none',
            border: '1px solid rgba(77,216,240,0.3)', borderRadius: '3px',
            padding: '0.3rem 0.75rem', fontFamily: 'var(--font-mono)',
            transition: 'border-color 0.12s',
          }}
        >
          → Follow this donor&apos;s money
        </a>
      </div>

      <TabbedProfile tabs={tabs} defaultTab="overview" />
    </main>
  );
}
