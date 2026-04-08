import { loadCommittee, listCommitteeAcctNums } from '@/lib/loadCommittee';
import { loadAnnotations } from '@/lib/loadAnnotations';
import CommitteeProfile from '@/components/committee/CommitteeProfile';

export const dynamic = 'force-static';

export async function generateStaticParams() {
  return listCommitteeAcctNums().map(acct_num => ({ acct_num }));
}

export async function generateMetadata({ params }) {
  const { acct_num } = await params;
  const data = loadCommittee(acct_num);
  return { title: `${data.committee_name} | FL Donor Tracker` };
}

export default async function CommitteePage({ params }) {
  const { acct_num } = await params;
  const data = loadCommittee(acct_num);
  const annotations = loadAnnotations();
  return <CommitteeProfile data={data} annotations={annotations} />;
}
