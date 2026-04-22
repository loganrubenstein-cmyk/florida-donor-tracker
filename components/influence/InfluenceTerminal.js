'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fmtMoneyCompact, fmtCountCompact } from '@/lib/fmt'
import TrustRibbon from '@/components/shared/TrustRibbon'

const SORTS = [
  { value: 'total',  label: 'Total Influence' },
  { value: 'lobby',  label: 'Most Lobbying' },
  { value: 'donate', label: 'Most Donations' },
  { value: 'name',   label: 'Name A–Z' },
]

export default function InfluenceTerminal() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState('total')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ sort, page: '1' })
    if (debouncedQ) params.set('q', debouncedQ)
    fetch(`/api/influence?${params}`)
      .then(r => r.json())
      .then(json => {
        const data = json?.data || []
        setRows(data)
        setTotal(json?.total ?? 0)
        setSelected(data[0] || null)
      })
      .catch(() => { setRows([]); setSelected(null) })
      .finally(() => setLoading(false))
  }, [sort, debouncedQ])

  const max = rows[0]?.total_influence || 1

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2.5rem 2.5rem 3rem' }}>
      <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)', marginBottom: '1.5rem' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/tools" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Tools</Link>
        {' / '}
        <span>Influence Index</span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: '0.9rem' }}>
        ◤ INFLUENCE INDEX
      </div>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.9rem, 4.5vw, 3rem)', lineHeight: 1.05, letterSpacing: '-0.022em', color: 'var(--text)', fontWeight: 400, marginBottom: '1rem' }}>
        The ranked <em style={{ color: 'var(--orange)' }}>ledger</em> of who pays for Florida.
      </h1>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.75, maxWidth: '640px', marginBottom: '1.25rem' }}>
        Click any bar to read the file. Sorted by combined influence — campaign contributions plus lobbying compensation, 1996–2026.
      </p>

      <div style={{ marginBottom: '1.5rem' }}>
        <TrustRibbon source="FL Division of Elections · Dept. of State Lobbyist Registration" updated="Apr 18, 2026" confidence="normalized" />
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.25rem' }}>
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search organizations…"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            padding: '0.45rem 0.7rem',
            fontSize: '0.78rem',
            borderRadius: '3px',
            fontFamily: 'var(--font-mono)',
            outline: 'none',
            minWidth: 240,
          }}
        />
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {SORTS.map(s => {
            const on = sort === s.value
            return (
              <button key={s.value} onClick={() => setSort(s.value)} style={{
                background: on ? 'rgba(255,176,96,0.08)' : 'transparent',
                border: `1px solid ${on ? 'var(--orange)' : 'var(--border)'}`,
                color: on ? 'var(--orange)' : 'var(--text-dim)',
                padding: '0.35rem 0.8rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.64rem',
                letterSpacing: '0.12em',
                cursor: 'pointer',
                borderRadius: '2px',
                textTransform: 'uppercase',
              }}>{s.label}</button>
            )
          })}
        </div>
      </div>

      <div className="influence-terminal-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left: bar list */}
        <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '1.1rem 1.35rem', background: 'rgba(255,255,255,0.015)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-dim)', letterSpacing: '0.16em', marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>◤ INFLUENCE · CAMPAIGN + LOBBY</span>
            <span>CLICK TO INSPECT</span>
          </div>

          {loading && <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', padding: '2rem 0', textAlign: 'center' }}>Loading…</div>}
          {!loading && rows.length === 0 && (
            <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', padding: '2rem 0', textAlign: 'center' }}>No results.</div>
          )}

          {rows.map((r, i) => {
            const isSel = selected?.slug === r.slug
            const influence = r.total_influence || 0
            const pct = (influence / max) * 100
            const lobby = r.total_lobby_comp || 0
            const lobbyPct = influence > 0 ? lobby / influence : 0
            return (
              <div key={r.slug || r.name} onClick={() => setSelected(r)} style={{
                display: 'grid', gridTemplateColumns: '34px 1fr 140px 85px', gap: '0.7rem', alignItems: 'center',
                padding: '0.5rem 0', cursor: 'pointer',
                borderBottom: i < rows.length - 1 ? '1px solid rgba(100,140,220,0.08)' : 'none',
                opacity: isSel ? 1 : 0.88,
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: isSel ? 'var(--orange)' : 'var(--text-dim)' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: '0.82rem', color: isSel ? 'var(--orange)' : 'var(--text)', letterSpacing: '-0.005em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.name}
                </span>
                <div style={{ display: 'flex', height: 14, background: 'rgba(100,140,220,0.12)', borderRadius: 1, overflow: 'hidden', border: isSel ? '1px solid var(--orange)' : '1px solid transparent' }}>
                  <div style={{ width: `${pct * (1 - lobbyPct)}%`, background: 'var(--orange)', opacity: isSel ? 1 : 0.7, transition: 'opacity .2s' }} />
                  <div style={{ width: `${pct * lobbyPct}%`, background: 'var(--teal)', opacity: isSel ? 0.9 : 0.6, transition: 'opacity .2s' }} />
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: isSel ? 'var(--orange)' : 'var(--text-dim)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtMoneyCompact(influence)}
                </span>
              </div>
            )
          })}

          {!loading && rows.length > 0 && (
            <div style={{ marginTop: '0.9rem', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: '0.1em', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: 10, height: 8, background: 'var(--orange)' }} />CAMPAIGN $
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: 10, height: 8, background: 'var(--teal)', opacity: 0.75 }} />LOBBYING $
              </span>
              <span>SHOWING {rows.length} OF {fmtCountCompact(total)}</span>
            </div>
          )}
        </div>

        {/* Right: dossier */}
        {selected ? (
          <DossierPanel row={selected} rank={rows.findIndex(r => r.slug === selected.slug) + 1} />
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '1.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            Select an organization to inspect.
          </div>
        )}
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          .influence-terminal-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}

