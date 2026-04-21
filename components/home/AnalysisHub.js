'use client'

import { useState } from 'react'

const GROUPS = [
  {
    id: 'lookup',
    title: 'Look something up',
    kicker: 'Start with a name, zip, or race.',
    color: 'var(--teal)',
    items: [
      { label: 'Who funds your district', href: '/who-funds',   desc: 'Zip → reps → donors',          badge: 'TOOL' },
      { label: 'Candidates',              href: '/candidates',  desc: '883 indexed · FL + federal',   badge: 'DIR' },
      { label: 'Donors',                  href: '/donors',      desc: '883K normalized entities',     badge: 'DIR' },
      { label: 'Committees',              href: '/committees',  desc: '4.2K committees · linked',     badge: 'DIR' },
      { label: 'Lobbyists',               href: '/lobbyists',   desc: '2,473 registered',             badge: 'DIR' },
      { label: 'Legislators',             href: '/legislature', desc: '160 · votes + donors + lobby', badge: 'DIR' },
      { label: 'Races · 2026',            href: '/races/2026',  desc: 'Live fundraising',             badge: 'LIVE' },
      { label: 'Industries',              href: '/industries',  desc: 'Sector-level rollups',         badge: 'DIR' },
    ],
  },
  {
    id: 'compare',
    title: 'Compare & rank',
    kicker: 'Two candidates, five cycles, ten donors.',
    color: 'var(--orange)',
    items: [
      { label: 'Compare candidates', href: '/compare',       desc: 'Side-by-side money + people', badge: 'TOOL' },
      { label: 'Influence index',    href: '/influence',     desc: 'Ranked, 1996 → today',        badge: 'TOOL' },
      { label: 'Party finance',      href: '/party-finance', desc: 'R vs D, by cycle',            badge: 'ANALYSIS' },
      { label: 'Cycles',             href: '/cycles',        desc: '16 cycles compared',          badge: 'ANALYSIS' },
      { label: 'Elections',          href: '/elections',     desc: 'Outcomes + money',            badge: 'ANALYSIS' },
    ],
  },
  {
    id: 'trace',
    title: 'Connect the dots',
    kicker: 'Where the money came from and where it went.',
    color: 'var(--gold)',
    items: [
      { label: 'Follow the money', href: '/follow',      desc: 'Source → PAC → candidate',      badge: 'TOOL' },
      { label: 'Flow',             href: '/flow',        desc: 'Committee transfers',           badge: 'VIZ' },
      { label: 'Connections',      href: '/connections', desc: 'Shared treasurers + addresses', badge: 'ANALYSIS' },
    ],
  },
  {
    id: 'influence',
    title: 'Influence in motion',
    kicker: 'Lobbying, contracts, and downstream effects.',
    color: 'var(--blue)',
    items: [
      { label: 'Lobbying',              href: '/lobbying',           desc: '4M rows · 19 years',     badge: 'DATA' },
      { label: 'Solicitations',         href: '/solicitations',      desc: 'Legislative requests',   badge: 'DATA' },
      { label: 'Independent expenditures', href: '/ie',              desc: 'Outside spending',       badge: 'DATA' },
      { label: 'Contracts',             href: '/contracts',          desc: 'State procurement',      badge: 'DATA' },
    ],
  },
  {
    id: 'reports',
    title: 'Analysis & investigations',
    kicker: 'Our reporting, decoded and sourced.',
    color: 'var(--green)',
    items: [
      { label: 'Investigations',   href: '/investigations',   desc: 'Named files · sourced',             badge: 'REPORTS' },
      { label: 'Decode',           href: '/decode',           desc: 'Shadow PAC decoder',                badge: 'TOOL' },
      { label: 'Transparency',     href: '/transparency',     desc: 'How we source · merge · classify',  badge: 'METHOD' },
      { label: 'Methodology',      href: '/methodology',      desc: 'Methods · field definitions · coverage scope', badge: 'REF' },
    ],
  },
]

const TOTAL_ITEMS = GROUPS.reduce((n, g) => n + g.items.length, 0)

export default function AnalysisHub() {
  const [active, setActive] = useState('all')
  const visible = active === 'all' ? GROUPS : GROUPS.filter(g => g.id === active)
  const tabs = [{ id: 'all', title: 'All', color: 'var(--text-dim)' }, ...GROUPS]

  return (
    <section style={{ padding: '2.25rem 2.5rem', borderBottom: '1px solid rgba(100,140,220,0.1)', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-dim)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            ◤ Analysis Hub
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.7rem', color: 'var(--text)', letterSpacing: '-0.015em', lineHeight: 1.1 }}>
            Everything built — <span style={{ color: 'var(--orange)', fontStyle: 'italic' }}>one index.</span>
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)', letterSpacing: '0.08em', maxWidth: '360px', lineHeight: 1.6 }}>
          Tools, directories, data views, and investigations — grouped by what you're trying to do.
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {tabs.map(t => {
          const on = active === t.id
          return (
            <button key={t.id} onClick={() => setActive(t.id)} style={{
              background: on ? `color-mix(in srgb, ${t.color} 12%, transparent)` : 'transparent',
              border: `1px solid ${on ? t.color : 'var(--border)'}`,
              color: on ? t.color : 'var(--text-dim)',
              padding: '0.35rem 0.8rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.64rem',
              letterSpacing: '0.14em',
              cursor: 'pointer',
              borderRadius: '2px',
              textTransform: 'uppercase',
            }}>{t.title}</button>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
        {visible.map(g => (
          <div key={g.id}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ width: '3px', height: '1rem', background: g.color, borderRadius: '2px' }} />
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem', color: 'var(--text)', letterSpacing: '-0.01em' }}>{g.title}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>{g.kicker}</div>
            </div>
            <div className="rg-3" style={{ gap: '0.5rem' }}>
              {g.items.map(it => (
                <HubCard key={it.href} item={it} color={g.color} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '1.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)', letterSpacing: '0.12em', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span>{TOTAL_ITEMS} TOOLS · DIRECTORIES · ANALYSES · REPORTS</span>
      </div>
    </section>
  )
}

function HubCard({ item, color }) {
  const [hover, setHover] = useState(false)
  return (
    <a
      href={item.href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textDecoration: 'none',
        border: `1px solid ${hover ? color : 'var(--border)'}`,
        background: hover ? `color-mix(in srgb, ${color} 6%, transparent)` : 'rgba(255,255,255,0.015)',
        padding: '0.75rem 0.9rem',
        borderRadius: '3px',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '0.6rem',
        alignItems: 'start',
        transition: 'border-color .15s, background .15s',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: '0.95rem', color: 'var(--text)', letterSpacing: '-0.005em', marginBottom: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.label}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem', color: 'var(--text-dim)', letterSpacing: '0.04em' }}>
          {item.desc}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem', flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color, letterSpacing: '0.12em', border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`, padding: '0.1rem 0.35rem', borderRadius: '2px' }}>
          {item.badge}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color }}>→</span>
      </div>
    </a>
  )
}
