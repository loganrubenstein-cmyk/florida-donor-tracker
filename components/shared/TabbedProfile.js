'use client';

import { useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';

/**
 * TabbedProfile — client component that renders a tab bar + selected tab content.
 * Tab state is stored in the URL ?tab= param so deep links work.
 *
 * Props:
 *   tabs: Array<{ id: string, label: string, content: ReactNode, description?: string }>
 *         description is shown as a browser tooltip on hover.
 *   defaultTab: string — id of the default tab (first tab if omitted)
 *
 * Usage:
 *   <TabbedProfile
 *     tabs={[
 *       { id: 'overview', label: 'Overview', content: <OverviewSection /> },
 *       { id: 'donors',   label: 'Donors',   content: <DonorsSection /> },
 *     ]}
 *     defaultTab="overview"
 *   />
 */
export default function TabbedProfile({ tabs, defaultTab }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const activeId = searchParams.get('tab') || defaultTab || tabs[0]?.id;
  const activeTab = tabs.find(t => t.id === activeId) || tabs[0];

  function tabHref(id) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', id);
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div>
      <div className="tab-bar">
        {tabs.map(tab => (
          <Link
            key={tab.id}
            href={tabHref(tab.id)}
            className={`tab${tab.id === activeTab?.id ? ' tab-active' : ''}`}
            scroll={false}
            title={tab.description || undefined}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      <div>
        {activeTab?.content}
      </div>
    </div>
  );
}
