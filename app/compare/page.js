import { getDb } from '@/lib/db';
import DonorOverlap from '@/components/tools/DonorOverlap';

export const metadata = {
  title: 'Compare Candidates & Committees',
  description: 'Compare any two Florida candidates or committees — shared donors, industry funding sources, and who backs only one side.',
};

export default async function ComparePage({ searchParams }) {
  let initialEntityA = null;
  const aParam = searchParams?.a;

  if (aParam) {
    const db = getDb();
    const { data: cand } = await db.from('candidates')
      .select('acct_num, candidate_name, office_desc, election_year, party_code')
      .eq('acct_num', aParam)
      .maybeSingle();

    if (cand) {
      initialEntityA = {
        acct_num: cand.acct_num,
        name: cand.candidate_name,
        type: 'candidate',
        detail: [cand.office_desc, cand.election_year, cand.party_code].filter(Boolean).join(' · '),
      };
    } else {
      const { data: comm } = await db.from('committees')
        .select('acct_num, committee_name, total_received')
        .eq('acct_num', aParam)
        .maybeSingle();
      if (comm) {
        initialEntityA = {
          acct_num: comm.acct_num,
          name: comm.committee_name,
          type: 'committee',
          detail: comm.total_received ? `$${(comm.total_received / 1e6).toFixed(1)}M raised` : '',
        };
      }
    }
  }

  return <DonorOverlap initialEntityA={initialEntityA} />;
}
