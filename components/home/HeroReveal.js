'use client'

import { useEffect, useState } from 'react'
import FloridaOutline from '@/components/shared/FloridaOutline'
import MoneyClock from '@/components/home/MoneyClock'
import DidYouKnow from '@/components/home/DidYouKnow'

const PILLS = [
  { label: 'Campaign Finance',     color: 'var(--text)',     bg: 'rgba(200,216,240,0.07)', border: 'rgba(200,216,240,0.15)' },
  { label: '$34.9B Lobbying',      color: 'var(--teal)',     bg: 'rgba(77,216,240,0.08)',  border: 'rgba(77,216,240,0.2)'   },
  { label: 'Official Disclosures', color: 'var(--blue)',     bg: 'rgba(160,192,255,0.07)', border: 'rgba(160,192,255,0.18)' },
  { label: 'Shadow PAC Networks',  color: 'var(--gold)',     bg: 'rgba(255,208,96,0.07)',  border: 'rgba(255,208,96,0.18)'  },
  { label: 'Legislature',          color: 'var(--text-dim)', bg: 'transparent',            border: 'var(--border)'          },
]

const CTAS = [
  { href: '/influence',   label: '→ influence index',   color: 'var(--orange)', border: 'rgba(255,176,96,0.3)'  },
  { href: '/follow',      label: '→ follow the money',  color: 'var(--teal)',   border: 'rgba(77,216,240,0.3)'  },
  { href: '/races/2026',  label: '→ 2026 races',        color: 'var(--green)',  border: 'rgba(128,255,160,0.3)' },
  { href: '/legislature', label: '→ legislature',       color: 'var(--blue)',   border: 'rgba(160,192,255,0.25)' },
]

export default function HeroReveal({ updatedDate }) {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const steps = [120, 400, 700, 1100, 1500, 1900]
    const timers = steps.map((d, i) => setTimeout(() => setPhase(i + 1), d))
    return () => timers.forEach(clearTimeout)
  }, [])

  const show = (p) => phase >= p
  const ease = (p, distY = 12) => ({
    opacity: show(p) ? 1 : 0,
    transform: show(p) ? 'translateY(0)' : `translateY(${distY}px)`,
    transition: 'opacity .7s cubic-bezier(0.22,0.61,0.36,1), transform .7s cubic-bezier(0.22,0.61,0.36,1)',
  })

  return (
    <section style={{
      padding: '3.5rem 2.5rem 2.75rem',
      borderBottom: '1px solid rgba(100,140,220,0.1)',
      maxWidth: '1140px',
      margin: '0 auto',
      position: 'relative',
    }}>
      <div className="star-field" />

      <div className="hero-2col">
        <div>
          <div style={{ ...ease(1, 6), marginBottom: '1.4rem' }}>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.62rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--text-dim)',
            }}>
              Last updated {updatedDate}
            </span>
          </div>

          <h1 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(1.9rem, 4.5vw, 3rem)',
            lineHeight: 1.05,
            letterSpacing: '-0.022em',
            color: 'var(--text)',
            fontWeight: 400,
            marginBottom: '1.1rem',
          }}>
            <span style={{ display: 'block', ...ease(2) }}>Follow the money</span>
            <span style={{ display: 'block', color: 'var(--orange)', fontStyle: 'italic', ...ease(3) }}>and influence</span>
            <span style={{ display: 'block', ...ease(4) }}>in Florida politics.</span>
          </h1>

          <p style={{
            fontSize: '0.9rem',
            color: 'var(--text)',
            marginBottom: '1.25rem',
            maxWidth: '520px',
            lineHeight: 1.75,
            opacity: show(5) ? 0.75 : 0,
            transition: 'opacity .7s',
          }}>
            Every donor, every PAC, every lobbyist, every vote. A free public record of who pays for Florida politics and who benefits.
          </p>

          <div style={{ ...ease(5, 10), display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            {PILLS.map(p => (
              <span key={p.label} style={{
                fontSize: '0.65rem', padding: '0.25rem 0.65rem', borderRadius: '2px',
                color: p.color, background: p.bg, border: `1px solid ${p.border}`,
                fontFamily: 'var(--font-mono)',
              }}>
                {p.label}
              </span>
            ))}
          </div>

          <div style={{ ...ease(6, 10) }}>
            <MoneyClock />
          </div>

          <form action="/search" method="GET" style={{ ...ease(5, 10), display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', maxWidth: '500px' }}>
            <input
              type="text"
              name="q"
              placeholder="Search donors, candidates, committees, lobbyists…"
              style={{
                flex: 1,
                background: 'rgba(8,8,24,0.8)',
                border: '1px solid rgba(100,140,220,0.35)',
                color: 'var(--text)',
                padding: '0.6rem 0.9rem',
                fontSize: '0.78rem',
                borderRadius: '3px',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            />
            <button type="submit" style={{
              background: 'var(--orange)', color: '#01010d',
              border: 'none', padding: '0.6rem 1.1rem',
              fontSize: '0.75rem', fontWeight: 700,
              fontFamily: 'var(--font-sans)', borderRadius: '3px',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              Search
            </button>
          </form>

          <div style={{ ...ease(6, 10), display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            {CTAS.map(c => (
              <a key={c.href} href={c.href} style={{
                border: `1px solid ${c.border}`,
                color: c.color,
                padding: '0.5rem 1.2rem',
                fontSize: '0.72rem',
                borderRadius: '3px',
                textDecoration: 'none',
                fontFamily: 'var(--font-mono)',
              }}>
                {c.label}
              </a>
            ))}
          </div>

          <div style={{ ...ease(6, 10) }}>
            <DidYouKnow />
          </div>
        </div>

        <div className="hide-mobile" style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: '1rem',
          opacity: show(3) ? 1 : 0,
          transform: show(3) ? 'scale(1)' : 'scale(0.95)',
          transition: 'opacity 1s cubic-bezier(0.22,0.61,0.36,1), transform 1s cubic-bezier(0.22,0.61,0.36,1)',
        }}>
          <FloridaOutline size="hero" style={{ opacity: 0.92 }} />
          <div style={{
            marginTop: '1.1rem',
            textAlign: 'center',
            maxWidth: '260px',
            ...ease(6, 6),
          }}>
            <div aria-hidden style={{
              width: '28px', height: '1px',
              background: 'rgba(255,176,96,0.55)',
              margin: '0 auto 0.85rem',
            }} />
            <div style={{
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: '1.05rem',
              lineHeight: 1.35,
              letterSpacing: '-0.005em',
              color: 'var(--text)',
              opacity: 0.86,
            }}>
              A sunny place for shady people.
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
