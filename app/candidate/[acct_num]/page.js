import { loadCandidate, loadCandidateCycles } from '@/lib/loadCandidate';
import CandidateProfile from '@/components/candidate/CandidateProfile';
import { notFound } from 'next/navigation';

// Server-rendered on demand — no static file dependency
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { acct_num } = await params;
  try {
    const data = await loadCandidate(acct_num);
    const name = data.candidate_name || `Account ${acct_num}`;
    return { title: `${name} | FL Donor Tracker` };
  } catch {
    return { title: 'Candidate | FL Donor Tracker' };
  }
}

export default async function CandidatePage({ params }) {
  const { acct_num } = await params;
  let data;
  try {
    data = await loadCandidate(acct_num);
  } catch {
    notFound();
  }
  const cycles = loadCandidateCycles(acct_num);
  return <CandidateProfile data={data} cycles={cycles} />;
}
