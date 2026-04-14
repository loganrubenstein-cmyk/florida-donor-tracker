import Link from 'next/link';
import SectionHeader from '@/components/shared/SectionHeader';

export const metadata = {
  title: 'Investigative Tools',
  description: 'Five investigative tools for tracking money in Florida politics — decode committees, compare donors, visualize influence, and expose dark money.',
};

const tools = [
  {
    title: 'Committee Decoder',
    href: '/decode',
    description: 'Decode any Florida political committee — see who really funds it, which industries back it, and which candidates it supports.',
    color: 'var(--orange)',
    icon: '🔍',
  },
  {
    title: 'Money in Your District',
    href: '/district',
    description: 'Look up your FL House or Senate district — see your legislator, their fundraising, top donors, voting record, and peer comparison.',
    color: 'var(--teal)',
    icon: '🏛',
  },
  {
    title: 'Donor Overlap',
    href: '/compare',
    description: 'Pick any two candidates or committees and find their shared donors, overlapping money, and the industries funding both.',
    color: 'var(--green)',
    icon: '⊕',
  },
  {
    title: 'Influence Timeline',
    href: '/timeline',
    description: 'Visualize any candidate\'s fundraising over time — spot pre-election surges, PAC formations, and donation spikes.',
    color: 'var(--republican)',
    icon: '📈',
  },
  {
    title: 'Dark Money Scoreboard',
    href: '/transparency',
    description: 'Rank all committees by transparency — ratio of identifiable individuals vs. corporate and PAC dark money.',
    color: '#a0c0ff',
    icon: '🏴',
  },
];

export default function ToolsPage() {
  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '3rem' }}>
      <SectionHeader title="Investigative Tools" eyebrow="Florida · Follow the Money" />
      <p style={{ color: 'var(--text-dim)', fontSize: '0.78rem', marginBottom: '2rem', maxWidth: '600px' }}>
        Five tools for following the money in Florida politics. Decode opaque committee names, compare
        donor networks, visualize fundraising timelines, and surface dark money.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
        {tools.map(tool => (
          <Link key={tool.href} href={tool.href} style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
              padding: '1.25rem', borderLeft: `3px solid ${tool.color}`,
              transition: 'border-color 0.12s', cursor: 'pointer',
              height: '100%',
            }}>
              <div style={{ fontSize: '0.95rem', color: 'var(--text)', fontFamily: 'var(--font-serif)', marginBottom: '0.4rem' }}>
                <span style={{ marginRight: '0.4rem' }}>{tool.icon}</span>
                {tool.title}
              </div>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.72rem', margin: 0, lineHeight: 1.5 }}>
                {tool.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
