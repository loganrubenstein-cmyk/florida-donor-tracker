import DonorTable from '@/components/donors/DonorTable'
import FloridaOutline from '@/components/shared/FloridaOutline'
import HeroCounter from '@/components/home/HeroCounter'
import AnimatedStat from '@/components/shared/AnimatedStat'
import MoneyClock from '@/components/home/MoneyClock'
import DidYouKnow from '@/components/home/DidYouKnow'
import MoneyLens from '@/components/shared/MoneyLens'
import HomeToolTabs from '@/components/home/HomeToolTabs'
import EmailStrip from '@/components/home/EmailStrip'
import InvestigationSpotlight from '@/components/home/InvestigationSpotlight'
import { getDb } from '@/lib/db'
import { FEDERAL_OFFICE_CODES } from '@/lib/officeCodes'
import { DATA_LAST_UPDATED } from '@/lib/dataLastUpdated'
import PulseSection from '@/components/home/PulseSection'
import Link from 'next/link'

export const dynamic = 'force-dynamic';

export const metadata = {
  title: { absolute: 'Florida Influence — Follow the Money in Florida Politics' },
  description: 'Track billions in Florida political contributions, lobbying, and shadow PACs. Search donors, committees, candidates, and every campaign transaction from 1996 to 2026.',
};

async function getHomeData() {
  const db = getDb();
  const [
    { data: topDonorsData },
    { count: candidateCount },
    { count: committeeCount },
    { count: donorCount },
    { data: donorAgg },
    { count: contributionCount },
  ] = await Promise.all([
    db.from('donors').select('slug, name, is_corporate, total_combined, total_soft, total_hard, num_contributions').order('total_combined', { ascending: false }).limit(100),
    db.from('candidates').select('*', { count: 'exact', head: true }).not('office_code', 'in', `(${[...FEDERAL_OFFICE_CODES].join(',')})`),
    db.from('committees').select('*', { count: 'exact', head: true }),
    db.from('donors').select('*', { count: 'exact', head: true }),
    db.from('donors').select('total_combined.sum()').single(),
    db.from('contributions').select('*', { count: 'exact', head: true }),
  ]);

  const totalSpending = donorAgg?.sum ?? 3894316430;
  const totalDonors = donorCount ?? 883681;
  const totalContributions = contributionCount ?? 21955118;

  return {
    topDonors: topDonorsData || [],
    candidateCount: candidateCount || 7172,
    committeeCount: committeeCount || 5974,
    totalSpending,
    totalContributions,
    totalDonors,
    updatedDate: DATA_LAST_UPDATED,
  };
}

const PILLS = [
  { label: 'Campaign Finance',      color: 'var(--text)',     bg: 'rgba(200,216,240,0.07)',  border: 'rgba(200,216,240,0.15)' },
  { label: '$34.9B Lobbying',       color: 'var(--teal)',     bg: 'rgba(77,216,240,0.08)',   border: 'rgba(77,216,240,0.2)'   },
  { label: 'Official Disclosures',  color: 'var(--blue)',     bg: 'rgba(160,192,255,0.07)',  border: 'rgba(160,192,255,0.18)' },
  { label: 'Shadow PAC Networks',   color: 'var(--gold)',     bg: 'rgba(255,208,96,0.07)',   border: 'rgba(255,208,96,0.18)'  },
  { label: 'Legislature',           color: 'var(--text-dim)', bg: 'transparent',             border: 'var(--border)'          },
];

const DEPTH_STATS = [
  { val: '$3.9B+', color: 'var(--orange)', detail: 'campaign contributions · 22M transactions · 883K donors · 1996–2026' },
  { val: '$34.9B', color: 'var(--teal)',   detail: 'lobbying compensation · 4M rows · 2,473 lobbyists · 19 years' },
  { val: '160',    color: 'var(--green)',  detail: 'current FL legislators · donors · votes · lobbyist connections · disclosures' },
  { val: '431',    color: 'var(--blue)',   detail: 'shadow PAC orgs · 56K+ committee pairs' },
];

const RACES_2026 = [
  { office: 'Governor',         note: 'Open seat — DeSantis term-limited',      raised: '$4.2M+', pacs: 3, color: 'var(--teal)',   href: '/races/2026', pct: 62 },
  { office: 'U.S. Senate',      note: 'Rubio up for re-election 2028',           raised: '$8.1M+', pacs: 5, color: 'var(--orange)', href: '/races/2026', pct: 78 },
  { office: 'Attorney General', note: 'Moody vacated for Senate run',            raised: '$2.4M+', pacs: 2, color: 'var(--blue)',   href: '/races/2026', pct: 44 },
];

