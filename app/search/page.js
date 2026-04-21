import SearchView from '@/components/search/SearchView';
import { Suspense } from 'react';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Search',
  description: 'Search across all Florida political donors, committees, candidates, lobbyists, and principals',
};

export default function SearchPage() {
  return (
    <Suspense fallback={
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '4rem 2rem', textAlign: 'center' }}>
        <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
          Loading…
        </div>
      </main>
    }>
      <SearchView />
    </Suspense>
  );
}
