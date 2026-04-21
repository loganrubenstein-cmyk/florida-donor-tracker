'use client'

import Link from 'next/link'

const RECENT_FEED = [
  { donor: 'Florida Power & Light',       amt: 50000,  to: 'Friends of Ron DeSantis',    donorHref: '/donor/florida-power-light-company', toHref: '/committees?q=Friends+of+Ron+DeSantis', sector: 'utility',   party: 'R', filed: '2026-03-31' },
  { donor: 'Disney Worldwide Services',   amt: 25000,  to: 'Florida Democratic Party',   donorHref: '/donor/disney-worldwide-services',   toHref: '/committees?q=Florida+Democratic+Party', sector: 'media',     party: 'D', filed: '2026-03-31' },
  { donor: 'Trulieve Cannabis',           amt: 75000,  to: 'Smart & Safe Florida',       donorHref: '/donor/trulieve-inc',                toHref: '/committees?q=Smart+Safe+Florida',      sector: 'cannabis',  party: 'X', filed: '2026-03-28' },
  { donor: 'US Sugar Corp',               amt: 100000, to: 'Seminole Heritage PAC',      donorHref: '/donor/us-sugar-corporation',         toHref: '/committees?q=Seminole+Heritage',        sector: 'agri',      party: 'R', filed: '2026-03-24' },
  { donor: 'Publix Super Markets',        amt: 15000,  to: 'Rep. Byron Donalds',         donorHref: '/donor/publix-super-markets-inc',     toHref: '/politician/byron-donalds',              sector: 'retail',    party: 'R', filed: '2026-03-19' },
  { donor: 'Blue Cross Blue Shield FL',   amt: 40000,  to: 'Floridians for Health PAC',  donorHref: '/donor/blue-cross-blue-shield-fl',   toHref: '/committees?q=Floridians+Health',        sector: 'health',    party: 'X', filed: '2026-03-14' },
  { donor: 'Carnival Corporation',        amt: 20000,  to: 'David Jolly for Governor',   donorHref: '/donor/carnival-corporation',         toHref: '/politician/david-jolly',                sector: 'tourism',   party: 'D', filed: '2026-03-08' },
  { donor: 'NextEra Energy',              amt: 35000,  to: 'Committee for Progress',     donorHref: '/donor/nextera-energy-capital-holdings-inc', toHref: '/committees?q=Committee+for+Progress', sector: 'utility', party: 'X', filed: '2026-02-26' },
  { donor: 'GEO Group',                   amt: 12500,  to: 'Corrections Reform PAC',     donorHref: '/donor/geo-group-inc',               toHref: '/committees?q=Corrections+Reform',       sector: 'prison',    party: 'R', filed: '2026-02-11' },
  { donor: 'Associated Industries of FL', amt: 60000,  to: 'Florida Chamber PAC',        donorHref: '/donor/associated-industries-florida', toHref: '/committees?q=Florida+Chamber',         sector: 'business',  party: 'R', filed: '2026-01-29' },
]

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
function filedLabel(iso) {
  const d = new Date(iso + 'T00:00:00')
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

function partyColor(p) {
  if (p === 'R') return 'var(--republican)'
  if (p === 'D') return 'var(--democrat)'
  return 'var(--teal)'
}

function fmtMoney(n) {
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
  return '$' + n.toLocaleString()
}

function Row({ r, isFirst }) {
  const pc = partyColor(r.party)
  const baseStyle = isFirst ? 'rgba(255,176,96,0.04)' : 'transparent'
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '72px 1fr 100px 1.2fr 76px',
      gap: '1rem',
      padding: '0.75rem 1.1rem',
      alignItems: 'center',
      borderBottom: '1px solid rgba(100,140,220,0.08)',
      background: baseStyle,
      transition: 'background 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(77,216,240,0.04)'}
      onMouseLeave={e => e.currentTarget.style.background = baseStyle}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: isFirst ? 'var(--orange)' : 'var(--text-dim)', letterSpacing: '0.08em' }}>
        {filedLabel(r.filed)}
      </span>
      <Link href={r.donorHref} style={{ fontFamily: 'var(--font-serif)', fontSize: '0.95rem', color: 'var(--orange)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {r.donor}
      </Link>
      <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.05rem', color: 'var(--orange)', textAlign: 'right', letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>
        {fmtMoney(r.amt)}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
        <span style={{ width: '3px', height: '14px', background: pc, flexShrink: 0, borderRadius: '1px' }} />
        <Link href={r.toHref} style={{ color: 'var(--teal)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.to}
        </Link>
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-dim)', letterSpacing: '0.1em', textAlign: 'right', textTransform: 'uppercase' }}>
        {r.sector}
      </span>
    </div>
  )
}

export default function RecentContributions() {
  return (
    <section style={{ maxWidth: '1140px', margin: '0 auto', padding: '0.75rem 2.5rem 2rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--orange)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            ◤ Q1 2026 FILINGS
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', color: 'var(--text)', letterSpacing: '-0.015em', lineHeight: 1.1 }}>
            Who is funding <span style={{ color: 'var(--orange)', fontStyle: 'italic' }}>Florida&apos;s government</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.67rem', color: 'var(--text-dim)', marginTop: '0.4rem', letterSpacing: '0.04em' }}>
            Most recent filings from the Q1 2026 drop · Florida campaign finance is reported quarterly
          </div>
        </div>
        <Link href="/contributions" style={{
          border: '1px solid var(--border)',
          color: 'var(--text-dim)',
          padding: '0.5rem 0.9rem',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.65rem',
          letterSpacing: '0.14em',
          textDecoration: 'none',
          borderRadius: '2px',
          whiteSpace: 'nowrap',
        }}>
          ALL CONTRIBUTIONS →
        </Link>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '72px 1fr 100px 1.2fr 76px',
          gap: '1rem',
          padding: '0.6rem 1.1rem',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(255,255,255,0.02)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.58rem',
          color: 'var(--text-dim)',
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}>
          <span>FILED</span>
          <span>DONOR</span>
          <span style={{ textAlign: 'right' }}>AMOUNT</span>
          <span>RECIPIENT</span>
          <span style={{ textAlign: 'right' }}>SECTOR</span>
        </div>

        {RECENT_FEED.map((r, i) => (
          <Row key={`${r.donor}-${i}`} r={r} isFirst={i === 0} />
        ))}
      </div>

      <div style={{ marginTop: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-dim)', letterSpacing: '0.1em', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span>SOURCE: FL DIVISION OF ELECTIONS · Q1 2026 DROP · NEXT DROP: JUL 10</span>
        <Link href="/contributions" style={{ color: 'var(--teal)', textDecoration: 'none' }}>SEE ALL 22M TRANSACTIONS →</Link>
      </div>
    </section>
  )
}
