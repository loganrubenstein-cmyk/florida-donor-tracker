import { readFileSync } from 'fs';
import { join } from 'path';
import { loadCandidate, loadCandidateCycles, getPoliticianBySlug } from '@/lib/loadCandidate';
import { getDb } from '@/lib/db';
import { slugify } from '@/lib/slugify';
import CandidateProfile from '@/components/candidate/CandidateProfile';
import { notFound } from 'next/navigation';

let _electionLookup = null;
function getElectionLookup() {
  if (!_electionLookup) {
    try {
      _electionLookup = JSON.parse(
        readFileSync(join(process.cwd(), 'public', 'data', 'elections', 'results_by_acct.json'), 'utf-8')
      );
    } catch { _electionLookup = {}; }
  }
  return _electionLookup;
}

// Server-rendered on demand — no static file dependency
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { acct_num } = await params;
  try {
    const data = await loadCandidate(acct_num);
    const name = data.candidate_name || `Account ${acct_num}`;
    const polSlug = slugify(name);
    const hasPoliticianPage = getPoliticianBySlug(polSlug) !== null;
    const canonical = hasPoliticianPage
      ? `https://florida-donor-tracker.vercel.app/politician/${polSlug}?cycle=${acct_num}`
      : undefined;
    const { fmtMoneyCompact } = await import('@/lib/fmt');
    const party = data.party || '';
    const office = data.office_desc || '';
    const year = data.election_year || '';
    const raised = data.hard_money_total || 0;
    const desc = `${name}${party ? ` (${party})` : ''}${office ? ` — ${office}` : ''}${year ? ` ${year}` : ''}.${raised > 0 ? ` ${fmtMoneyCompact(raised)} raised in direct contributions.` : ''}`;
    return {
      title: name,
      description: desc,
      ...(canonical ? { alternates: { canonical } } : {}),
    };
  } catch {
    return { title: 'Candidate' };
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
  const electionResults = getElectionLookup()[String(acct_num)] || [];

  // If a canonical politician page exists, surface a banner link
  const polSlug = slugify(data.candidate_name || '');
  const politician = getPoliticianBySlug(polSlug);
  const hasMultipleCycles = politician && politician.cycles.length > 1;

  // Check if this candidate is a current FL legislator
  const db = getDb();
  const { data: legRows } = await db
    .from('legislators')
    .select('people_id, chamber, district')
    .eq('acct_num', String(acct_num))
    .limit(1);
  const matchedLeg = legRows?.[0] || null;

  return (
    <>
      {matchedLeg && (
        <div style={{
          background: 'rgba(77,216,240,0.05)', borderBottom: '1px solid rgba(77,216,240,0.15)',
          padding: '0.5rem 2rem', fontSize: '0.68rem', color: 'var(--text-dim)',
          fontFamily: 'var(--font-mono)', textAlign: 'center',
        }}>
          Currently serving · FL {matchedLeg.chamber} District {matchedLeg.district} ·{' '}
          <a href={`/legislator/${matchedLeg.people_id}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
            View legislator profile →
          </a>
        </div>
      )}
      {hasMultipleCycles && (
        <div style={{
          background: 'rgba(77,216,240,0.06)', borderBottom: '1px solid rgba(77,216,240,0.2)',
          padding: '0.5rem 2rem', fontSize: '0.68rem', color: 'var(--text-dim)',
          fontFamily: 'var(--font-mono)', textAlign: 'center',
        }}>
          {politician.cycles.length} election cycles found for this candidate ·{' '}
          <a href={`/politician/${polSlug}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>
            View full profile →
          </a>
        </div>
      )}
      <CandidateProfile data={data} cycles={cycles} electionResults={electionResults} />
    </>
  );
}
