'use client';

import { useState } from 'react';
import Link from 'next/link';

const VOTER_TOOLS = [
  { href: '/who-funds', title: '→ who funds your district', desc: 'Enter your zip code. See who bankrolls your state rep, state senator, and US rep — donors, industries, and PAC money.', featured: true, badge: 'New' },
  { href: '/races/2026', title: '→ 2026 money race', desc: 'Live fundraising leaderboard for every major FL race. Hard money vs. soft money split. Updated as filings drop.', badge: 'New' },
  { href: '/legislature', title: '→ legislature', desc: 'All 160 FL legislators — donors, lobbying connections, vote records, and official financial disclosures.' },
  { href: '/pulse',       title: '→ pulse',              desc: 'What\'s happening right now — recent filings, notable new donors, and trending committees.' },
];

const JOURNALIST_TOOLS = [
  { href: '/follow',          title: '→ follow the money',      desc: 'Start from any donor, committee, or candidate and trace the full money trail — upstream contributors, downstream transfers, PAC webs. Exportable.', featured: true },
  { href: '/influence',       title: '→ influence index',       desc: 'Score-ranked list of donors, lobbyists, and committees by total political footprint across candidates, PACs, and cycles.' },
  { href: '/connections',     title: '→ committee connections', desc: 'Visual graph of committee relationships — transfers, shared donors, coordinated spending, and shadow networks mapped.' },
  { href: '/flow',            title: '→ money flow explorer',   desc: 'Trace every dollar from donor → committee → candidate. Filter by cycle, party, industry, or amount.' },
  { href: '/tools/bipartisan',title: '→ party cross-reference', desc: 'Identify donors and lobbyists who fund both parties — ranked by bipartisan spend and industry.' },
];

const DATA_TOOLS = [
  { href: '/explorer',   title: '→ transaction explorer',       desc: 'Query the full 22M-row dataset. Filter by date, amount, party, district, industry, or donor type. Sort, paginate, export.', featured: true },
  { href: '/industries', title: '→ industries',                 desc: 'Campaign contributions bucketed by sector — real estate, healthcare, legal, finance, agriculture, and more.' },
  { href: '/cycles',     title: '→ election cycles 2008–2026',  desc: 'Side-by-side comparison of every FL election cycle. Totals, top donors, top recipients, hard vs. soft split.' },
  { href: '/principals', title: '→ lobbying principals',        desc: 'Every company that has hired FL lobbyists — total spend, active firms, legislative targets over 19 years.' },
  { href: '/timeline',   title: '→ money timeline',             desc: 'Longitudinal view of political spending 1996–present. Overlay election years and major events.' },
];

const TABS = [
  {
    id: 'voter', label: 'For voters', color: 'var(--teal)', tools: VOTER_TOOLS,
    hook: 'Who\'s bankrolling the people who represent me?',
    body: 'These tools connect donations to districts, track the 2026 races, and show exactly where the money comes from so you can vote with the full picture.',
    queries: ['Who are the top donors to my state rep?', 'Show me out-of-state money in district 13', 'Which 2026 races are closest in fundraising?', 'How does my rep vote vs. who funds them?'],
    landingHref: '/tools/voters',
  },
  {
    id: 'journalist', label: 'For journalists', color: 'var(--orange)', tools: JOURNALIST_TOOLS,
    hook: 'Follow the money — through PACs, lobbyists, and shadow networks.',
    body: 'These tools trace donor webs across committees, surface lobbyist relationships, and map the shadow PAC networks — down to every filing, every connection.',
    queries: ['Show all PACs connected to DeSantis', 'Which lobbyists fund both parties?', 'Map the sugar industry shadow network', 'Who bundled money for the 2022 governor\'s race?'],
    landingHref: '/tools/journalists',
  },
  {
    id: 'data', label: 'Deep data', color: 'var(--blue)', tools: DATA_TOOLS,
    hook: 'Give me the full picture — every transaction, every cycle.',
    body: 'For researchers, analysts, and anyone who wants the unfiltered data. 22 million transactions, 19 years of lobbying, and full election cycle comparisons.',
    queries: ['All contributions over $100K since 2020', 'Industry breakdown for the 2022 cycle', 'Top lobbying firms by compensation 2005–2024', 'Compare 2018 vs. 2022 fundraising totals'],
    landingHref: '/tools/data',
  },
];

export default function ToolHubTabs() {
  const [activeTab, setActiveTab] = useState('voter');
  const tab = TABS.find(t => t.id === activeTab);

  return (
    <>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '2rem' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              background: 'none', border: 'none',
              borderBottom: `2px solid ${activeTab === t.id ? t.color : 'transparent'}`,
              color: activeTab === t.id ? t.color : 'var(--text-dim)',
              fontSize: '0.72rem', padding: '0.55rem 1.25rem 0.6rem',
              cursor: 'pointer', marginBottom: '-1px',
              fontFamily: 'var(--font-mono)', transition: 'color 0.12s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Panel */}
      <div className="tools-panel">
        {/* Sidebar */}
        <div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.05rem', fontWeight: 400, lineHeight: 1.45, marginBottom: '0.75rem', color: tab.color }}>
            "{tab.hook}"
          </div>
          <p style={{ fontSize: '0.77rem', color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: '1rem' }}>
            {tab.body}
          </p>
          <Link href={tab.landingHref} style={{ display: 'inline-block', fontSize: '0.68rem', color: tab.color, border: '1px solid currentColor', borderRadius: '3px', opacity: 0.55, padding: '0.3rem 0.7rem', textDecoration: 'none', marginBottom: '1.25rem' }}>
            → full guide for this lane
          </Link>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
            Try asking
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {tab.queries.map(q => (
              <div key={q} style={{ fontSize: '0.68rem', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.4rem 0.7rem', lineHeight: 1.45 }}>
                {q}
              </div>
            ))}
          </div>
        </div>

        {/* Tool list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          {tab.tools.map((tool, i) => (
            <Link key={i} href={tool.href} style={{ textDecoration: 'none' }}>
              <div style={{
                border: tool.featured ? `1px solid ${tab.color}33` : '1px solid var(--border)',
                background: tool.featured ? `${tab.color}08` : 'transparent',
                borderRadius: '3px', padding: '0.9rem 1rem',
                display: 'flex', alignItems: 'flex-start', gap: '0.9rem',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.73rem', fontWeight: 700, color: tab.color, fontFamily: 'var(--font-mono)', marginBottom: '0.2rem' }}>
                    {tool.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(200,216,240,0.6)', lineHeight: 1.55 }}>
                    {tool.desc}
                  </div>
                </div>
                {tool.badge && (
                  <span style={{ fontSize: '0.57rem', textTransform: 'uppercase', background: 'rgba(128,255,160,0.1)', color: 'var(--green)', padding: '0.18rem 0.45rem', borderRadius: '2px', flexShrink: 0, whiteSpace: 'nowrap', alignSelf: 'flex-start' }}>
                    {tool.badge}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
