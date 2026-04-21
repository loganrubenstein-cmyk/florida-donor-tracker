'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
function filedLabel(iso) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d)) return '—'
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

function fmtMoney(n) {
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
  return '$' + n.toLocaleString()
}

function Row({ r, isFirst }) {
  const base = isFirst ? 'rgba(255,176,96,0.04)' : 'transparent'
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '72px 1fr 100px 1.2fr',
        gap: '1rem',
        padding: '0.75rem 1.1rem',
        alignItems: 'center',
        borderBottom: '1px solid rgba(100,140,220,0.08)',
        background: base,
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(77,216,240,0.04)'}
      onMouseLeave={e => e.currentTarget.style.background = base}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: isFirst ? 'var(--orange)' : 'var(--text-dim)', letterSpacing: '0.08em' }}>
        {filedLabel(r.date)}
      </span>
      {r.donor_slug ? (
        <Link href={`/donor/${r.donor_slug}`} style={{ fontFamily: 'var(--font-serif)', fontSize: '0.95rem', color: 'var(--orange)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.donor_name}
        </Link>
      ) : (
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: '0.95rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.donor_name}
        </span>
      )}
      <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.05rem', color: 'var(--orange)', textAlign: 'right', letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>
        {fmtMoney(r.amount)}
      </span>
      {r.acct_num ? (
        <Link href={`/committee/${r.acct_num}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--teal)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.recipient_name || r.acct_num}
        </Link>
      ) : (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.recipient_name || '—'}
        </span>
      )}
    </div>
  )
}

function SkeletonRow() {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '72px 1fr 100px 1.2fr',
      gap: '1rem',
      padding: '0.75rem 1.1rem',
      borderBottom: '1px solid rgba(100,140,220,0.08)',
    }}>
      {[40, 160, 60, 140].map((w, i) => (
        <div key={i} style={{ height: '0.75rem', width: w, background: 'rgba(100,140,220,0.08)', borderRadius: '2px' }} />
      ))}
    </div>
  )
}

export default function RecentContributions() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/pulse?type=filings&limit=10')
      .then(r => r.json())
      .then(j => setItems(j.items || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

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
            Most recent large contributions · Florida campaign finance is reported quarterly
          </div>
        </div>
        <Link href="/pulse" style={{
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
          FULL FEED →
        </Link>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '72px 1fr 100px 1.2fr',
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
        </div>

        {loading
          ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
          : items.length === 0
            ? <div style={{ padding: '2rem 1.1rem', color: 'var(--text-dim)', fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>No recent filings found.</div>
            : items.map((r, i) => <Row key={i} r={r} isFirst={i === 0} />)
        }
      </div>

      <div style={{ marginTop: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-dim)', letterSpacing: '0.1em', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span>SOURCE: FL DIVISION OF ELECTIONS · CONTRIBUTIONS ≥ $25K · UPDATED QUARTERLY</span>
        <Link href="/explorer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>SEE ALL 22M TRANSACTIONS →</Link>
      </div>
    </section>
  )
}