function DossierPanel({ row, rank }) {
  const campaign = row.donation_total || 0
  const lobby = row.total_lobby_comp || 0
  const influence = row.total_influence || 0
  const contribs = row.num_contributions || 0
  const years = row.active_years || ''

  return (
    <div style={{ position: 'sticky', top: '1.5rem', border: '1px solid rgba(255,176,96,0.35)', background: 'rgba(255,176,96,0.04)', borderRadius: '4px', padding: '1.35rem' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--orange)', letterSpacing: '0.22em', marginBottom: '0.9rem' }}>
        ◤ DOSSIER{rank > 0 ? ` · RANK #${rank}` : ''}
      </div>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.35rem', lineHeight: 1.15, color: 'var(--text)', letterSpacing: '-0.015em', marginBottom: '0.35rem' }}>
        {row.name}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: '0.12em', marginBottom: '1rem', textTransform: 'uppercase' }}>
        {row.industry || 'Unclassified'}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem', marginBottom: '1rem' }}>
        <Stat label="CAMPAIGN $"  val={fmtMoneyCompact(campaign)}   color="var(--orange)" />
        <Stat label="LOBBY $"     val={fmtMoneyCompact(lobby)}      color="var(--teal)" />
        <Stat label="# GIFTS"     val={fmtCountCompact(contribs)}   color="var(--text)" />
        <Stat label="INFLUENCE"   val={fmtMoneyCompact(influence)}  color="var(--orange)" />
      </div>

      {years && (
        <div style={{ paddingTop: '0.9rem', borderTop: '1px solid var(--border)', marginBottom: '0.9rem' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-dim)', letterSpacing: '0.16em', marginBottom: '0.3rem' }}>
            ACTIVE YEARS
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text)' }}>
            {years}
          </div>
        </div>
      )}

      {row.slug && (
        <div style={{ paddingTop: '0.9rem', borderTop: '1px solid var(--border)' }}>
          <Link href={`/donor/${row.slug}`} style={{
            display: 'inline-block',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            color: 'var(--orange)',
            border: '1px solid rgba(255,176,96,0.3)',
            padding: '0.4rem 0.85rem',
            borderRadius: '3px',
            textDecoration: 'none',
          }}>
            → OPEN FULL FILE
          </Link>
        </div>
      )}
    </div>
  )
}

function Stat({ label, val, color }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text-dim)', letterSpacing: '0.16em', marginBottom: '0.2rem' }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem', color, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>
        {val}
      </div>
    </div>
  )
}
