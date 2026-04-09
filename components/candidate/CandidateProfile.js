// components/candidate/CandidateProfile.js
import dynamic from 'next/dynamic';
import BackLinks from '@/components/BackLinks';
import { slugify } from '@/lib/slugify';

const QuarterlyChart    = dynamic(() => import('./QuarterlyChart'), { ssr: false });
const IndustryBreakdown = dynamic(() => import('./IndustryBreakdown'), { ssr: false });

const PARTY_COLOR = { REP: 'var(--republican)', DEM: 'var(--democrat)' };
const TYPE_COLOR  = { corporate: '#94a3b8', individual: 'var(--blue)' };

const LINK_TYPE_LABEL = {
  chair:        'Chair',
  treasurer:    'Treasurer',
  solicitation: 'Solicitation',
};

function fmt(n) {
  if (n == null || n === 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtFull(n) {
  if (n == null) return '—';
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

export default function CandidateProfile({ data }) {
  const hm     = data.hard_money || {};
  const donors = hm.top_donors  || [];
  const pcs    = data.linked_pcs || [];
  const party  = data.party_code;
  const partyColor = PARTY_COLOR[party] || null;

  const officeLabel = [data.office_desc, data.district ? `District ${data.district}` : null]
    .filter(Boolean).join(' · ');

  const researchLinks = [
    {
      label: 'FL DOE Candidate Page →',
      href: `https://dos.elections.myflorida.com/candidate/CandidateDetail.asp?account=${data.acct_num}`,
    },
    {
      label: 'Campaign Finance Activity →',
      href: `https://dos.elections.myflorida.com/cgi-bin/TreSel.exe?account=${data.acct_num}`,
    },
    {
      label: 'Google News →',
      href: `https://news.google.com/search?q=${encodeURIComponent((data.candidate_name || '') + ' Florida')}`,
    },
    {
      label: 'OpenSecrets →',
      href: `https://www.opensecrets.org/search?q=${encodeURIComponent(data.candidate_name || '')}&type=politicians`,
    },
  ];

  return (
    <main className="m-padx" style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      {/* Back links */}
      <BackLinks links={[{ href: '/', label: 'home' }, { href: '/candidates', label: 'candidates' }]} />

      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.6rem' }}>
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
      </div>

      {/* Combined stats grid */}
      <div className="rg-3" style={{
        gap: '1px', background: 'var(--border)',
        border: '1px solid var(--border)', borderRadius: '3px',
        marginBottom: '2rem', overflow: 'hidden',
      }}>
        {[
          { label: 'Hard Money (Direct)', value: fmt(hm.total),             sub: `${(hm.num_contributions || 0).toLocaleString()} contributions` },
          { label: 'Soft Money (Linked PCs)', value: fmt(data.soft_money_total), sub: `${pcs.length} committee${pcs.length !== 1 ? 's' : ''} linked` },
          { label: 'Combined Total',       value: fmt(data.total_combined),  sub: 'hard + soft' },
        ].map(({ label, value, sub }) => (
          <div key={label} style={{ background: 'var(--bg)', padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>
              {label}
            </div>
            <div style={{ fontSize: '1rem', color: 'var(--orange)', fontWeight: 700 }}>
              {value}
            </div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '0.2rem' }}>
              {sub}
            </div>
          </div>
        ))}
      </div>

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
              { label: 'Individual',  value: fmt(hm.individual_total) },
              { label: 'Corporate',   value: fmt(hm.corporate_total)  },
              { label: 'Earliest',    value: fmtDate(hm.date_range?.earliest) },
              { label: 'Latest',      value: fmtDate(hm.date_range?.latest)   },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: 'var(--bg)', padding: '0.75rem 1rem' }}>
                <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>
                  {label}
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text)', fontWeight: 600 }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* Quarterly chart */}
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

      {/* Industry breakdown */}
      {hm.total > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <IndustryBreakdown acctNum={data.acct_num} total={hm.total} />
        </div>
      )}

      {/* Top donors */}
      {donors.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <SectionLabel>Top Donors (Hard Money)</SectionLabel>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['#', 'Donor', 'Occupation', 'Type', 'Total', 'Contributions'].map(h => (
                  <th key={h} style={{
                    padding: '0.4rem 0.6rem',
                    textAlign: h === '#' || h === 'Contributions' ? 'center' : 'left',
                    fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
                    letterSpacing: '0.08em', fontWeight: 400,
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {donors.map((donor, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>
                    {i + 1}
                  </td>
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
                    {fmt(donor.total_amount)}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center' }}>
                    {donor.num_contributions.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Linked PCs (soft money) */}
      {pcs.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <SectionLabel>Linked Political Committees (Soft Money)</SectionLabel>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Committee', 'Link Type', 'Total Raised', 'Contributions'].map(h => (
                  <th key={h} style={{
                    padding: '0.4rem 0.6rem',
                    textAlign: h === 'Contributions' ? 'center' : 'left',
                    fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
                    letterSpacing: '0.08em', fontWeight: 400,
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pcs.map((pc, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  <td style={{ padding: '0.45rem 0.6rem', wordBreak: 'break-word' }}>
                    <a href={`/committee/${pc.pc_acct}`} style={{
                      color: 'var(--teal)', textDecoration: 'none',
                    }}>
                      {pc.pc_name || pc.pc_acct}
                    </a>
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.68rem' }}>
                    {LINK_TYPE_LABEL[pc.link_type] || pc.link_type}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--orange)', whiteSpace: 'nowrap' }}>
                    {fmt(pc.total_received)}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center' }}>
                    {pc.num_contributions > 0 ? pc.num_contributions.toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Source attribution */}
      <div style={{
        fontSize: '0.62rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
        borderTop: '1px solid var(--border)', paddingTop: '1rem', marginBottom: '1.25rem',
      }}>
        Data: Florida Division of Elections · Not affiliated with the State of Florida. All data from public records.
      </div>

      {/* Research links */}
      <div>
        <SectionLabel>Research</SectionLabel>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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
      </div>

    </main>
  );
}
