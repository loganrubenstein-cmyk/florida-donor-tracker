import CandidatesList from '@/components/candidate/CandidatesList';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Candidates | FL Donor Tracker',
};

export default function CandidatesPage() {
  return <CandidatesList />;
}
