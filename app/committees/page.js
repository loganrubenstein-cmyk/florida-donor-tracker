import CommitteesList from '@/components/committees/CommitteesList';
import DataTrustBlock from '@/components/shared/DataTrustBlock';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Committees',
  description: 'Browse all 4,440 Florida political committees with campaign finance data.',
};

export default function CommitteesPage() {
  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{
            fontSize: '0.65rem', padding: '0.15rem 0.5rem',
            border: '1px solid var(--green)', color: 'var(--green)',
            borderRadius: '2px', fontFamily: 'var(--font-mono)', fontWeight: 'bold',
          }}>
            DIRECTORY
          </span>
        </div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.5rem, 4vw, 2.4rem)',
          fontWeight: 400, color: '#fff', marginBottom: '0.4rem', lineHeight: 1.1,
        }}>
          Political Committees
        </h1>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
          4,440 Florida political committees with contribution data · Florida Division of Elections
        </div>
      </div>
      <CommitteesList />
      <div style={{ marginTop: '3rem' }}>
        <DataTrustBlock
          source="Florida Division of Elections — Committee Registration Filings"
          sourceUrl="https://dos.elections.myflorida.com/committees/"
          lastUpdated="April 2026"
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
