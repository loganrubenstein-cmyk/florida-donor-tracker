// components/principals/PrincipalProfile.js
import BackLinks from '@/components/BackLinks';
import { slugify } from '@/lib/slugify';

function fmt(n) {
  if (!n || n === 0) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
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

export default function PrincipalProfile({ data }) {
  const lobbyists = data.lobbyists || [];
  const activeLobbyists   = lobbyists.filter(l => l.is_active);
  const inactiveLobbyists = lobbyists.filter(l => !l.is_active);
  const donationMatches   = data.donation_matches || [];

  const location = [data.city, data.state].filter(Boolean).join(', ');

  const researchLinks = [
    {
      label: 'FL Lobbyist Registry →',
      href: `https://www.leg.state.fl.us/Lobbyist/index.cfm?Tab=principalsearch`,
    },
    {
      label: 'Google →',
      href: `https://www.google.com/search?q=${encodeURIComponent((data.name || '') + ' Florida lobbying')}`,
    },
  ];

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      <BackLinks links={[
        { href: '/', label: 'home' },
        { href: '/principals', label: 'principals' },
      ]} />

      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '0.65rem', padding: '0.15rem 0.5rem',
            border: '1px solid var(--teal)', color: 'var(--teal)',
            borderRadius: '2px', fontFamily: 'var(--font-mono)', fontWeight: 'bold',
          }}>
            PRINCIPAL
          </span>
          {data.donation_total > 0 && (
            <span style={{
              fontSize: '0.65rem', padding: '0.15rem 0.5rem',
              border: '1px solid var(--orange)', color: 'var(--orange)',
              borderRadius: '2px', fontFamily: 'var(--font-mono)',
            }}>
              DONATION MATCH
            </span>
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
          {data.naics && <span>NAICS {data.naics}</span>}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '1px', background: 'var(--border)', marginBottom: '2rem',
      }}>
        <StatBox label="Total Lobbyists" value={(data.total_lobbyists || 0).toLocaleString()} />
        <StatBox label="Active Lobbyists" value={(data.num_active || 0).toLocaleString()}
          color="var(--teal)" />
        <StatBox label="Donation Match"
          value={data.donation_total > 0 ? fmt(data.donation_total) : '—'}
          sub={data.num_contributions > 0 ? `${data.num_contributions.toLocaleString()} contributions` : null}
          color={data.donation_total > 0 ? 'var(--orange)' : 'var(--text-dim)'} />
        <StatBox label="Past Lobbyists" value={(inactiveLobbyists.length).toLocaleString()}
          color="var(--text-dim)" />
      </div>

      {/* Active lobbyists */}
      {activeLobbyists.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <SectionLabel>Active Lobbyists ({activeLobbyists.length})</SectionLabel>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['#', 'Lobbyist', 'Firm', 'Branch', 'Since'].map((h, j) => (
                    <th key={h} style={{
                      padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                      textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                      textAlign: j === 0 || j === 3 ? 'center' : 'left',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeLobbyists.map((l, i) => (
                  <tr key={`${l.lobbyist_name}-${l.branch}`} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                    <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>
                      {i + 1}
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', maxWidth: '220px', wordBreak: 'break-word' }}>
                      <a href={`/lobbyist/${slugify(l.lobbyist_name)}`}
                        style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                        {l.lobbyist_name}
                      </a>
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.68rem', maxWidth: '180px', wordBreak: 'break-word' }}>
                      {l.firm || '—'}
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>
                      <span style={{
                        fontSize: '0.58rem', padding: '0.05rem 0.3rem',
                        border: '1px solid var(--text-dim)', color: 'var(--text-dim)',
                        borderRadius: '2px',
                      }}>
                        {l.branch === 'legislative' ? 'leg.' : 'exec.'}
                      </span>
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                      {l.since || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inactive lobbyists */}
      {inactiveLobbyists.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <SectionLabel>Past / Withdrawn Lobbyists ({inactiveLobbyists.length})</SectionLabel>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['#', 'Lobbyist', 'Firm', 'Branch', 'Since'].map((h, j) => (
                    <th key={h} style={{
                      padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                      textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                      textAlign: j === 0 || j === 3 ? 'center' : 'left',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inactiveLobbyists.map((l, i) => (
                  <tr key={`${l.lobbyist_name}-${l.branch}-${l.since}`} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)', opacity: 0.65 }}>
                    <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>
                      {i + 1}
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', maxWidth: '220px', wordBreak: 'break-word', color: 'var(--text)' }}>
                      {l.lobbyist_name}
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.68rem', maxWidth: '180px', wordBreak: 'break-word' }}>
                      {l.firm || '—'}
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>
                      <span style={{
                        fontSize: '0.58rem', padding: '0.05rem 0.3rem',
                        border: '1px solid rgba(90,106,136,0.4)', color: 'var(--text-dim)',
                        borderRadius: '2px',
                      }}>
                        {l.branch === 'legislative' ? 'leg.' : 'exec.'}
                      </span>
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                      {l.since || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Donation matches */}
      {donationMatches.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <SectionLabel>Matched Donor Names ({donationMatches.length})</SectionLabel>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
            These donor names in FL campaign finance records closely match this principal.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['#', 'Contributor Name', 'Match Score', 'Total Donated', 'Contributions'].map((h, j) => (
                    <th key={h} style={{
                      padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                      textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                      textAlign: j === 0 ? 'center' : j >= 2 ? 'right' : 'left',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {donationMatches.map((m, i) => (
                  <tr key={m.contributor_name} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                    <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>
                      {i + 1}
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', maxWidth: '280px', wordBreak: 'break-word' }}>
                      <a href={`/donor/${slugify(m.contributor_name)}`}
                        style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                        {m.contributor_name}
                      </a>
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                      {m.match_score}
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: m.total_donated > 0 ? 'var(--orange)' : 'var(--text-dim)', fontWeight: m.total_donated > 0 ? 700 : 400, whiteSpace: 'nowrap' }}>
                      {fmt(m.total_donated)}
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                      {(m.num_contributions || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Research links */}
      <div style={{ marginBottom: '2rem' }}>
        <SectionLabel>Research Links</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {researchLinks.map(({ label, href }) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--teal)', fontSize: '0.78rem', textDecoration: 'none' }}>
              {label}
            </a>
          ))}
        </div>
      </div>

      {/* Attribution */}
      <div style={{
        fontSize: '0.62rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
        borderTop: '1px solid var(--border)', paddingTop: '1rem',
      }}>
        Data: Florida Legislature Lobbyist Registration · Not affiliated with the State of Florida. All data from public records.
      </div>
    </main>
  );
}
