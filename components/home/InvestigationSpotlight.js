import Link from 'next/link';

const FEATURED = [
  {
    name: 'Florida Power & Light',
    href: '/donor/florida-power-light-company',
    amount: '$72M+',
    label: 'in FL political giving',
    issues: ['Energy regulation', 'Rate bills', 'Utility policy'],
    headline: 'The utility that owns Florida politics',
    color: 'var(--orange)',
  },
  {
    name: 'US Sugar Corporation',
    href: '/donor/united-states-sugar-corporation',
    amount: '$32M+',
    label: 'in campaign contributions',
    issues: ['Water policy', 'Everglades', 'Agriculture'],
    headline: 'The sugar company and the Everglades',
    color: 'var(--teal)',
  },
  {
    name: 'Trulieve Inc.',
    href: '/donor/trulieve-inc',
    amount: '$72M+',
    label: 'in FL political giving',
    issues: ['Cannabis licensing', 'Ballot initiatives'],
    headline: 'The cannabis company that funded its own regulation',
    color: 'var(--green)',
  },
];

export default function InvestigationSpotlight() {
  return (
    <section style={{ maxWidth: '1140px', margin: '0 auto', padding: '2.25rem 2.5rem', borderBottom: '1px solid rgba(100,140,220,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.7rem', letterSpacing: '0.14em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
          Follow the story
        </div>
        <Link href="/investigations" style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textDecoration: 'none' }}>
          all investigations →
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
        {FEATURED.map(inv => (
          <Link key={inv.name} href={inv.href} style={{ textDecoration: 'none' }}>
            <div style={{
              border: `1px solid ${inv.color}22`,
              background: `${inv.color}04`,
              borderRadius: '4px',
              padding: '1.1rem 1.2rem',
              height: '100%',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem' }}>
                <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: inv.color }}>
                  Investigation
                </div>
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {inv.issues.slice(0, 2).map(i => (
                    <span key={i} style={{ fontSize: '0.55rem', background: `${inv.color}14`, color: inv.color, padding: '0.1rem 0.4rem', borderRadius: '2px' }}>
                      {i}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, marginBottom: '0.5rem' }}>
                {inv.headline}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>
                {inv.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: inv.color, fontFamily: 'var(--font-mono)' }}>
                  {inv.amount}
                </span>
                <span style={{ fontSize: '0.63rem', color: 'var(--text-dim)' }}>{inv.label}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
