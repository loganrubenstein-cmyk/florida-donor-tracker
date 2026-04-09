// components/lobbyists/LobbyistProfile.js
import BackLinks from '@/components/BackLinks';
import { slugify } from '@/lib/slugify';

function fmt(n) {
  if (!n || n === 0) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDate(s) {
  if (!s || s === 'None' || s === 'nan') return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
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

export default function LobbyistProfile({ data }) {
  const principals = data.principals || [];
  const activePrincipals = principals.filter(p => p.is_active);
  const inactivePrincipals = principals.filter(p => !p.is_active);

  const location = [data.city, data.state].filter(Boolean).join(', ');

  const researchLinks = [
    {
      label: 'FL Lobbyist Registry →',
      href: `https://www.leg.state.fl.us/Lobbyist/index.cfm?Tab=lobbyistsearch`,
    },
    {
      label: 'Google →',
      href: `https://www.google.com/search?q=${encodeURIComponent((data.name || '') + ' Florida lobbyist')}`,
    },
  ];

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      <BackLinks links={[{ href: '/', label: 'home' }, { href: '/lobbyists', label: 'lobbyists' }]} />

      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '0.65rem', padding: '0.15rem 0.5rem',
            border: '1px solid var(--teal)', color: 'var(--teal)',
            borderRadius: '2px', fontFamily: 'var(--font-mono)', fontWeight: 'bold',
          }}>
            LOBBYIST
          </span>
          {data.total_donation_influence > 0 && (
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
          {data.firm && <span>{data.firm}</span>}
          {location && <span>{location}</span>}
          {data.phone && <span>{data.phone}</span>}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '1px', background: 'var(--border)', marginBottom: '2rem',
      }}>
        <StatBox label="Total Principals" value={(data.num_principals || 0).toLocaleString()} />
        <StatBox label="Active Registrations" value={(data.num_active || 0).toLocaleString()}
          color="var(--teal)" />
        <StatBox label="Donation Influence"
          value={data.total_donation_influence > 0
            ? fmt(data.total_donation_influence)
            : '—'}
          sub={data.total_donation_influence > 0 ? 'Matched principal donations' : null}
          color={data.total_donation_influence > 0 ? 'var(--orange)' : 'var(--text-dim)'} />
        <StatBox label="Inactive / Withdrawn" value={(inactivePrincipals.length).toLocaleString()}
          color="var(--text-dim)" />
      </div>

      {/* Active principals */}
      {activePrincipals.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <SectionLabel>Active Principals ({activePrincipals.length})</SectionLabel>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['#', 'Principal / Employer', 'Branch', 'Since'].map((h, j) => (
                    <th key={h} style={{
                      padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                      textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                      textAlign: j === 0 || j === 2 ? 'center' : 'left',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activePrincipals.map((p, i) => (
                  <tr key={`${p.name}-${p.branch}`} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                    <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>
                      {i + 1}
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', maxWidth: '360px', wordBreak: 'break-word' }}>
                      <a href={`/principal/${slugify(p.name)}`}
                        style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                        {p.name}
                      </a>
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>
                      <span style={{
                        fontSize: '0.58rem', padding: '0.05rem 0.3rem',
                        border: '1px solid var(--text-dim)', color: 'var(--text-dim)',
                        borderRadius: '2px',
                      }}>
                        {p.branch === 'legislative' ? 'leg.' : 'exec.'}
                      </span>
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                      {fmtDate(p.since) || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inactive principals */}
      {inactivePrincipals.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <SectionLabel>Past / Withdrawn Principals ({inactivePrincipals.length})</SectionLabel>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['#', 'Principal / Employer', 'Branch', 'Registered', 'Withdrawn'].map((h, j) => (
                    <th key={h} style={{
                      padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                      textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                      textAlign: j === 0 || j === 2 ? 'center' : 'left',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inactivePrincipals.map((p, i) => (
                  <tr key={`${p.name}-${p.branch}-${p.since}`} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)', opacity: 0.65 }}>
                    <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>
                      {i + 1}
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', maxWidth: '320px', wordBreak: 'break-word', color: 'var(--text)' }}>
                      {p.name}
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>
                      <span style={{
                        fontSize: '0.58rem', padding: '0.05rem 0.3rem',
                        border: '1px solid rgba(90,106,136,0.4)', color: 'var(--text-dim)',
                        borderRadius: '2px',
                      }}>
                        {p.branch === 'legislative' ? 'leg.' : 'exec.'}
                      </span>
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                      {fmtDate(p.since) || '—'}
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                      {fmtDate(p.until) || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Research links */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem', marginBottom: '2rem' }}>
        <SectionLabel>Research</SectionLabel>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {researchLinks.map(({ label, href }) => (
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
