// components/committee/CommitteeProfile.js

import { getPartyFromName } from '@/lib/partyUtils';

function fmt(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDate(s) {
  if (!s || s === 'None' || s === 'null') return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

const TYPE_COLOR = { committee: 'var(--teal)', corporate: '#94a3b8', individual: 'var(--blue)' };

export default function CommitteeProfile({ data }) {
  const party = getPartyFromName(data.committee_name, data.acct_num);
  const partyColor = party === 'R' ? 'var(--republican)' : party === 'D' ? 'var(--democrat)' : null;

  const researchLinks = [
    {
      label: 'FL Elections Records →',
      href: 'https://dos.fl.gov/elections/campaign-finance/reports-data/',
    },
    {
      label: 'Google News →',
      href: `https://news.google.com/search?q=${encodeURIComponent(data.committee_name + ' Florida politics')}`,
    },
    {
      label: 'OpenSecrets →',
      href: `https://www.opensecrets.org/search?q=${encodeURIComponent(data.committee_name)}&type=donors`,
    },
  ];

  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      {/* Back links */}
      <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '1.5rem' }}>
        <a href="/" style={{
          fontSize: '0.68rem', color: 'var(--text-dim)', textDecoration: 'none',
          fontFamily: 'var(--font-mono)',
        }}>
          ← home
        </a>
        <a href="/network" style={{
          fontSize: '0.68rem', color: 'var(--text-dim)', textDecoration: 'none',
          fontFamily: 'var(--font-mono)',
        }}>
          ← network
        </a>
      </div>

      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.6rem' }}>
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
      </div>

      {/* Stats grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '1px', background: 'var(--border)',
        border: '1px solid var(--border)', borderRadius: '3px',
        marginBottom: '2rem', overflow: 'hidden',
      }}>
        {[
          { label: 'Total Received',   value: fmt(data.total_received)                },
          { label: 'Contributions',    value: data.num_contributions.toLocaleString() },
          { label: 'Earliest',         value: fmtDate(data.date_range?.earliest)      },
          { label: 'Latest',           value: fmtDate(data.date_range?.latest)        },
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

      {/* Top donors table */}
      {data.top_donors.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{
            fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.1em', marginBottom: '0.75rem',
          }}>
            Top Donors
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
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text)', wordBreak: 'break-word' }}>
                    {donor.name}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: TYPE_COLOR[donor.type] || 'var(--text-dim)', fontSize: '0.68rem' }}>
                    {donor.type}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--orange)', whiteSpace: 'nowrap' }}>
                    {fmt(donor.total_amount)}
                  </td>
                  <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-dim)', textAlign: 'right' }}>
                    {donor.num_contributions.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Research links */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.25rem', marginBottom: '2rem' }}>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
          Research
        </div>
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

      {/* Disclaimer */}
      <div style={{
        borderTop: '1px solid var(--border)', paddingTop: '1rem',
        fontSize: '0.55rem', color: 'rgba(90,106,136,0.5)',
        display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem',
      }}>
        <span>Data: Florida Division of Elections · Not affiliated with the State of Florida · All data from public records.</span>
      </div>
    </main>
  );
}
