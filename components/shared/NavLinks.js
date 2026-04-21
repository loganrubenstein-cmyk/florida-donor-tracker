'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';

// Direct top-level links (no dropdown)
const DIRECT = [
  { href: '/candidates', label: 'Candidates' },
  { href: '/committees', label: 'Committees' },
  { href: '/follow',     label: 'Follow $' },
];

const GROUPS = [
  {
    label: 'Explore',
    items: [
      { href: '/donors',         label: 'Donors' },
      { href: '/explorer',       label: 'Transactions' },
      { href: '/lobbyists',      label: 'Lobbyists' },
      { href: '/principals',     label: 'Principals' },
      { href: '/lobbying-firms', label: 'Lobbying Firms' },
      { href: '/legislature',    label: 'Legislature' },
      { href: '/legislators',    label: 'Legislators' },
    ],
    extra: ['/donor/', '/lobbyist/', '/principal/', '/lobbying-firm/', '/legislator/'],
  },
  {
    label: 'Analysis',
    items: [
      { href: '/influence',         label: 'Influence Index' },
      { href: '/industries',        label: 'Industries' },
      { href: '/elections',         label: 'Elections' },
      { href: '/cycles',            label: 'Cycles' },
      { href: '/party-finance',     label: 'Party Finance' },
      { href: '/ie',                label: 'Indep. Expenditures' },
      { href: '/contracts',         label: 'State Contracts' },
      { href: '/connections',       label: 'Connections' },
      { href: '/pulse',             label: 'Pulse' },
      { href: '/investigations',    label: 'Investigations' },
    ],
    extra: ['/industry/', '/cycle/'],
  },
  {
    label: 'Tools',
    items: [
      { href: '/tools',          label: '→ Tools Hub' },
      { href: '/who-funds',      label: 'Who Funds Your District', badge: 'New' },
      { href: '/races/2026',     label: '2026 Money Race',         badge: 'New' },
      { href: '/follow',         label: 'Follow the Money' },
      { href: '/compare',        label: 'Candidate Compare' },
      { href: '/decode',         label: 'Committee Decoder' },
      { href: '/timeline',       label: 'Influence Timeline' },
      { href: '/transparency',   label: 'Dark Money Score' },
      { href: '/map',            label: 'Geographic Map' },
    ],
    extra: ['/who-funds', '/races/'],
  },
  {
    label: 'Lobbying',
    items: [
      { href: '/lobbying',       label: 'Lobbying Hub' },
      { href: '/lobbying/bills', label: 'Bills' },
      { href: '/solicitations',  label: 'Solicitations' },
    ],
    extra: ['/lobbying/bill/'],
  },
  {
    label: 'Sources',
    items: [
      { href: '/methodology', label: 'Methodology' },
      { href: '/about',       label: 'About' },
    ],
  },
];

function isGroupActive(group, pathname) {
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
  const [openGroup, setOpenGroup] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef(null);

  // Close dropdown on click-outside or Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setOpenGroup(null); }
    function onOutside(e) {
      if (navRef.current && !navRef.current.contains(e.target)) setOpenGroup(null);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onOutside);
    };
  }, []);

  // Close dropdown on route change
  useEffect(() => { setOpenGroup(null); }, [pathname]);

  function toggle(label) {
    setOpenGroup(prev => prev === label ? null : label);
  }

  return (
    <>
      {/* ── Desktop nav ───────────────────────────────────────────────── */}
      <div className="nav-links-desktop" ref={navRef}>

        {/* Direct links */}
        {DIRECT.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <div key={label} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
              <Link href={href} style={{
                color: 'var(--text)',
                textDecoration: 'none',
                fontSize: '0.92rem',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                padding: '0.25rem 0',
                opacity: active ? 1 : 0.75,
                transition: 'opacity 0.12s',
              }}>
                {label}
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
        })}

        {/* Dropdown groups */}
        {GROUPS.map((group) => {
          const active = isGroupActive(group, pathname);
          const isOpen = openGroup === group.label;

          return (
            <div key={group.label} className={`nav-group${active ? ' nav-group-active' : ''}`}>
              <button
                className="nav-group-trigger"
                onClick={() => toggle(group.label)}
                aria-expanded={isOpen}
              >
                {group.label}
                <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{
                  marginLeft: '3px', flexShrink: 0,
                  transform: isOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.15s',
                }}>
                  <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {active && !isOpen && (
                <span style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  height: '1px', background: 'var(--orange)',
                  transform: 'skewX(-3deg)', transformOrigin: 'left center',
                }} />
              )}
              <div className={`nav-dropdown${isOpen ? ' open' : ''}`}>
                {group.items.map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={isItemActive(item.href, pathname) ? 'nav-dropdown-item active' : 'nav-dropdown-item'}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}
                  >
                    <span>{item.label}</span>
                    {item.badge && (
                      <span style={{ fontSize: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.06em', background: 'rgba(128,255,160,0.12)', color: 'var(--green)', padding: '0.1rem 0.35rem', borderRadius: '2px', flexShrink: 0 }}>
                        {item.badge}
                      </span>
                    )}
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
            {DIRECT.map(({ href, label }) => (
              <Link
                key={label}
                href={href}
                className="nav-mobile-direct"
                onClick={() => setMobileOpen(false)}
              >
                {label}
              </Link>
            ))}
            {GROUPS.map(group => (
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
            ))}
          </div>
        </div>
      )}
    </>
  );
}
