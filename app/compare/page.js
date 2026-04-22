import Link from 'next/link';
import { getDb } from '@/lib/db';
import DiffBars from '@/components/compare/DiffBars';
import ComparePicker from '@/components/compare/ComparePicker';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Compare Candidates',
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
  const aParam = searchParams?.a || null;
  const bParam = searchParams?.b || null;

  const [a, b] = await Promise.all([
    fetchCandidate(db, aParam),
    fetchCandidate(db, bParam),
  ]);

  return (
    <main style={{ maxWidth: 1140, margin: '0 auto', padding: '2.5rem 2.5rem 3rem' }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '1rem' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/candidates" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Candidates</Link>
        {' / '}
        <span>Compare</span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-dim)', letterSpacing: '0.2em', marginBottom: '0.9rem' }}>
        ◤ TOOL / CANDIDATE COMPARE
      </div>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.9rem, 4.5vw, 3rem)', lineHeight: 1.05, letterSpacing: '-0.022em', color: 'var(--text)', fontWeight: 400, marginBottom: '1rem' }}>
        Two candidates. <em style={{ color: 'var(--orange)' }}>One receipt.</em>
      </h1>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.75, maxWidth: '640px', marginBottom: '1.75rem' }}>
        Every number side-by-side, with the differences called out. Hard money, soft money (affiliated PACs), and what the average donor wrote a check for.
      </p>

      <ComparePicker currentA={a} currentB={b} />

      {a && b ? (
        <DiffBars a={a} b={b} />
      ) : (
        <div style={{ padding: '3rem 0', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-dim)', borderTop: '1px solid var(--border)' }}>
          Select two candidates above to see the comparison.
        </div>
      )}
      <div style={{ marginTop: '2.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: '0.25rem' }}>Also see:</span>
        {[
          { href: '/candidates',  label: 'All Candidates',      color: 'var(--orange)',   border: 'rgba(255,176,96,0.25)'  },
          { href: '/connections', label: 'Committee Connections', color: 'var(--teal)',   border: 'rgba(77,216,240,0.25)'  },
          { href: '/flow',        label: 'Money Flow',          color: 'var(--teal)',     border: 'rgba(77,216,240,0.25)'  },
          { href: '/follow',      label: 'Follow the Money',    color: 'var(--teal)',     border: 'rgba(77,216,240,0.25)'  },
        ].map(({ href, label, color, border }) => (
          <Link key={href} href={href} style={{ fontSize: '0.72rem', color, textDecoration: 'none', border: `1px solid ${border}`, borderRadius: '3px', padding: '0.2rem 0.55rem' }}>
            {label}
          </Link>
        ))}
      </div>
    </main>
  );
}
