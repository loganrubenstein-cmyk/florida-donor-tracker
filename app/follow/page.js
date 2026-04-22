import dynamic from 'next/dynamic';
import Link from 'next/link';
import TrustRibbon from '@/components/shared/TrustRibbon';

const FollowExplorer = dynamic(() => import('@/components/follow/FollowExplorer'), { ssr: false });

export const metadata = {
  title: 'Follow the Money',
  description: 'Trace any donor\'s money through Florida political committees to candidates and their legislative votes.',
};

const CHAIN_STEPS = [
  { label: 'Donor',     color: 'var(--orange)', desc: 'Individual, corporation, or PAC' },
  { label: 'Committee', color: 'var(--teal)',   desc: 'PAC, ECO, party account' },
  { label: 'Candidate', color: 'var(--blue)',   desc: 'Campaign account recipient' },
  { label: 'Vote',      color: 'var(--green)',  desc: 'Legislative roll call' },
];

const NOTABLE = [
  { donor: 'Florida Power & Light', slug: 'florida-power-light-company',     note: 'Utility giant — energy regulation, rate bills' },
  { donor: 'Florida Realtors',      slug: 'florida-realtors',                note: 'Largest PAC in FL — housing, property tax' },
  { donor: 'Publix',                slug: 'publix-super-markets-inc',        note: 'Grocery chain — minimum wage, food safety' },
  { donor: 'Disney',                slug: 'walt-disney-parks-and-resorts-us', note: 'Entertainment — Reedy Creek, tourism policy' },
  { donor: 'US Sugar',              slug: 'us-sugar',                        note: 'Agriculture — water policy, Everglades' },
  { donor: 'NextEra Energy',        slug: 'nextera-energy-capital-holdings-inc', note: 'FPL parent — clean energy, rate regulation' },
];

export default async function FollowPage({ searchParams }) {
  const params = await searchParams;
  const preloadSlug = params?.donor || null;

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 2.5rem 5rem' }}>
      <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)', marginBottom: '2rem' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <span style={{ color: 'var(--text-dim)' }}>Analysis</span>
        {' / '}
        <span>Follow the Money</span>
      </div>

      {/* Hero + chain diagram */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '4rem', alignItems: 'start', marginBottom: '3rem' }}>
        <div>
          <div style={{
            display: 'inline-block', fontSize: '0.62rem', textTransform: 'uppercase',
            letterSpacing: '0.13em', padding: '0.28rem 0.7rem', borderRadius: '2px',
            marginBottom: '1.25rem', border: '1px solid rgba(255,176,96,0.3)',
            background: 'rgba(255,176,96,0.06)', color: 'var(--orange)',
          }}>
            Money Trail
          </div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '0.9rem', letterSpacing: '-0.015em' }}>
            Follow the money — through PACs,<br />lobbyists, and <span style={{ color: 'var(--orange)', fontStyle: 'italic' }}>shadow networks.</span>
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.75, maxWidth: '500px', marginBottom: '2rem' }}>
            Start with any donor, committee, or candidate and trace the full money trail — upstream contributors, downstream transfers, and the legislative votes that follow the dollars. Exportable to CSV.
          </p>

          {/* Chain flow */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '2rem', flexWrap: 'wrap' }}>
            {CHAIN_STEPS.map((s, i) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ border: `1px solid ${s.color}44`, background: `${s.color}08`, borderRadius: '3px', padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: s.color, fontFamily: 'var(--font-mono)', marginBottom: '0.15rem' }}>{s.label}</div>
                  <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)' }}>{s.desc}</div>
                </div>
                {i < CHAIN_STEPS.length - 1 && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--border)', padding: '0 0.5rem' }}>→</div>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            <Link href="/tools/journalists" style={{ fontSize: '0.72rem', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.4rem 0.75rem', textDecoration: 'none' }}>
              → All investigative tools
            </Link>
            <Link href="/connections" style={{ fontSize: '0.72rem', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.4rem 0.75rem', textDecoration: 'none' }}>
              → Committee connections
            </Link>
          </div>
          <TrustRibbon source="FL Division of Elections · Linked via shared treasurers" updated="Apr 14, 2026" confidence="normalized" />
        </div>

        {/* Notable donors sidebar */}
        <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '1.25rem', background: 'var(--surface)' }}>
          <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
            Notable donors to trace
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {NOTABLE.map((n, i) => (
              <Link key={n.slug} href={`/follow?donor=${n.slug}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  padding: '0.6rem 0.5rem',
                  borderBottom: i < NOTABLE.length - 1 ? '1px solid rgba(100,140,220,0.08)' : 'none',
                }}>
                  <div style={{ fontSize: '0.73rem', color: 'var(--orange)', fontWeight: 600, marginBottom: '0.1rem' }}>{n.donor}</div>
                  <div style={{ fontSize: '0.64rem', color: 'var(--text-dim)', lineHeight: 1.4 }}>{n.note}</div>
                </div>
              </Link>
            ))}
          </div>
          <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.75rem', paddingTop: '0.75rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {[
                { val: '883K', label: 'donor profiles' },
                { val: '5,974', label: 'committees tracked' },
                { val: '22M+', label: 'transactions' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '0.64rem', color: 'var(--text-dim)' }}>{s.label}</span>
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: '0.95rem', color: 'var(--orange)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>{s.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* The actual explorer tool */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
        <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.13em', color: 'var(--text-dim)', marginBottom: '1.25rem' }}>
          Trace the money
        </div>
        <FollowExplorer preloadSlug={preloadSlug} />
      </div>
    </main>
  );
}
