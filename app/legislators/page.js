import { Suspense } from 'react';
import LegislatorsList from '@/components/legislators/LegislatorsList';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Florida Legislators',
  description: 'All 160 current Florida House and Senate members — voting records, campaign finance, committee assignments.',
};

export default function LegislatorsPage() {
  return (
    <Suspense>
      <LegislatorsList />
    </Suspense>
  );
}
