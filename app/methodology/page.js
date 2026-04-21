import Link from 'next/link';
import SectionHeader from '@/components/shared/SectionHeader';
import MethodologyTabs from '@/components/methodology/MethodologyTabs';

export const metadata = {
  title: 'Methodology',
  description: 'How Florida Influence collects, normalizes, and classifies campaign finance data — plus field definitions and coverage scope.',
};

export default function MethodologyPage() {
  return (
    <main style={{ maxWidth: '800px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <span>Methodology</span>
      </div>

      <SectionHeader title="Methodology" eyebrow="Florida Influence · Data Methods" />

      <MethodologyTabs />
    </main>
  );
}
