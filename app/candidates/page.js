import { Suspense } from 'react';
import CandidatesList from '@/components/candidate/CandidatesList';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Candidates',
};

export default function CandidatesPage() {
  return (
    <Suspense>
      <CandidatesList />
    </Suspense>
  );
}
