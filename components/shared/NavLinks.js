'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/candidates',  label: 'Candidates' },
  { href: '/committees',  label: 'Committees' },
  { href: '/donors',      label: 'Donors' },
  { href: '/explorer',    label: 'Explorer' },
  { href: '/lobbying',    label: 'Lobbying' },
  { href: '/legislature', label: 'Legislature' },
  { href: '/elections',   label: 'Elections' },
  { href: '/network',     label: 'Network' },
  { href: '/tools',       label: 'Tools' },
  { href: '/research',    label: 'Research' },
  { href: '/data',        label: 'Data' },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {NAV_LINKS.map(({ href, label }) => {
        const isActive = pathname === href || (href !== '/' && pathname.startsWith(href));
        return (
          <div key={href} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
            <Link href={href} style={{
              color: isActive ? 'var(--text)' : 'var(--text-dim)',
              textDecoration: 'none',
              fontSize: '0.82rem',
              whiteSpace: 'nowrap',
              padding: '0.25rem 0',
            }}>
              {label}
            </Link>
            {isActive && (
              <span style={{
                display: 'block',
                height: '1px',
                width: '100%',
                background: 'var(--orange)',
                transform: 'skewX(-3deg)',
                transformOrigin: 'left center',
                marginTop: '1px',
              }} />
            )}
          </div>
        );
      })}
    </>
  );
}
