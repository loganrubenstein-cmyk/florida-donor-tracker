'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const GROUPS = [
  {
    label: 'Explore',
    items: [
      { href: '/candidates',    label: 'Candidates' },
      { href: '/committees',    label: 'Committees' },
      { href: '/donors',        label: 'Donors' },
      { href: '/explorer',      label: 'Transactions' },
      { href: '/lobbyists',     label: 'Lobbyists' },
      { href: '/principals',    label: 'Principals' },
      { href: '/lobbying-firms',label: 'Lobbying Firms' },
      { href: '/legislature',   label: 'Legislature' },
      { href: '/legislators',   label: 'Legislators' },
    ],
    // additional path prefixes for active detection (dynamic routes)
    extra: ['/candidate/', '/committee/', '/donor/', '/lobbyist/', '/principal/', '/lobbying-firm/', '/legislator/'],
  },
  {
    label: 'Flow',
    href: '/flow',
  },
  {
    label: 'Analysis',
    items: [
      { href: '/influence',     label: 'Influence Index' },
      { href: '/industries',    label: 'Industries' },
      { href: '/elections',     label: 'Elections' },
      { href: '/cycles',        label: 'Cycles' },
      { href: '/party-finance', label: 'Party Finance' },
      { href: '/ie',            label: 'Indep. Expenditures' },
      { href: '/contracts',     label: 'State Contracts' },
      { href: '/connections',   label: 'Connections' },
    ],
    extra: ['/industry/', '/cycle/'],
  },
  {
    label: 'Tools',
    items: [
      { href: '/compare',       label: 'Candidate Compare' },
      { href: '/decode',        label: 'Committee Decoder' },
      { href: '/district',      label: 'District Lookup' },
      { href: '/timeline',      label: 'Influence Timeline' },
      { href: '/transparency',  label: 'Dark Money Score' },
    ],
  },
  {
    label: 'Lobbying',
    items: [
      { href: '/lobbying',      label: 'Lobbying Hub' },
      { href: '/lobbying/bills',label: 'Bills' },
      { href: '/solicitations', label: 'Solicitations' },
    ],
    extra: ['/lobbying/bill/'],
  },
  {
    label: 'Sources',
    items: [
      { href: '/methodology',      label: 'Methodology' },
      { href: '/data-dictionary',  label: 'Data Dictionary' },
      { href: '/coverage',         label: 'Coverage & Limits' },
      { href: '/about',            label: 'About' },
      { href: '/data',             label: 'Data Sources' },
    ],
  },
];

function isGroupActive(group, pathname) {
  if (group.href) {
    return pathname === group.href || pathname.startsWith(group.href + '/');
  }
  const fromItems = (group.items || []).some(
    item => pathname === item.href || pathname.startsWith(item.href + '/')
  );
  const fromExtra = (group.extra || []).some(p => pathname.startsWith(p));
  return fromItems || fromExtra;
}

function isItemActive(href, pathname) {
  return pathname === href || pathname.startsWith(href + '/');
}

export default function NavLinks() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* ── Desktop nav ───────────────────────────────────────────────── */}
      <div className="nav-links-desktop">
        {GROUPS.map((group) => {
          const active = isGroupActive(group, pathname);

          if (group.href) {
            return (
              <div key={group.label} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                <Link href={group.href} style={{
                  color: active ? 'var(--text)' : 'var(--text-dim)',
                  textDecoration: 'none',
                  fontSize: '0.82rem',
                  whiteSpace: 'nowrap',
                  padding: '0.25rem 0',
                }}>
                  {group.label}
                </Link>
                {active && (
                  <span style={{
                    display: 'block', height: '1px', width: '100%',
                    background: 'var(--orange)',
                    transform: 'skewX(-3deg)', transformOrigin: 'left center',
                    marginTop: '1px',
                  }} />
                )}
              </div>
            );
          }

          return (
            <div key={group.label} className={`nav-group${active ? ' nav-group-active' : ''}`}>
              <span className="nav-group-trigger">
                {group.label}
                <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{ marginLeft: '3px', opacity: 0.5, flexShrink: 0 }}>
                  <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              {active && (
                <span style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  height: '1px', background: 'var(--orange)',
                  transform: 'skewX(-3deg)', transformOrigin: 'left center',
                }} />
              )}
              <div className="nav-dropdown">
                {group.items.map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={isItemActive(item.href, pathname) ? 'nav-dropdown-item active' : 'nav-dropdown-item'}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Mobile hamburger ──────────────────────────────────────────── */}
      <button
        className="nav-hamburger"
        onClick={() => setMobileOpen(o => !o)}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
      >
        {mobileOpen ? '✕' : '☰'}
      </button>

      {mobileOpen && (
        <div className="nav-mobile-overlay" onClick={() => setMobileOpen(false)}>
          <div className="nav-mobile-menu" onClick={e => e.stopPropagation()}>
            {GROUPS.map(group => (
              group.href ? (
                <Link
                  key={group.label}
                  href={group.href}
                  className="nav-mobile-direct"
                  onClick={() => setMobileOpen(false)}
                >
                  {group.label}
                </Link>
              ) : (
                <div key={group.label} className="nav-mobile-group">
                  <div className="nav-mobile-group-label">{group.label}</div>
                  {group.items.map(item => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`nav-mobile-item${isItemActive(item.href, pathname) ? ' active' : ''}`}
                      onClick={() => setMobileOpen(false)}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )
            ))}
          </div>
        </div>
      )}
    </>
  );
}
