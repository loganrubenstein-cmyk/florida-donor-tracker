import { Suspense } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import DataTrustBlock from '@/components/shared/DataTrustBlock';

const TransactionExplorer = dynamic(
  () => import('@/components/explorer/TransactionExplorer'),
  { ssr: false }
);

export const metadata = {
  title: 'Transaction Explorer',
  description: 'Browse every contribution transaction in the Florida campaign finance database.',
};

export default function ExplorerPage() {
  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <span>Transaction Explorer</span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', color: 'var(--text)', marginBottom: '0.4rem' }}>
        Transaction Explorer
      </h1>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '1.5rem', maxWidth: '700px' }}>
        Browse every contribution to Florida committees and candidates. Filter by name, amount, date, year, or recipient.
        Click a contributor to see their full donor profile; click a recipient to see their committee or candidate page.
      </p>

      <Suspense fallback={
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
          Loading explorer…
        </div>
      }>
        <TransactionExplorer />
      </Suspense>

      <DataTrustBlock
        source="Florida Division of Elections"
        sourceUrl="https://dos.elections.myflorida.com/campaign-finance/"
        direct={['amount', 'contribution_date', 'contributor_name', 'contributor_occupation', 'type_code']}
        normalized={['contributor_name_normalized']}
        inferred={['donor profile links (name-matched)']}
        caveats={[
          '~10.4M contribution rows loaded (committee + candidate). URL params supported: ?q=, ?recipient=, ?donor_slug=, ?year=, ?amount_min=.',
          'Donor profile links are inferred by exact normalized name match — the same real-world person may appear unlinked under different name spellings.',
          'Expenditures (who got paid) are not yet available in the explorer.',
        ]}
      />
    </main>
  );
}
