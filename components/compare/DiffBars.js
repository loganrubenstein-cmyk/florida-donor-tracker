'use client'

import { useEffect, useRef, useState } from 'react'
import { fmtMoneyCompact, fmtCountCompact } from '@/lib/fmt'
import TrustRibbon from '@/components/shared/TrustRibbon'

function partyColor(code) {
  if (code === 'REP' || code === 'R') return 'var(--republican)'
  if (code === 'DEM' || code === 'D') return 'var(--democrat)'
  return 'var(--text-dim)'
}

function lastNameUpper(name = '') {
  const parts = String(name).trim().split(/\s+/)
  return (parts[parts.length - 1] || '').toUpperCase()
}

function firstName(name = '') {
  return String(name).trim().split(/\s+/)[0] || ''
}

export default function DiffBars({ a, b }) {
  const [inView, setInView] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current) return
    const io = new IntersectionObserver(
      entries => entries.forEach(e => e.isIntersecting && setInView(true)),
      { threshold: 0.1 }
    )
    io.observe(ref.current)
    return () => io.disconnect()
  }, [])

  const colorA = partyColor(a.party_code)
  const colorB = partyColor(b.party_code)

  const metrics = [
    { key: 'total_combined',       label: 'TOTAL RAISED',      money: true,  hero: true },
    { key: 'hard_money_total',     label: 'HARD MONEY',        money: true },
    { key: 'soft_money_total',     label: 'SOFT MONEY (PAC)',  money: true },
    { key: 'hard_num_contributions', label: 'CONTRIBUTIONS',   money: false },
    { key: 'avg_donation',         label: 'AVG DONATION',      money: true },
    { key: 'corp_pct',             label: 'CORPORATE SHARE',   pct: true },
  ]

  const derive = (c) => ({
    ...c,
    avg_donation: c.hard_num_contributions > 0 ? c.hard_money_total / c.hard_num_contributions : 0,
    corp_pct: c.hard_money_total > 0 ? c.hard_corporate_total / c.hard_money_total : 0,
  })
  const A = derive(a)
  const B = derive(b)

  const fmt = (val, m) => {
    if (m.pct) return Math.round(val * 100) + '%'
    if (m.money) return fmtMoneyCompact(val)
    return fmtCountCompact(val)
  }

  const aRaised = A.total_combined || 0
  const bRaised = B.total_combined || 0
  const raisedRatio = aRaised && bRaised ? Math.max(aRaised, bRaised) / Math.min(aRaised, bRaised) : 1
  const aAvg = A.avg_donation || 0
  const bAvg = B.avg_donation || 0
  const avgRatio = aAvg && bAvg ? Math.max(aAvg, bAvg) / Math.min(aAvg, bAvg) : 1
  const leadName = aRaised >= bRaised ? firstName(a.candidate_name) : firstName(b.candidate_name)

  return (
    <div>
      <div style={{ marginBottom: '1.75rem' }}>
        <TrustRibbon source="FL Division of Elections · FEC Form 3" updated="Apr 14, 2026" confidence="direct" />
      </div>

      <div style={{ margin: '0 0 2.5rem', display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: '1rem', alignItems: 'stretch' }}>
        <div style={{ border: `1px solid ${colorA}44`, borderRadius: '3px', padding: '1.1rem 1.35rem', background: `${colorA}05` }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: colorA, letterSpacing: '0.18em', marginBottom: '0.4rem' }}>
            CANDIDATE A{a.party_code ? ` · ${a.party_code}` : ''}
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', color: 'var(--text)', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
            {a.candidate_name}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.3rem' }}>
            {[a.office_desc, a.election_year].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-serif)', fontSize: '2rem', color: 'var(--orange)', fontStyle: 'italic' }}>
          vs
        </div>
        <div style={{ border: `1px solid ${colorB}44`, borderRadius: '3px', padding: '1.1rem 1.35rem', background: `${colorB}05` }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: colorB, letterSpacing: '0.18em', marginBottom: '0.4rem' }}>
            CANDIDATE B{b.party_code ? ` · ${b.party_code}` : ''}
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.5rem', color: 'var(--text)', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
            {b.candidate_name}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '0.3rem' }}>
            {[b.office_desc, b.election_year].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      <div ref={ref}>
        {metrics.map((m, i) => {
          const la = Number(A[m.key]) || 0
          const lb = Number(B[m.key]) || 0
          const max = Math.max(la, lb, 1)
          const leftBigger = la >= lb
          const small = Math.min(la, lb)
          const ratio = small > 0 ? Math.max(la, lb) / small : 0
          const winnerName = lastNameUpper((leftBigger ? a : b).candidate_name)
          const winnerColor = leftBigger ? colorA : colorB

          return (
            <div key={m.key} style={{ padding: '1.75rem 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)', letterSpacing: '0.22em' }}>{m.label}</div>
                {ratio > 0 && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: winnerColor, letterSpacing: '0.12em' }}>
                    {winnerName} LEADS {ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}×
                  </div>
                )}
              </div>

              {[
                { val: la, color: colorA, name: a.candidate_name, isWinner: leftBigger, delay: i * 0.05 },
                { val: lb, color: colorB, name: b.candidate_name, isWinner: !leftBigger, delay: i * 0.05 + 0.1 },
              ].map((row, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '0.9rem', alignItems: 'center', marginBottom: idx === 0 ? '0.6rem' : 0 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: row.color, letterSpacing: '0.14em', textAlign: 'right' }}>
                    {lastNameUpper(row.name)}
                  </div>
                  <div style={{ position: 'relative', height: '42px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
                    <div style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: inView ? `${(row.val / max) * 100}%` : '0%',
                      background: `linear-gradient(90deg, ${row.color}33, ${row.color}66)`,
                      borderRight: `2px solid ${row.color}`,
                      transition: `width .9s cubic-bezier(0.22, 0.61, 0.36, 1) ${row.delay}s`,
                    }} />
                    <div style={{
                      position: 'absolute',
                      left: `calc(${inView ? (row.val / max) * 100 : 0}% + 14px)`,
                      top: '50%', transform: 'translateY(-50%)',
                      fontFamily: 'var(--font-serif)',
                      fontSize: row.isWinner ? 'clamp(1.75rem, 3.5vw, 2.6rem)' : 'clamp(1.1rem, 2vw, 1.5rem)',
                      color: row.isWinner ? 'var(--text)' : 'var(--text-dim)',
                      lineHeight: 1, letterSpacing: '-0.025em',
                      fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                      transition: 'left .9s cubic-bezier(0.22, 0.61, 0.36, 1)',
                    }}>
                      {fmt(row.val, m)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {aRaised > 0 && bRaised > 0 && (
        <div style={{ marginTop: '2.5rem', padding: '1.5rem 1.75rem', border: '1px solid rgba(255,176,96,0.25)', background: 'rgba(255,176,96,0.04)', borderRadius: '4px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--orange)', letterSpacing: '0.2em', marginBottom: '0.75rem' }}>
            ◤ THE TAKEAWAY
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.05rem, 2vw, 1.5rem)', color: 'var(--text)', lineHeight: 1.45, letterSpacing: '-0.01em' }}>
            {leadName} raised <span style={{ color: 'var(--orange)' }}>{raisedRatio >= 10 ? Math.round(raisedRatio) : raisedRatio.toFixed(1)}×</span> more
            {aAvg > 0 && bAvg > 0 && (
              <> — with an average check <span style={{ color: 'var(--orange)' }}>{avgRatio >= 10 ? Math.round(avgRatio) : avgRatio.toFixed(1)}×</span> {(aRaised >= bRaised ? aAvg >= bAvg : bAvg >= aAvg) ? 'bigger' : 'smaller'}.</>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
