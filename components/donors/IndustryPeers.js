import { getDb } from '@/lib/db';
import { fmtMoneyCompact } from '@/lib/fmt';
import Link from 'next/link';

export default async function IndustryPeers({ industry, currentSlug }) {
  if (!industry || industry === 'Other' || industry === 'Not Employed') return null;

  const db = getDb();
  const { data } = await db.from('donors')
    .select('slug, name, total_combined')
    .eq('industry', industry)
    .neq('slug', currentSlug)
    .order('total_combined', { ascending: false })
    .limit(5);

  if (!data?.length) return null;

  return (
    <div style={{ marginTop: '1rem' }}>
      <div style={{
        fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.1em', marginBottom: '0.5rem',
      }}>
        Other top {industry} donors
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        {data.map(d => (
          <div key={d.slug} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '0.3rem 0.5rem', borderRadius: '3px',
          }}>
            <Link href={`/donor/${d.slug}`} style={{
              fontSize: '0.72rem', color: 'var(--text)', textDecoration: 'none',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }}>
              {d.name}
            </Link>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', flexShrink: 0, marginLeft: '0.5rem' }}>
              {fmtMoneyCompact(d.total_combined)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
