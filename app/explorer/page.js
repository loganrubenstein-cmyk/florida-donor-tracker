import { Suspense } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import SectionHeader from '@/components/shared/SectionHeader';

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

      <SectionHeader title="Transaction Explorer" eyebrow="Florida · 10.4M Contributions" />
      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '1.5rem', marginTop: '-0.75rem', maxWidth: '700px' }}>
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
          '~10.4M contribution rows. Deep-link to filtered views: ?recipient_acct=<acct_num>, ?donor_slug=<slug>, ?q=<name>, ?year=<YYYY>, ?amount_min=<n>, ?amount_max=<n>, ?date_start=<YYYY-MM-DD>, ?tx_type=<code>.',
          'Donor profile links are inferred by exact normalized name match — the same real-world person may appear unlinked under different name spellings.',
          'Expenditures (who got paid) are not yet available in the explorer.',
        ]}
      />
    </main>
  );
}
