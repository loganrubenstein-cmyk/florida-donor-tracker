import Link from 'next/link';
import { getDb } from '@/lib/db';
import { notFound } from 'next/navigation';
import { fmtMoneyCompact } from '@/lib/fmt';
import { FEDERAL_OFFICE_CODES } from '@/lib/officeCodes';

export const dynamic = 'force-dynamic';

const PARTY_COLOR = { REP: 'var(--republican)', DEM: 'var(--democrat)', NPA: 'var(--text-dim)' };

export async function generateMetadata({ params }) {
  const { office, year } = await params;
  const label = decodeURIComponent(office).replace(/-/g, ' ');
  return {
    title: `${label} ${year} — Race Tracker`,
    description: `All candidates for ${label} in ${year} with campaign finance data.`,
  };
}

export default async function RacePage({ params }) {
  const { office, year } = await params;
  const officeLabel = decodeURIComponent(office).replace(/-/g, ' ');
  const yearNum     = parseInt(year, 10);

  if (!yearNum || yearNum < 2000 || yearNum > 2030) notFound();

  const db = getDb();
  const federalCodes = [...FEDERAL_OFFICE_CODES];

  const { data, error } = await db
    .from('candidates')
    .select('acct_num, candidate_name, election_year, office_desc, party_code, district, hard_money_total, soft_money_total, total_combined, hard_num_contributions, num_linked_pcs')
    .ilike('office_desc', `%${officeLabel}%`)
    .eq('election_year', yearNum)
    .not('office_code', 'in', `(${federalCodes.join(',')})`)
    .order('total_combined', { ascending: false });

  if (error || !data || data.length === 0) notFound();

  const maxRaised = parseFloat(data[0]?.total_combined) || 1;

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/candidates" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Candidates</Link>
        {' / '}
        <span>{officeLabel} {yearNum}</span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.4rem,3vw,2rem)', fontWeight: 400, color: 'var(--text)', marginBottom: '0.25rem' }}>
        {officeLabel}
      </h1>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '2rem', fontFamily: 'var(--font-mono)' }}>
        Florida · Race Tracker · {yearNum} · {data.length} candidates
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {data.map((c, i) => {
          const total  = parseFloat(c.total_combined) || 0;
          const hard   = parseFloat(c.hard_money_total) || 0;
          const soft   = parseFloat(c.soft_money_total) || 0;
          const barPct = Math.max(2, (total / maxRaised) * 100);
          const color  = PARTY_COLOR[c.party_code] || 'var(--text-dim)';

          return (
            <div key={c.acct_num} style={{ padding: '0.85rem 1rem', border: '1px solid rgba(100,140,220,0.1)', borderRadius: '3px', background: 'var(--bg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', width: '1.4rem', textAlign: 'right' }}>{i + 1}.</span>
                  <Link href={`/candidate/${c.acct_num}`} style={{ color: 'var(--teal)', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600 }}>
                    {c.candidate_name}
                  </Link>
                  <span style={{ fontSize: '0.6rem', padding: '0.05rem 0.35rem', border: `1px solid ${color}44`, color, borderRadius: '2px', fontFamily: 'var(--font-mono)' }}>
                    {c.party_code || 'NPA'}
                  </span>
                  {c.district && (
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)' }}>District {c.district}</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--orange)' }}>{fmtMoneyCompact(total)} total</span>
                  <span style={{ color: 'var(--text-dim)' }}>{fmtMoneyCompact(hard)} hard</span>
                  {soft > 0 && <span style={{ color: 'var(--text-dim)' }}>{fmtMoneyCompact(soft)} soft</span>}
                  <span style={{ color: 'var(--text-dim)' }}>{(c.hard_num_contributions || 0).toLocaleString()} contributions</span>
                </div>
              </div>
              <div style={{ height: '4px', background: 'rgba(100,140,220,0.08)', borderRadius: '2px' }}>
                <div style={{ height: '100%', width: `${barPct}%`, background: color, opacity: 0.6, borderRadius: '2px' }} />
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
