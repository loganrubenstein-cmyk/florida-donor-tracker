// components/committee/CommitteeProfile.js

import { getPartyFromName } from '@/lib/partyUtils';
import BackLinks from '@/components/BackLinks';
import { fmtArticleDate } from '@/lib/dateUtils';
import { slugify } from '@/lib/slugify';
import CommitteeConnections from './CommitteeConnections';
import TabbedProfile from '@/components/shared/TabbedProfile';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import NewsBlock from '@/components/shared/NewsBlock';
import SourceLink from '@/components/shared/SourceLink';
import dynamic from 'next/dynamic';
import { fmtMoneyCompact, fmtMoney } from '@/lib/fmt';

const TransactionExplorer = dynamic(() => import('@/components/explorer/TransactionExplorer'), { ssr: false });

function fmtDateLocal(s) {
  if (!s || s === 'None' || s === 'null') return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

const TYPE_COLOR = { committee: 'var(--teal)', corporate: '#94a3b8', individual: 'var(--blue)' };

function findCommitteeAnnotation(annotations, acct_num, committee_name) {
  if (annotations[`c_${acct_num}`]) return annotations[`c_${acct_num}`];
  const norm = s => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const normName = norm(committee_name);
  return Object.values(annotations).find(e => norm(e.canonical_name) === normName) || null;
}

export default function CommitteeProfile({ data, annotations = {}, linkedCandidates = [], expenditures = null }) {
  const annotation = findCommitteeAnnotation(annotations, data.acct_num, data.committee_name);
  const articles = annotation?.articles || [];
  const party = getPartyFromName(data.committee_name, data.acct_num);
  const partyColor = party === 'R' ? 'var(--republican)' : party === 'D' ? 'var(--democrat)' : null;

  const researchLinks = [
    ...(data.website_url ? [{ label: 'Official Website →', href: data.website_url }] : []),
    { label: 'Committee Connections →', href: `/connections?committee=${data.acct_num}`, internal: true },
    { label: 'View in Network →', href: `/network/graph?acct=${data.acct_num}`, internal: true },
    { label: 'FL DOE Committee Page →', href: `https://dos.elections.myflorida.com/committees/ComDetail.asp?account=${data.acct_num}` },
    { label: 'Campaign Finance Activity →', href: `https://dos.elections.myflorida.com/cgi-bin/TreSel.exe?account=${data.acct_num}` },
    { label: 'Google News →', href: `https://news.google.com/search?q=${encodeURIComponent(data.committee_name + ' Florida politics')}` },
  ];

  // ── Tab content ─────────────────────────────────────────────────────────────

  const overviewContent = (
    <div>
      {/* Stats grid */}
      <div className="rg-4" style={{
        gap: '1px', background: 'var(--border)',
        border: '1px solid var(--border)', borderRadius: '3px',
        marginBottom: '2rem', overflow: 'hidden',
      }}>
        {[
          { label: 'Total Received',  value: fmtMoneyCompact(data.total_received) },
          { label: 'Contributions',   value: (data.num_contributions || 0).toLocaleString() },
          { label: 'Earliest',        value: fmtDateLocal(data.date_range?.earliest) },
          { label: 'Latest',          value: fmtDateLocal(data.date_range?.latest) },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'var(--bg)', padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>
              {label}
            </div>
            <div style={{ fontSize: '1rem', color: 'var(--orange)', fontWeight: 700 }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Committee meta + connection badges */}
      {(data.committee_meta || (data.shared_with && Object.values(data.shared_with).some(v => v > 0))) && (
        <div style={{ marginBottom: '1.5rem', padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: '3px', background: 'rgba(255,255,255,0.015)' }}>
          <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.6rem' }}>
            Registration Details
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.72rem' }}>
            {data.committee_meta?.treasurer_name && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text-dim)' }}>Treasurer:</span>
                <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{data.committee_meta.treasurer_name}</span>
                {data.shared_with?.treasurer > 0 && (
                  <a href={`/connections?committee=${data.acct_num}`} style={{
                    fontSize: '0.6rem', color: 'var(--teal)', textDecoration: 'none',
                    padding: '0.05rem 0.35rem', border: '1px solid rgba(77,216,240,0.3)',
                    borderRadius: '2px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
                  }}>
                    shared with {data.shared_with.treasurer} other{data.shared_with.treasurer !== 1 ? 's' : ''} →
                  </a>
                )}
              </div>
            )}
            {data.committee_meta?.chair_name && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text-dim)' }}>Chair:</span>
                <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{data.committee_meta.chair_name}</span>
                {data.shared_with?.chair > 0 && (
                  <a href={`/connections?committee=${data.acct_num}`} style={{
                    fontSize: '0.6rem', color: 'var(--teal)', textDecoration: 'none',
                    padding: '0.05rem 0.35rem', border: '1px solid rgba(77,216,240,0.3)',
                    borderRadius: '2px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
                  }}>
                    shared with {data.shared_with.chair} other{data.shared_with.chair !== 1 ? 's' : ''} →
                  </a>
                )}
              </div>
            )}
            {data.committee_meta?.address_line && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text-dim)' }}>Address:</span>
                <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>{data.committee_meta.address_line}</span>
                {data.shared_with?.address > 0 && (
                  <a href={`/connections?committee=${data.acct_num}`} style={{
                    fontSize: '0.6rem', color: 'var(--orange)', textDecoration: 'none',
                    padding: '0.05rem 0.35rem', border: '1px solid rgba(255,176,96,0.3)',
                    borderRadius: '2px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
                  }}>
                    {data.shared_with.address} committee{data.shared_with.address !== 1 ? 's' : ''} at this address →
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Solicitation info */}
      {data.solicitation_id && (
        <div style={{ marginBottom: '2rem', padding: '0.9rem 1.1rem', border: '1px solid var(--border)', borderRadius: '3px', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.6rem' }}>
            Public Solicitation Registration
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem 2rem', fontSize: '0.72rem' }}>
            {data.org_type && (
              <div>
                <span style={{ color: 'var(--text-dim)' }}>Type: </span>
                <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
                  {data.org_type.replace('Type: ', '')}
                </span>
              </div>
            )}
            {data.solicitation_file_date && (
              <div>
                <span style={{ color: 'var(--text-dim)' }}>Filed: </span>
                <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
                  {data.solicitation_file_date}
                </span>
              </div>
            )}
            <div>
              <span style={{ color: 'var(--text-dim)' }}>Status: </span>
              <span style={{ color: data.solicitation_active ? 'var(--teal)' : 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                {data.solicitation_active ? 'Active' : 'Withdrawn'}
              </span>
            </div>
            {data.solicitation_id && (
              <div>
                <span style={{ color: 'var(--text-dim)' }}>ID: </span>
                <a href="https://dos.fl.gov/elections/political-activities/registration/" target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--teal)', fontFamily: 'var(--font-mono)', textDecoration: 'none' }}>
                  #{data.solicitation_id}
                </a>
              </div>
            )}
          </div>
          {data.solicitors && data.solicitors.length > 0 && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
              Solicitor{data.solicitors.length > 1 ? 's' : ''}: {data.solicitors.join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const donorsContent = (
    <div>
      {data.top_donors.length > 0 ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Top Donors — {data.top_donors.length} shown
            </div>
            <a
              href={`/explorer?recipient_acct=${data.acct_num}&recipient_type=committee`}
              style={{ fontSize: '0.65rem', color: 'var(--teal)', textDecoration: 'none' }}
            >
              View all contributions →
            </a>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['#', 'Donor', 'Type', 'Total Given', 'Contributions'].map(h => (
                  <th key={h} style={{
                    padding: '0.4rem 0.6rem', textAlign: h === '#' ? 'center' : 'left',
                    fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
                    letterSpacing: '0.08em', fontWeight: 400,
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.top_donors.map((donor, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', wordBreak: 'break-word' }}>
                    <a href={`/donor/${slugify(donor.name)}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                      {donor.name}
                    </a>
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: TYPE_COLOR[donor.type] || 'var(--text-dim)', fontSize: '0.68rem' }}>
                    {donor.type}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--orange)', whiteSpace: 'nowrap' }}>
                    {fmtMoney(donor.total_amount)}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'right' }}>
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

  const candidatesContent = (
    <div>
      {linkedCandidates.length > 0 ? (
        <>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
            Linked Candidates ({linkedCandidates.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: 'var(--border)', border: '1px solid var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
            {linkedCandidates.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: 'var(--bg)' }}>
                <a href={`/candidate/${c.acct_num}`} style={{
                  color: 'var(--teal)', textDecoration: 'none', fontSize: '0.72rem', flex: 1,
                  minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {c.name || `Candidate #${c.acct_num}`}
                </a>
                {c.office && (
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {c.office}{c.year ? ` · ${c.year}` : ''}
                  </span>
                )}
                <span style={{
                  fontSize: '0.55rem', padding: '0.05rem 0.3rem',
                  background: 'rgba(77,216,240,0.08)', color: 'var(--teal)',
                  border: '1px solid rgba(77,216,240,0.2)', borderRadius: '2px',
                  fontFamily: 'var(--font-mono)', flexShrink: 0,
                }}>
                  {c.link_type}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>No linked candidates found.</p>
      )}
    </div>
  );

  const payeesContent = expenditures ? (
    <div>
      {/* Summary stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: '1px', background: 'var(--border)', border: '1px solid var(--border)',
        borderRadius: '3px', marginBottom: '1.5rem', overflow: 'hidden',
      }}>
        {[
          { label: 'Total Spent',    value: fmtMoneyCompact(expenditures.total_spent) },
          { label: 'Payments',       value: (expenditures.num_expenditures || 0).toLocaleString() },
          { label: 'Date Range',     value: expenditures.date_range?.start
              ? `${expenditures.date_range.start.slice(0,7)} – ${expenditures.date_range.end.slice(0,7)}`
              : '—' },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'var(--bg)', padding: '0.75rem 1rem' }}>
            <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>{label}</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--teal)', fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Top vendors table */}
      {expenditures.top_vendors?.length > 0 && (
        <div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
            Top Vendors — {expenditures.top_vendors.length} shown
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['#', 'Vendor', 'Payments', 'Total', '% of Spend'].map((h, j) => (
                  <th key={h} style={{
                    padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                    textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                    textAlign: j === 0 ? 'center' : j >= 2 ? 'right' : 'left',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {expenditures.top_vendors.map((v, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>{i + 1}</td>
                  <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text)', maxWidth: '280px', wordBreak: 'break-word' }}>
                    {v.vendor_name}
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                    {(v.num_payments || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--teal)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {fmtMoney(v.total_amount)}
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                    {v.pct != null ? `${v.pct.toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: '0.75rem', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
            <a href={`https://dos.elections.myflorida.com/cgi-bin/TreSel.exe?account=${data.acct_num}`}
              target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>
              Full expenditure records at FL DOE →
            </a>
          </div>
        </div>
      )}
    </div>
  ) : (
    <div style={{ padding: '1.5rem 0', color: 'var(--text-dim)', fontSize: '0.85rem', lineHeight: 1.6 }}>
      <div style={{ color: 'var(--text)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
        No expenditure data for this committee
      </div>
      This committee does not have expenditure records in the current dataset (1,673 committees have data).
      <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'rgba(90,106,136,0.7)' }}>
        View raw expenditure records at:{' '}
        <a href={`https://dos.elections.myflorida.com/cgi-bin/TreSel.exe?account=${data.acct_num}`}
          target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>
          FL DOE Campaign Finance →
        </a>
      </div>
    </div>
  );

  const transactionsContent = (
    <div>
      <TransactionExplorer
        initialRecipientAcct={data.acct_num}
        initialRecipientType="committee"
        prefilterLabel={`Contributions to ${data.committee_name}`}
      />
    </div>
  );

  const connectionsContent = (
    <div>
      <CommitteeConnections acctNum={data.acct_num} />
    </div>
  );

  const sourcesContent = (
    <div>
      {articles.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
            In the News
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {articles.map((article) => (
              <a key={article.url} href={article.url} target="_blank" rel="noopener noreferrer" style={{
                display: 'block', padding: '0.65rem 0.85rem',
                border: '1px solid var(--border)', borderRadius: '3px',
                textDecoration: 'none', background: 'rgba(255,255,255,0.02)',
              }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text)', lineHeight: 1.4, marginBottom: '0.25rem' }}>
                  {article.title}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  {article.outlet}{article.date ? ` · ${fmtArticleDate(article.date, { includeDay: true })}` : ''}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
        Research Links
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        {researchLinks.map(({ label, href, internal }) => (
          <a key={label} href={href}
            {...(!internal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            style={{
              padding: '0.35rem 0.75rem', border: '1px solid var(--border)',
              color: internal ? 'var(--teal)' : 'var(--text-dim)', fontSize: '0.72rem', borderRadius: '3px',
              textDecoration: 'none', fontFamily: 'var(--font-mono)',
            }}>
            {label}
          </a>
        ))}
      </div>

      <NewsBlock articles={data.news} />

      <DataTrustBlock
        source="Florida Division of Elections"
        sourceUrl={`https://dos.elections.myflorida.com/committees/ComDetail.asp?account=${data.acct_num}`}
        direct={['committee_name', 'acct_num', 'total_received', 'contribution_date', 'amount']}
        normalized={['donor_name_normalized']}
        inferred={['top_donor_links', 'candidate_links']}
        classified={['committee_party', 'committee_type']}
        caveats={[
          'Party classification is inferred from committee name keywords — not an official field.',
          'Top donors are matched by normalized name — the same donor may appear under multiple names.',
          'Expenditure (payee) data is still being collected — payee tab will populate automatically.',
        ]}
      />
    </div>
  );

  const tabs = [
    { id: 'overview',      label: 'Overview',      content: overviewContent },
    { id: 'donors',        label: 'Donors',        content: donorsContent },
    { id: 'candidates',    label: 'Candidates',    content: candidatesContent },
    { id: 'payees',        label: 'Payees',        content: payeesContent },
    { id: 'transactions',  label: 'Transactions',  content: transactionsContent },
    { id: 'connections',   label: 'Connections',   content: connectionsContent },
    { id: 'sources',       label: 'Sources',       content: sourcesContent },
  ];

  return (
    <main className="m-padx" style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      <BackLinks links={[{ href: '/', label: 'home' }, { href: '/network', label: 'network' }]} />

      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '0.65rem', padding: '0.15rem 0.5rem',
            border: '1px solid var(--teal)', color: 'var(--teal)',
            borderRadius: '3px', textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            committee
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
          {annotation && (
            <a href="/investigations" style={{
              fontSize: '0.65rem', padding: '0.15rem 0.5rem',
              border: '1px solid var(--orange)', color: 'var(--orange)',
              borderRadius: '3px', textTransform: 'uppercase', letterSpacing: '0.06em',
              fontWeight: 'bold', textDecoration: 'none',
            }}>
              Investigation
            </a>
          )}
        </div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.4rem, 3vw, 2rem)',
          fontWeight: 400, color: '#fff', lineHeight: 1.2, marginBottom: '0.4rem',
        }}>
          {data.committee_name}
        </h1>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
          Acct #{data.acct_num}
        </div>
        <SourceLink type="committee" id={data.acct_num} />
      </div>

      <TabbedProfile tabs={tabs} defaultTab="overview" />
    </main>
  );
}
