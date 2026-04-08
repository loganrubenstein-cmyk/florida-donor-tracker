import { loadCandidate, listCandidateAcctNums } from '@/lib/loadCandidate';
import CandidateProfile from '@/components/candidate/CandidateProfile';

export const dynamic = 'force-static';

export async function generateStaticParams() {
  return listCandidateAcctNums().map(acct_num => ({ acct_num }));
}

export async function generateMetadata({ params }) {
  const { acct_num } = await params;
  const data = loadCandidate(acct_num);
  const name = data.candidate_name || `Account ${acct_num}`;
  return { title: `${name} | FL Donor Tracker` };
}

export default async function CandidatePage({ params }) {
  const { acct_num } = await params;
  const data = loadCandidate(acct_num);
  return <CandidateProfile data={data} />;
}