export default async function Home() {
  const { topDonors, candidateCount, committeeCount, totalSpending, totalContributions, totalDonors, updatedDate } = await getHomeData();
  const meta = {
    grand_totals: { total_political_spending_tracked: totalSpending },
    campaign_finance: { total_donors: totalDonors },
    committees: { total_committees: committeeCount },
    candidates: { total_candidates: candidateCount },
  };

  return (
    <main>
      {/* ── Hero ── */}
      <section style={{
        padding: '3.5rem 2.5rem 2.75rem',
        borderBottom: '1px solid rgba(100,140,220,0.1)',
        maxWidth: '1140px',
        margin: '0 auto',
        position: 'relative',
      }}>
        <div className="star-field" />

        <div className="hero-2col">
          {/* Left column */}
          <div>
            <h1 style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'clamp(1.9rem, 4.5vw, 3rem)',
              lineHeight: 1.1,
              color: 'var(--text)',
              fontWeight: 400,
              marginBottom: '1.1rem',
            }}>
              Follow the money<br />
              <span style={{ color: 'var(--orange)' }}>and influence</span><br />
              in Florida politics.
            </h1>

            <p style={{ fontSize: '0.9rem', color: 'var(--text)', opacity: 0.75, marginBottom: '1.25rem', maxWidth: '520px', lineHeight: 1.75 }}>
              Follow the money. Connect the dots. Track every vote, lobbyist, and legislator. From campaign donations to contracts — the most complete picture of Florida political influence, free from public records.
            </p>

            {/* Differentiator pills */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
              {PILLS.map(p => (
                <span key={p.label} style={{
                  fontSize: '0.65rem', padding: '0.25rem 0.65rem', borderRadius: '2px',
                  color: p.color, background: p.bg, border: `1px solid ${p.border}`,
                  fontFamily: 'var(--font-mono)',
                }}>
                  {p.label}
                </span>
              ))}
            </div>

            <MoneyClock />

            {/* Search */}
            <form action="/search" method="GET" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', maxWidth: '500px' }}>
              <input
                type="text"
                name="q"
                placeholder="Search donors, candidates, committees, lobbyists…"
                style={{
                  flex: 1,
                  background: 'rgba(8,8,24,0.8)',
                  border: '1px solid rgba(100,140,220,0.35)',
                  color: 'var(--text)',
                  padding: '0.6rem 0.9rem',
                  fontSize: '0.78rem',
                  borderRadius: '3px',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                }}
              />
              <button type="submit" style={{
                background: 'var(--orange)', color: '#01010d',
                border: 'none', padding: '0.6rem 1.1rem',
                fontSize: '0.75rem', fontWeight: 700,
                fontFamily: 'var(--font-sans)', borderRadius: '3px',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
                Search
              </button>
            </form>

            {/* CTAs */}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
              <a href="/influence" style={{ border: '1px solid rgba(255,176,96,0.3)', color: 'var(--orange)', padding: '0.5rem 1.2rem', fontSize: '0.72rem', borderRadius: '3px', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>
                → influence index
              </a>
              <a href="/follow" style={{ border: '1px solid rgba(77,216,240,0.3)', color: 'var(--teal)', padding: '0.5rem 1.2rem', fontSize: '0.72rem', borderRadius: '3px', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>
                → follow the money
              </a>
              <a href="/races/2026" style={{ border: '1px solid rgba(128,255,160,0.3)', color: 'var(--green)', padding: '0.5rem 1.2rem', fontSize: '0.72rem', borderRadius: '3px', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>
                → 2026 races
              </a>
              <a href="/legislature" style={{ border: '1px solid rgba(160,192,255,0.25)', color: 'var(--blue)', padding: '0.5rem 1.2rem', fontSize: '0.72rem', borderRadius: '3px', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>
                → legislature
              </a>
            </div>

            <DidYouKnow />
          </div>

          {/* Right column — FL outline + stamp */}
          <div className="hide-mobile" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '1rem' }}>
            <FloridaOutline size="hero" style={{ opacity: 0.9 }} />
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.65rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              border: '1px solid var(--orange)',
              color: 'var(--orange)',
              padding: '0.4rem 0.75rem',
              marginTop: '1.25rem',
              animation: 'stamp-press 0.55s cubic-bezier(0.22,0.61,0.36,1) 0.8s both',
              display: 'inline-block',
            }}>
              florida: a sunny place for shady people.
            </div>
          </div>
        </div>

        <div style={{ marginTop: '0.6rem', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
          Updated {updatedDate}
        </div>
      </section>

      {/* ── Pulse ── */}
      <section style={{ maxWidth: '1140px', margin: '0 auto', padding: '1.5rem 2.5rem 0' }}>
        <PulseSection />
      </section>

      {/* ── Stats Strip ── */}
      <section style={{ padding: '1.75rem 2.5rem', borderBottom: '1px solid rgba(100,140,220,0.1)', background: 'rgba(255,255,255,0.01)', maxWidth: '1140px', margin: '0 auto' }}>
        <div className="rg-4" style={{ gap: '1.5rem' }}>
          {[
            { rawValue: meta.grand_totals?.total_political_spending_tracked ?? 0, format: 'billions', label: 'total political spending tracked', color: 'var(--orange)', lens: true },
            { rawValue: meta.campaign_finance?.total_donors ?? 0,                  format: 'count',    label: 'deduped donor profiles',        color: 'var(--teal)'   },
            { rawValue: meta.committees?.total_committees ?? 0,                    format: 'count',    label: 'committees tracked',            color: 'var(--green)'  },
            { rawValue: meta.candidates?.total_candidates ?? 0,                    format: 'count',    label: 'candidates tracked',            color: 'var(--blue)'   },
          ].map(({ rawValue, format, label, color, lens }) => (
            <div key={label}>
              <div style={{ fontSize: '1.65rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
                {lens
                  ? <MoneyLens value={rawValue}><AnimatedStat value={rawValue} format={format} color={color} /></MoneyLens>
                  : <AnimatedStat value={rawValue} format={format} color={color} />
                }
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.4rem', lineHeight: 1.5 }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Depth Differentiator ── */}
      <section style={{ padding: '2.5rem 2.5rem', borderBottom: '1px solid rgba(100,140,220,0.1)', maxWidth: '1140px', margin: '0 auto' }}>
        <div style={{ fontSize: '0.7rem', letterSpacing: '0.14em', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '1.5rem' }}>
          Why Florida Influence is different
        </div>
        <div className="rg-4" style={{ gap: '1.5rem' }}>
          {DEPTH_STATS.map(s => (
            <div key={s.val} style={{ borderLeft: `2px solid ${s.color}44`, paddingLeft: '1rem' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: s.color, marginBottom: '0.4rem', letterSpacing: '-0.01em' }}>
                {s.val}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
                {s.detail}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Email Alert Strip ── */}
      <EmailStrip />

      {/* ── 2026 Cycle ── */}
      <section style={{ padding: '2.5rem 2.5rem', borderBottom: '1px solid rgba(100,140,220,0.1)', maxWidth: '1140px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}>
          <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'rgba(77,216,240,0.1)', color: 'var(--teal)', border: '1px solid rgba(77,216,240,0.25)', padding: '0.2rem 0.6rem', borderRadius: '2px' }}>
            Live · 2026 Cycle
          </span>
        </div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.35rem', fontWeight: 400, marginBottom: '1.5rem', color: 'var(--text)' }}>
          The races that will decide Florida
        </div>

        <div className="rg-3" style={{ gap: '1rem', marginBottom: '1.75rem' }}>
          {RACES_2026.map(race => (
            <a key={race.office} href={race.href} style={{ textDecoration: 'none' }}>
              <div style={{ border: `1px solid ${race.color}22`, background: `${race.color}05`, borderRadius: '4px', padding: '1.25rem 1.35rem' }}>
                <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: race.color, marginBottom: '0.5rem' }}>
                  {race.office}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: '0.75rem' }}>
                  {race.note}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700, color: race.color }}>{race.raised}</span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{race.pacs} PACs affiliated</span>
                </div>
                <div style={{ marginTop: '0.75rem', height: '3px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${race.pct}%`, height: '100%', background: race.color, opacity: 0.6 }} />
                </div>
              </div>
            </a>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {[
            { href: '/races/2026', label: '→ all 2026 races',           color: 'var(--teal)'     },
            { href: '/district',   label: '→ who funds your district',   color: 'var(--teal)'     },
            { href: '/flow',       label: '→ money + lobbying combined', color: 'var(--orange)'   },
            { href: '/follow',     label: '→ hard vs. soft money',       color: 'var(--blue)'     },
            { href: '/candidates', label: '→ out-of-state donors',       color: 'var(--text-dim)' },
          ].map(l => (
            <a key={l.label} href={l.href} style={{ fontSize: '0.7rem', color: l.color, textDecoration: 'none', border: `1px solid ${l.color}33`, borderRadius: '3px', padding: '0.35rem 0.75rem' }}>
              {l.label}
            </a>
          ))}
        </div>
      </section>

      {/* ── Investigation Spotlight ── */}
      <InvestigationSpotlight />

      {/* ── Tools (tabbed) ── */}
      <section style={{ padding: '2.25rem 2.5rem', borderBottom: '1px solid rgba(100,140,220,0.1)', maxWidth: '1140px', margin: '0 auto' }}>
        <div style={{ fontSize: '0.7rem', letterSpacing: '0.14em', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '1.25rem' }}>
          Explore the data
        </div>
        <HomeToolTabs />
      </section>

      {/* ── Donor Table ── */}
      <section id="donors" style={{ padding: '2.5rem 2.5rem 3rem', maxWidth: '1140px', margin: '0 auto' }}>
        <DonorTable donors={topDonors} />
      </section>
    </main>
  )
}
