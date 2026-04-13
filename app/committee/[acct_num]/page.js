import { loadCommittee } from '@/lib/loadCommittee';
import { loadAnnotations } from '@/lib/loadAnnotations';
import CommitteeProfile from '@/components/committee/CommitteeProfile';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';

// Server-rendered on demand — no static file dependency
export const dynamic = 'force-dynamic';

async function loadLinkedCandidates(acctNum) {
  const db = getDb();
  const { data } = await db
    .from('candidate_pc_links')
    .select('candidate_acct_num, link_type, candidates(candidate_name, office_desc, election_year)')
    .eq('pc_acct_num', String(acctNum));

  return (data || []).map(r => ({
    acct_num:  r.candidate_acct_num,
    link_type: r.link_type,
    name:      r.candidates?.candidate_name || null,
    office:    r.candidates?.office_desc    || null,
    year:      r.candidates?.election_year  || null,
  }));
}

export async function generateMetadata({ params }) {
  const { acct_num } = await params;
  try {
    const data = await loadCommittee(acct_num);
    const { fmtMoneyCompact } = await import('@/lib/fmt');
    const raised = data.total_received || 0;
    const desc = `${data.committee_name} — Florida political committee.${raised > 0 ? ` ${fmtMoneyCompact(raised)} raised.` : ''}`;
    return { title: data.committee_name, description: desc };
  } catch {
    return { title: 'Committee' };
  }
}

export default async function CommitteePage({ params }) {
  const { acct_num } = await params;

  let data;
  try {
    data = await loadCommittee(acct_num);
  } catch {
    notFound();
  }

  const [annotations, linkedCandidates] = await Promise.all([
    Promise.resolve(loadAnnotations()),
    loadLinkedCandidates(acct_num),
  ]);

  return <CommitteeProfile
    data={data}
    annotations={annotations}
    linkedCandidates={linkedCandidates}
    expenditures={data.expenditures}
    byYear={data.by_year || []}
  />;
}
