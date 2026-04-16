import { getDb } from '@/lib/db';
import DonorOverlap from '@/components/tools/DonorOverlap';

export const metadata = {
  title: 'Compare Candidates & Committees',
  description: 'Compare any two Florida candidates or committees — shared donors, industry funding sources, and who backs only one side.',
};

async function fetchEntity(db, acct) {
  const { data: cand } = await db.from('candidates')
    .select('acct_num, candidate_name, office_desc, election_year, party_code')
    .eq('acct_num', acct)
    .maybeSingle();

  if (cand) {
    return {
      acct_num: cand.acct_num,
      name: cand.candidate_name,
      type: 'candidate',
      detail: [cand.office_desc, cand.election_year, cand.party_code].filter(Boolean).join(' · '),
    };
  }

  const { data: comm } = await db.from('committees')
    .select('acct_num, committee_name, total_received')
    .eq('acct_num', acct)
    .maybeSingle();

  if (comm) {
    return {
      acct_num: comm.acct_num,
      name: comm.committee_name,
      type: 'committee',
      detail: comm.total_received ? `$${(comm.total_received / 1e6).toFixed(1)}M raised` : '',
    };
  }

  return null;
}

export default async function ComparePage({ searchParams }) {
  const db = getDb();

  const aParam = searchParams?.a;
  const bParam = searchParams?.b;

  // Default comparison: DeSantis (79799) vs Crist (79408) — 2022 governor's race
  const DEFAULT_A = '79799';
  const DEFAULT_B = '79408';

  const [initialEntityA, initialEntityB] = await Promise.all([
    fetchEntity(db, aParam || DEFAULT_A),
    fetchEntity(db, bParam || DEFAULT_B),
  ]);

  return <DonorOverlap initialEntityA={initialEntityA} initialEntityB={initialEntityB} />;
}
