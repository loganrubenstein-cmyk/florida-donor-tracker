'use client';

import { useState } from 'react';
import Link from 'next/link';

const TABS = [
  {
    id: 'voter',
    label: 'Voter tools',
    tools: [
      { href: '/who-funds',   title: '→ who funds your district', desc: 'Zip code → your reps → every donor on file. See who\'s bankrolling them.', badge: 'New' },
      { href: '/follow',      title: '→ follow the money',        desc: 'Pick any donor. Trace them through PACs to candidates.' },
      { href: '/races/2026',  title: '→ 2026 money race',         desc: 'Live fundraising leaderboard for every major FL race.', badge: 'New' },
      { href: '/influence',   title: '→ influence index',         desc: 'Orgs ranked by combined lobbying spend + campaign donations.' },
      { href: '/legislature', title: '→ legislature',             desc: 'All 160 FL legislators — donors, votes, disclosures in one place.' },
    ],
  },
  {
    id: 'flow',
    label: 'Money flow',
    tools: [
      { href: '/follow',      title: '→ follow the money',        desc: 'Start from any entity. Trace the full money trail, exportable.' },
      { href: '/flow',        title: '→ money flow explorer',     desc: 'Multi-path drill-down: donor → committee → candidate.' },
      { href: '/connections', title: '→ committee connections',   desc: '56K+ committee pairs — shadow networks mapped.' },
      { href: '/ie',          title: '→ independent expenditures',desc: '$70.9M in IE spending — who ran ads for/against candidates.' },
      { href: '/tools/bipartisan', title: '→ party cross-reference', desc: 'Donors who fund both parties — ranked by bipartisan spend.' },
    ],
  },
  {
    id: 'research',
    label: 'Deep research',
    tools: [
      { href: '/influence',   title: '→ influence index',         desc: 'Combined lobbying + campaign rank. FL\'s most complete political spend index.' },
      { href: '/connections', title: '→ committee connections',   desc: 'Shadow PAC network graph — 431 orgs, 56K+ pairs.' },
      { href: '/investigations', title: '→ investigations',       desc: '11 entities with documented influence, cross-referenced with journalism.' },
      { href: '/lobbyists',   title: '→ lobbyists',               desc: '2,473 registered lobbyists — clients, bills, and campaign donations.' },
      { href: '/principals',  title: '→ principals',              desc: 'Lobbying clients matched to their campaign contributions.' },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    tools: [
      { href: '/explorer',    title: '→ transaction explorer',    desc: 'Full 22M-row dataset. Filter, sort, export.' },
      { href: '/industries',  title: '→ industries',              desc: 'Campaign finance bucketed by sector — 15 industry categories.' },
      { href: '/cycles',      title: '→ election cycles',         desc: '2008–2026: side-by-side cycle comparisons.' },
      { href: '/principals',  title: '→ lobbying principals',     desc: '19 years of lobbying compensation — 4M rows, $34.9B.' },
      { href: '/timeline',    title: '→ money timeline',          desc: 'Political spending 1996–present, overlaid with election years.' },
    ],
  },
];

export default function HomeToolTabs() {
  const [active, setActive] = useState('voter');
  const tab = TABS.find(t => t.id === active);

  return (
    <div>
      <div className="home-tab-bar">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`home-tab-btn${active === t.id ? ' ht-active' : ''}`}
          >
            {t.label}
          </button>
        ))}
        <Link href="/tools" style={{
          marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--text-dim)',
          textDecoration: 'none', padding: '0.55rem 0.5rem 0.6rem',
          alignSelf: 'center', whiteSpace: 'nowrap',
        }}>
          all tools →
        </Link>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {tab.tools.map((tool, i) => (
          <Link key={i} href={tool.href} style={{ textDecoration: 'none' }}>
            <div style={{
              border: '1px solid var(--border)', borderRadius: '3px',
              padding: '0.75rem 1rem',
              display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
              transition: 'border-color 0.12s',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--orange)', fontFamily: 'var(--font-mono)', marginBottom: '0.2rem' }}>
                  {tool.title}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(200,216,240,0.6)', lineHeight: 1.55 }}>
                  {tool.desc}
                </div>
              </div>
              {tool.badge && (
                <span style={{
                  fontSize: '0.55rem', textTransform: 'uppercase',
                  background: 'rgba(128,255,160,0.1)', color: 'var(--green)',
                  padding: '0.15rem 0.4rem', borderRadius: '2px',
                  flexShrink: 0, alignSelf: 'flex-start',
                }}>
                  {tool.badge}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
