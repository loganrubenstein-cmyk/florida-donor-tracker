// components/industries/IndustryProfile.js
// Server component
import BackLinks from '@/components/BackLinks';

function fmt(n) {
  if (n == null) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtFull(n) {
  if (n == null) return '—';
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

const INDUSTRY_COLORS = {
  'Legal':                       '#4dd8f0',
  'Real Estate':                 '#f0a04d',
  'Healthcare':                  '#7dd87d',
  'Finance & Insurance':         '#a04df0',
  'Political / Lobbying':        '#f04d4d',
  'Agriculture':                 '#d8c84d',
  'Construction':                '#d8884d',
  'Education':                   '#4d88f0',
  'Technology / Engineering':    '#4df0d8',
  'Retail & Hospitality':        '#d84d88',
  'Business & Consulting':       '#8888cc',
  'Government & Public Service': '#88cc88',
  'Retired':                     '#aaaaaa',
  'Not Employed':                '#666688',
  'Other':                       '#444466',
};

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

export default function IndustryProfile({ data, totalAmount }) {
  const color = INDUSTRY_COLORS[data.industry] || '#444466';
  const candidates = data.top_candidates || [];

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      <BackLinks links={[{ href: '/', label: 'home' }, { href: '/industries', label: 'industries' }]} />

      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{
            fontSize: '0.65rem', padding: '0.15rem 0.5rem',
            border: `1px solid ${color}`, color,
            borderRadius: '2px', fontFamily: 'var(--font-mono)', fontWeight: 'bold',
          }}>
            INDUSTRY
          </span>
        </div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.5rem, 4vw, 2.4rem)',
          fontWeight: 400, color: '#fff', marginBottom: '0.4rem', lineHeight: 1.1,
        }}>
          {data.industry}
        </h1>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
          Hard money contributions to Florida candidates · Florida Division of Elections
        </div>
      </div>

      {/* Stats grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '1px', background: 'var(--border)', marginBottom: '2rem',
      }}>
        <StatBox label="Total Hard Money" value={fmt(data.total)} color={color} />
        <StatBox label="% of All Hard Money"
          value={`${data.pct.toFixed(1)}%`}
          sub={totalAmount ? `of ${fmt(totalAmount)} total` : null}
          color="var(--teal)" />
        <StatBox label="Contributions" value={fmtCount(data.count)} color="var(--blue)" />
        <StatBox label="Candidates Funded" value={(candidates.length).toLocaleString()}
          sub="in top recipients shown" color="var(--text-dim)" />
      </div>

      {/* Top candidates */}
      {candidates.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{
            fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.1em', marginBottom: '0.75rem',
          }}>
            Top Recipients — {data.industry} Money
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['#', 'Candidate', 'Received'].map((h, j) => (
                    <th key={h} style={{
                      padding: '0.35rem 0.6rem', fontSize: '0.6rem', color: 'var(--text-dim)',
                      textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 400,
                      textAlign: j === 0 ? 'center' : j === 2 ? 'right' : 'left',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {candidates.map((c, i) => {
                  const pct = data.total > 0 ? (c.total / data.total) * 100 : 0;
                  return (
                    <tr key={c.acct_num} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                      <td style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', textAlign: 'center', width: '2rem' }}>
                        {i + 1}
                      </td>
                      <td style={{ padding: '0.4rem 0.6rem' }}>
                        <a href={`/candidate/${c.acct_num}`}
                          style={{ color: 'var(--teal)', textDecoration: 'none' }}>
                          {c.name || `#${c.acct_num}`}
                        </a>
                      </td>
                      <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem' }}>
                          <div style={{
                            width: `${Math.min(Math.round(pct * 2), 80)}px`, height: '6px',
                            background: color, borderRadius: '1px', opacity: 0.7,
                          }} />
                          <span style={{ color: 'var(--orange)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                            {fmtFull(c.total)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Attribution */}
      <div style={{
        fontSize: '0.62rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
        borderTop: '1px solid var(--border)', paddingTop: '1rem',
      }}>
        Data: Florida Division of Elections · Industry classification based on contributor occupation field ·
        Hard money (direct candidate contributions) only · Not affiliated with the State of Florida. All data from public records.
      </div>
    </main>
  );
}
