import { readFileSync } from 'fs';
import { join } from 'path';
import { loadCommittee, listCommitteeAcctNums } from '@/lib/loadCommittee';
import { loadAnnotations } from '@/lib/loadAnnotations';
import CommitteeProfile from '@/components/committee/CommitteeProfile';

export const dynamic = 'force-dynamic';

let _pcLinksReverse = null;
let _candidateNames = null;

function loadPcLinksReverse() {
  if (_pcLinksReverse) return _pcLinksReverse;
  const DATA = join(process.cwd(), 'public', 'data');
  try {
    const links = JSON.parse(readFileSync(join(DATA, 'candidate_pc_links.json'), 'utf-8'));
    const rev = {};
    for (const [cand_acct, pcs] of Object.entries(links)) {
      for (const pc of pcs) {
        const k = String(pc.pc_acct);
        if (!rev[k]) rev[k] = [];
        rev[k].push({ acct_num: cand_acct, link_type: pc.link_type });
      }
    }
    _pcLinksReverse = rev;
  } catch {
    _pcLinksReverse = {};
  }
  return _pcLinksReverse;
}

function loadCandidateNames() {
  if (_candidateNames) return _candidateNames;
  const DATA = join(process.cwd(), 'public', 'data');
  try {
    const stats = JSON.parse(readFileSync(join(DATA, 'candidate_stats.json'), 'utf-8'));
    _candidateNames = Object.fromEntries(stats.map(c => [String(c.acct_num), {
      name: c.candidate_name, office: c.office_desc, year: c.election_year
    }]));
  } catch {
    _candidateNames = {};
  }
  return _candidateNames;
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

  // Linked candidates (committees that are "PCs" for candidates)
  const reverse = loadPcLinksReverse();
  const names   = loadCandidateNames();
  const linkedCandidates = (reverse[String(acct_num)] || []).map(r => ({
    ...r,
    ...(names[r.acct_num] || {}),
  }));

  return <CommitteeProfile data={data} annotations={annotations} linkedCandidates={linkedCandidates} />;
}
