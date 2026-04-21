import CommitteesList from '@/components/committees/CommitteesList';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import SectionHeader from '@/components/shared/SectionHeader';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Committees',
  description: 'Browse all 4,440 Florida political committees with campaign finance data.',
};

export default function CommitteesPage() {
  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>
      <SectionHeader title="Political Committees" eyebrow="FL Committees · 1996–2026" patch="committees" />
      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '-0.75rem', marginBottom: '1.25rem' }}>
        4,440 Florida political committees with contribution data · Florida Division of Elections
      </div>
      <CommitteesList />
      <div style={{ marginTop: '3rem' }}>
        <DataTrustBlock
          source="Florida Division of Elections — Committee Registration Filings"
          sourceUrl="https://dos.elections.myflorida.com/committees/"
          
          direct={['committee name', 'committee type', 'total raised', 'total spent', 'donor counts']}
          normalized={['committee type codes mapped to plain-language labels']}
          caveats={[
            'Includes all registered FL political committees — PACs, ECOs, party committees, and candidate committees.',
            'Finance totals span all available cycles in the dataset (2008–2026).',
          ]}
        />
      </div>
    </main>
  );
}
