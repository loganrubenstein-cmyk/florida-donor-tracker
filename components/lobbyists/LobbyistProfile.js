// components/lobbyists/LobbyistProfile.js
import BackLinks from '@/components/BackLinks';
import SourceLink from '@/components/shared/SourceLink';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import EntityHeader from '@/components/shared/EntityHeader';
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
  const compHistory = data.compHistory || [];

  const location = [data.city, data.state].filter(Boolean).join(', ');

  const researchLinks = [
    {
      label: 'Find Donor Overlap →',
      href: '/compare',
      internal: true,
    },
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

      <EntityHeader
        name={data.name}
        typeBadge={{ label: 'LOBBYIST', color: 'var(--teal)' }}
        badges={[
          ...(data.total_donation_influence > 0 ? [{ label: 'DONATION MATCH', color: 'var(--orange)' }] : []),
        ]}
        meta={[data.firm, location, data.phone]}
      >
        <SourceLink type="lobbyist" id={data.lobbyist_id} />
      </EntityHeader>

      {/* Stats grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '1px', background: 'var(--border)', marginBottom: '2rem',
      }}>
        <StatBox label="Est. Compensation" value={data.totalComp > 0 ? fmt(data.totalComp) : '—'}
          sub={compHistory.length > 0 ? `${compHistory[0]?.year}–${compHistory[compHistory.length - 1]?.year}` : null}
          color="var(--blue)" />
        <StatBox label="Total Principals" value={(data.num_principals || 0).toLocaleString()} />
        <StatBox label="Active Registrations" value={(data.num_active || 0).toLocaleString()}
          color="var(--teal)" />
        <StatBox label="Inactive / Withdrawn" value={(inactivePrincipals.length).toLocaleString()}
          color="var(--text-dim)" />
      </div>

      {/* Compensation history */}
      {compHistory.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <SectionLabel>Annual Compensation History ({compHistory[0]?.year}–{compHistory[compHistory.length - 1]?.year})</SectionLabel>
          <p style={{ fontSize: '0.7rem', color: 'rgba(90,106,136,0.7)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
            Estimated compensation from quarterly reports filed with the{' '}
            <a href="https://www.floridalobbyist.gov" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>
              FL Lobbyist Registration Office
            </a>.
            Amounts below $50K use band midpoints; $50K+ are exact reported figures.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Year', 'Firm', 'Clients', 'Est. Comp'].map((h, j) => (
                    <th key={h} style={{
                      padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                      textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                      textAlign: j >= 2 ? 'right' : 'left',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...compHistory].reverse().map((c, i) => (
                  <tr key={`${c.year}-${c.firm_name}`} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                    <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                      {c.year}
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text)', fontSize: '0.72rem' }}>
                      {c.firm_name}
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                      {c.num_principals || '—'}
                    </td>
                    <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: 'var(--blue)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {fmt(parseFloat(c.total_comp) || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                      <a href={`/principal/${p.principal_slug || slugify(p.name)}`}
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
                    <td style={{ padding: '0.4rem 0.6rem', maxWidth: '320px', wordBreak: 'break-word' }}>
                      {p.principal_slug
                        ? <a href={`/principal/${p.principal_slug}`} style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>{p.name}</a>
                        : <span style={{ color: 'var(--text)' }}>{p.name}</span>
                      }
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
          {researchLinks.map(({ label, href, internal }) => (
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
      </div>

      <DataTrustBlock
        source="Florida Lobbyist Registration Office — Registration & Compensation Reports"
        sourceUrl="https://www.floridalobbyist.gov"
        lastUpdated="April 2026"
        direct={['name', 'firm', 'phone', 'registration status', 'quarterly compensation reports (2007–present)']}
        normalized={['compensation totals (midpoints below $50K; exact amounts above $50K)']}
        inferred={['donation influence (matched by name to contribution records — not confirmed by election authorities)']}
        caveats={[
          'Compensation below $50,000 is reported in ranges — we use midpoints for aggregation.',
          'Amounts of $50,000+ are exact figures reported by the principal.',
          'Donation matches are approximate — same name does not guarantee same person.',
        ]}
      />
    </main>
  );
}
