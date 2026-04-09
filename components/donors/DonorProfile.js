// components/donors/DonorProfile.js
import dynamic from 'next/dynamic';
import BackLinks from '@/components/BackLinks';
import TabbedProfile from '@/components/shared/TabbedProfile';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import NewsBlock from '@/components/shared/NewsBlock';
import { slugify } from '@/lib/slugify';
import { fmtMoneyCompact, fmtMoney, fmtCount } from '@/lib/fmt';

const DonorYearChart      = dynamic(() => import('./DonorYearChart'), { ssr: false });
const TransactionExplorer = dynamic(() => import('@/components/explorer/TransactionExplorer'), { ssr: false });

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
      {sub && (
        <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>{sub}</div>
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
            return (
              <tr key={c.acct_num} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>{i + 1}</td>
                <td style={{ padding: '0.4rem 0.6rem', maxWidth: '240px', wordBreak: 'break-word' }}>
                  <a href={`/candidate/${c.acct_num}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
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
      {/* Stats grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '1px', background: 'var(--border)', marginBottom: '2rem',
      }}>
        <StatBox label="Combined Total" value={fmtMoneyCompact(data.total_combined)} />
        <StatBox label="PAC / Soft Money" value={fmtMoneyCompact(data.total_soft)}
          sub={`${data.num_committees || 0} committees`} color="var(--teal)" />
        <StatBox label="Direct / Hard Money" value={data.total_hard > 0 ? fmtMoneyCompact(data.total_hard) : '—'}
          sub={candidates.length > 0 ? `${data.num_candidates} candidates` : 'No direct contributions'}
          color="var(--blue)" />
        <StatBox label="Lobbyist Principals" value={lobbyists.length > 0 ? lobbyists.length : '—'}
          sub={lobbyists.length > 0 ? 'Employer(s) lobby FL legislature' : 'No lobbyist match'}
          color="var(--orange)" />
      </div>

      {/* Year-by-year chart */}
      {byYear.length > 1 && (
        <div style={{ marginBottom: '2rem' }}>
          <SectionLabel>Contributions Over Time</SectionLabel>
          <DonorYearChart data={byYear} />
        </div>
      )}

      {/* Industry cross-reference */}
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
      {lobbyists.length > 0 ? (
        <div>
          <SectionLabel>Lobbyist Principal Connections</SectionLabel>
          <div style={{
            background: 'rgba(160,192,255,0.04)', border: '1px solid rgba(160,192,255,0.15)',
            borderRadius: '4px', padding: '0.75rem 1rem',
          }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
              This donor&apos;s name closely matches one or more registered FL lobbyist principals.
              Their employer actively lobbies the Florida legislature.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {lobbyists.map((l, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.4rem 0.6rem', background: 'rgba(160,192,255,0.06)',
                  borderRadius: '3px',
                }}>
                  <a href={`/principal/${slugify(l.principal_name)}`}
                    style={{ color: 'var(--blue)', fontSize: '0.78rem', textDecoration: 'none' }}>
                    {l.principal_name}
                  </a>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    {l.match_score}% match
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>
          No lobbyist principal connections found. Name-based matching did not link this donor
          to any registered principal in the Florida Lobbyist Registration Office database.
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

      <SectionLabel>Research Links</SectionLabel>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        {[
          { label: 'FL Elections Search →', href: `https://dos.elections.myflorida.com/campaign-finance/contributions/#${encodeURIComponent(data.name || '')}` },
          { label: 'Google →', href: `https://www.google.com/search?q=${encodeURIComponent((data.name || '') + ' Florida political donation')}` },
          ...(lobbyists.length > 0 ? [{ label: 'FL Lobbyist Registry →', href: 'https://www.leg.state.fl.us/Lobbyist/index.cfm?Tab=lobbyistsearch' }] : []),
        ].map(({ label, href }) => (
          <a key={label} href={href} target="_blank" rel="noopener noreferrer"
            style={{
              padding: '0.35rem 0.75rem', border: '1px solid var(--border)',
              color: 'var(--text-dim)', fontSize: '0.72rem', borderRadius: '3px',
              textDecoration: 'none', fontFamily: 'var(--font-mono)',
            }}>
            {label}
          </a>
        ))}
      </div>

      <DataTrustBlock
        source="Florida Division of Elections"
        sourceUrl="https://dos.elections.myflorida.com/campaign-finance/"
        direct={['amount', 'contribution_date', 'contributor_address', 'occupation']}
        normalized={['contributor_name', 'slug']}
        inferred={['committee_links', 'candidate_links', 'lobbyist_principal_match']}
        classified={['entity_type', 'industry']}
        caveats={[
          'Name deduplication is exact-match only — contributions from the same person filed under different spellings are not merged.',
          'is_corporate flag is a keyword heuristic, not a verified legal classification.',
          lobbyists.length > 0
            ? 'Lobbyist principal link is inferred by name similarity — not confirmed by the Lobbyist Registration Office.'
            : null,
        ].filter(Boolean)}
      />
    </div>
  );

  const tabs = [
    { id: 'overview',     label: 'Overview',     content: overviewContent },
    { id: 'committees',   label: 'Committees',   content: committeesContent },
    { id: 'candidates',   label: 'Candidates',   content: candidatesContent },
    { id: 'transactions', label: 'Transactions', content: transactionsContent },
    { id: 'lobbying',     label: 'Lobbying',     content: lobbyingContent },
    { id: 'sources',      label: 'Sources',      content: sourcesContent },
  ];

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>
      <BackLinks links={[{ href: '/', label: 'home' }, { href: '/donors', label: 'donors' }]} />

      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '0.65rem', padding: '0.15rem 0.5rem',
            border: `1px solid ${typeColor}`, color: typeColor,
            borderRadius: '2px', fontFamily: 'var(--font-mono)', fontWeight: 'bold',
          }}>
            {typeLabel}
          </span>
          {lobbyists.length > 0 && (
            <span style={{
              fontSize: '0.65rem', padding: '0.15rem 0.5rem',
              border: '1px solid var(--blue)', color: 'var(--blue)',
              borderRadius: '2px', fontFamily: 'var(--font-mono)', fontWeight: 'bold',
            }}>
              LOBBYIST PRINCIPAL
            </span>
          )}
          {data.industry && data.industry !== 'Not Employed' && data.industry !== 'Other' && (
            <a href={`/industry/${slugify(data.industry)}`} style={{
              fontSize: '0.65rem', padding: '0.15rem 0.5rem',
              border: '1px solid rgba(100,140,220,0.3)', color: 'var(--text-dim)',
              borderRadius: '2px', fontFamily: 'var(--font-mono)', textDecoration: 'none',
            }}>
              {data.industry}
            </a>
          )}
          {annotation && (
            <a href="/investigations" style={{
              fontSize: '0.65rem', padding: '0.15rem 0.5rem',
              border: '1px solid var(--orange)', color: 'var(--orange)',
              borderRadius: '2px', fontFamily: 'var(--font-mono)', fontWeight: 'bold',
              textDecoration: 'none',
            }}>
              INVESTIGATION
            </a>
          )}
        </div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.5rem, 4vw, 2.4rem)',
          fontWeight: 400, color: '#fff', marginBottom: '0.4rem', lineHeight: 1.1,
        }}>
          {data.name}
        </h1>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {location && <span>{location}</span>}
          {data.top_occupation && <span>{data.top_occupation}</span>}
          <span>{fmtCount(data.num_contributions)} contributions recorded</span>
        </div>
      </div>

      <TabbedProfile tabs={tabs} defaultTab="overview" />
    </main>
  );
}
