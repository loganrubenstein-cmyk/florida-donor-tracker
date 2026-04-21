import { getDb } from '@/lib/db';
import DiffBars from '@/components/compare/DiffBars';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Compare Candidates — Florida Influence',
  description: 'Two Florida candidates, side-by-side. Hard money, soft money, contributions, average donation, and corporate share.',
};

const FIELDS = 'acct_num, candidate_name, office_desc, election_year, party_code, total_combined, hard_money_total, hard_corporate_total, hard_individual_total, hard_num_contributions, soft_money_total';

async function fetchCandidate(db, acct) {
  if (!acct) return null;
  const { data } = await db.from('candidates').select(FIELDS).eq('acct_num', String(acct)).limit(1);
  return data?.[0] ?? null;
}

export default async function ComparePage({ searchParams }) {
  const db = getDb();
  const aParam = searchParams?.a || '79799'; // DeSantis 2022
  const bParam = searchParams?.b || '79408'; // Crist 2022

  const [a, b] = await Promise.all([
    fetchCandidate(db, aParam),
    fetchCandidate(db, bParam),
  ]);

  if (!a || !b) {
    return (
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '3rem 2.5rem' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', color: 'var(--text)' }}>Compare candidates</h1>
        <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', marginTop: '1rem' }}>
          Couldn&apos;t find one or both candidates. Pass two valid account numbers: <code>/compare?a=79799&amp;b=79408</code>.
        </p>
      </main>
    );
  }

  return (
    <main>
      <DiffBars a={a} b={b} />
    </main>
  );
}
