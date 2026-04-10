import { Suspense } from 'react';
import ConnectionsView from '@/components/connections/ConnectionsView';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Committee Connections | FL Donor Tracker',
  description: 'Political committees sharing treasurers, addresses, donors, or money flows',
};

export default function ConnectionsPage() {
  return (
    <Suspense fallback={
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '4rem 2rem', textAlign: 'center' }}>
        <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
          Loading connections…
        </div>
      </main>
    }>
      <ConnectionsView />
    </Suspense>
  );
}
