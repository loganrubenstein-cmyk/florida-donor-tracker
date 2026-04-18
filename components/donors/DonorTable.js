'use client'

import { useState } from 'react'
import { slugify } from '@/lib/slugify'

const PAGE_SIZE = 25

function formatDollars(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function normalizeDonor(d) {
  const total = d.total_combined ?? ((Number(d.total_hard) || 0) + (Number(d.total_soft) || 0))
  const type = d.is_corporate ? 'corporate' : 'individual'
  return { ...d, total_amount: total, type, num_contributions: d.num_contributions ?? 0 }
}

function TypeBadge({ type }) {
  const styles = {
    committee: { background: 'rgba(128,255,160,0.08)', color: 'var(--green)' },
    corporate:  { background: 'rgba(255,176,96,0.10)',  color: 'var(--orange)' },
    individual: { background: 'rgba(77,216,240,0.08)',  color: 'var(--teal)' },
  }
  const s = styles[type] || styles.individual
  return (
    <span style={{
      ...s,
      fontSize: '0.62rem',
      padding: '0.15rem 0.45rem',
      borderRadius: '2px',
      letterSpacing: '0.05em',
      whiteSpace: 'nowrap',
    }}>
      {type}
    </span>
  )
}

export default function DonorTable({ donors: rawDonors }) {
  const donors = (rawDonors || []).map(normalizeDonor)
  const [shown, setShown] = useState(PAGE_SIZE)

  const visible = donors.slice(0, shown)
  const hasMore = shown < donors.length
  const rankMap = new Map(donors.map((d, i) => [d.name, i + 1]))

  return (
    <div>
      {/* Table header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: '0.75rem',
      }}>
        <span style={{ fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
          Top donors — all time
        </span>
        <span style={{ fontSize: '0.58rem', color: 'rgba(90,106,136,0.6)' }}>
          showing {Math.min(shown, donors.length)} of {donors.length}
        </span>
      </div>

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(100,140,220,0.12)' }}>
            {['#', 'Name', 'Type', 'Total given', 'Contributions'].map((h, i) => (
              <th key={h} style={{
                fontSize: '0.55rem',
                letterSpacing: '0.12em',
                color: 'rgba(90,106,136,0.6)',
                textTransform: 'uppercase',
                textAlign: i >= 3 ? 'right' : 'left',
                padding: '0 0.75rem 0.5rem',
                fontWeight: 400,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((donor) => (
            <tr key={donor.name} style={{ borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
              <td style={{ padding: '0.55rem 0.75rem', color: 'rgba(90,106,136,0.5)', width: '2.5rem' }}>
                {rankMap.get(donor.name)}
              </td>
              <td style={{ padding: '0.55rem 0.75rem', color: 'var(--text)' }}>
                <a href={`/donor/${donor.slug || slugify(donor.name)}`}
                  style={{ color: 'var(--orange)', textDecoration: 'none' }}
                  onMouseEnter={e => e.target.style.color = 'var(--teal)'}
                  onMouseLeave={e => e.target.style.color = 'var(--text)'}>
                  {donor.name}
                </a>
              </td>
              <td style={{ padding: '0.55rem 0.75rem' }}>
                <TypeBadge type={donor.type} />
              </td>
              <td style={{ padding: '0.55rem 0.75rem', textAlign: 'right', color: 'var(--orange)', fontWeight: 700 }}>
                {formatDollars(donor.total_amount)}
              </td>
              <td style={{ padding: '0.55rem 0.75rem', textAlign: 'right', color: 'var(--text-dim)' }}>
                {(Number(donor.num_contributions) || 0).toLocaleString()}
              </td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr>
              <td colSpan={5} style={{ padding: '1.5rem 0.75rem', color: 'var(--text-dim)', fontSize: '0.65rem' }}>
                No donors to show.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Load more */}
      {hasMore && (
        <div style={{ marginTop: '1.2rem', borderTop: '1px solid rgba(100,140,220,0.08)', paddingTop: '1.2rem', textAlign: 'center' }}>
          <button
            onClick={() => setShown(s => s + PAGE_SIZE)}
            style={{
              border: '1px solid rgba(100,140,220,0.2)',
              background: 'transparent',
              color: 'var(--text-dim)',
              padding: '0.45rem 1.4rem',
              fontSize: '0.6rem',
              borderRadius: '3px',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Load {Math.min(PAGE_SIZE, donors.length - shown)} more →
          </button>
        </div>
      )}
    </div>
  )
}
