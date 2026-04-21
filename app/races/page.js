import Link from 'next/link';

export const metadata = {
  title: 'Florida Races',
  description: 'Florida election race money — 2026 fundraising leaderboard and historical cycle comparisons going back to 2012.',
};

const CYCLES = [
  { year: 2026, label: '2026', note: 'Active cycle — Governor, Legislature, Cabinet', active: true },
  { year: 2024, label: '2024', note: 'Presidential year — US Senate, all 120 House seats' },
  { year: 2022, label: '2022', note: 'Governor, AG, CFO, Cabinet — DeSantis reelection' },
  { year: 2020, label: '2020', note: 'Presidential year — US Senate, Legislature' },
  { year: 2018, label: '2018', note: 'Governor — DeSantis vs. Gillum' },
  { year: 2016, label: '2016', note: 'Presidential year — US Senate, Legislature' },
  { year: 2014, label: '2014', note: 'Governor — Scott vs. Crist' },
  { year: 2012, label: '2012', note: 'Presidential year — Legislature, US Senate' },
];

const FEATURED_OFFICES = [
  { label: 'Governor',                href: '/races/2026?office=Governor',                desc: 'Statewide — 4-year term' },
  { label: 'Attorney General',        href: '/races/2026?office=Attorney+General',        desc: 'Statewide — Cabinet' },
  { label: 'Chief Financial Officer', href: '/races/2026?office=Chief+Financial+Officer', desc: 'Statewide — Cabinet' },
  { label: 'State Senate',            href: '/races/2026?office=State+Senate',            desc: '20 districts up in 2026' },
  { label: 'State House',             href: '/races/2026?office=State+House',             desc: 'All 120 seats — 2-year term' },
];

export default function RacesIndexPage() {
  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2.5rem 2.5rem 5rem' }}>
      <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)', marginBottom: '2rem' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <span>Races</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '4rem', alignItems: 'start', marginBottom: '3.5rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.5rem, 3vw, 2.1rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '0.9rem' }}>
            Florida races,<br /><span style={{ color: 'var(--teal)' }}>by the money</span>
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.75, maxWidth: '480px', marginBottom: '2rem' }}>
            Fundraising totals for every Florida race, every cycle — Governor, Legislature, Cabinet, and more. See who's leading, who's running, and where the money's coming from.
          </p>

          {/* 2026 featured */}
          <Link href="/races/2026" style={{ textDecoration: 'none', display: 'block', marginBottom: '1.5rem' }}>
            <div style={{
              border: '1px solid rgba(77,216,240,0.25)', background: 'rgba(77,216,240,0.04)',
              borderRadius: '4px', padding: '1.5rem 1.75rem',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1.5rem',
            }}>
              <div>
                <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--teal)', marginBottom: '0.5rem' }}>
                  Active cycle · Live filings
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 400, color: 'var(--teal)', fontFamily: 'var(--font-serif)', marginBottom: '0.3rem' , fontVariantNumeric: 'tabular-nums' }}>
                  → 2026 money race
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                  Governor, Cabinet, Legislature — full leaderboard updated as filings drop
                </div>
              </div>
              <span style={{ fontSize: '0.58rem', textTransform: 'uppercase', background: 'rgba(128,255,160,0.1)', color: 'var(--green)', padding: '0.2rem 0.55rem', borderRadius: '2px', flexShrink: 0, border: '1px solid rgba(128,255,160,0.2)' }}>
                Live
              </span>
            </div>
          </Link>

          {/* 2026 offices */}
          <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.13em', color: 'var(--text-dim)', marginBottom: '0.9rem' }}>
            2026 races by office
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '3rem' }}>
            {FEATURED_OFFICES.map(o => (
              <Link key={o.label} href={o.href} style={{ textDecoration: 'none' }}>
                <div style={{ border: '1px solid var(--border)', borderRadius: '3px', padding: '0.75rem 0.9rem', transition: 'border-color 0.12s' }}>
                  <div style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--teal)', marginBottom: '0.15rem' }}>→ {o.label}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{o.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div>
          <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '1.25rem', background: 'var(--surface)', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
              Quick links
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {[
                { href: '/who-funds', label: '→ Who funds your district' },
                { href: '/cycles',    label: '→ All election cycles' },
                { href: '/elections', label: '→ Historical results 2012–2024' },
                { href: '/candidates', label: '→ All candidates' },
                { href: '/party-finance', label: '→ Party fundraising trends' },
              ].map(l => (
                <Link key={l.href} href={l.href} style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textDecoration: 'none', padding: '0.3rem 0', borderBottom: '1px solid rgba(100,140,220,0.06)' }}>
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Historical cycles */}
      <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.13em', color: 'var(--text-dim)', marginBottom: '1rem' }}>
        Historical cycles
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.6rem' }}>
        {CYCLES.filter(c => !c.active).map(c => (
          <Link key={c.year} href={`/cycle/${c.year}`} style={{ textDecoration: 'none' }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: '3px', padding: '1rem 1.1rem' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 400, color: 'var(--text)', fontFamily: 'var(--font-serif)', marginBottom: '0.3rem' , fontVariantNumeric: 'tabular-nums' }}>{c.year}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>{c.note}</div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
