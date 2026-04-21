import HeroReveal from '@/components/home/HeroReveal'
import AnalysisHub from '@/components/home/AnalysisHub'
import EmailStrip from '@/components/home/EmailStrip'
import RecentContributions from '@/components/home/RecentContributions'
import { getDb } from '@/lib/db'
import { FEDERAL_OFFICE_CODES } from '@/lib/officeCodes'
import { DATA_LAST_UPDATED } from '@/lib/dataLastUpdated'
import Link from 'next/link'

export const dynamic = 'force-dynamic';

export const metadata = {
  title: { absolute: 'Florida Influence — Follow the Money in Florida Politics' },
  description: 'Track billions in Florida political contributions, lobbying, and shadow PACs. Search donors, committees, candidates, and every campaign transaction from 1996 to 2026.',
};

async function getHomeData() {
  const db = getDb();
  const [
    { count: candidateCount },
    { count: committeeCount },
    { count: donorCount },
    { data: donorAgg },
    { count: contributionCount },
  ] = await Promise.all([
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
    candidateCount: candidateCount || 7172,
    committeeCount: committeeCount || 5974,
    totalSpending,
    totalContributions,
    totalDonors,
    updatedDate: DATA_LAST_UPDATED,
  };
}

const DEPTH_STATS = [
  { val: '$3.9B+', color: 'var(--orange)', detail: 'campaign contributions · 22M transactions · 883K donors · 1996–2026' },
  { val: '$34.9B', color: 'var(--teal)',   detail: 'lobbying compensation · 4M rows · 2,473 lobbyists · 19 years' },
  { val: '160',    color: 'var(--green)',  detail: 'current FL legislators · donors · votes · lobbyist connections · disclosures' },
  { val: '431',    color: 'var(--blue)',   detail: 'shadow PAC orgs · 56K+ committee pairs' },
];

const RACES_2026 = [
  { office: 'Governor',         note: 'Open seat — DeSantis term-limited',                              raised: '$8.6M+', pacs: 4, lead: 'Byron Donalds',   leadAmt: '$7.6M', color: 'var(--teal)',   href: '/race/governor/2026' },
  { office: 'U.S. Senate',      note: 'Special election — Moody appointed after Rubio named Sec. of State', raised: '$3.2M+', pacs: 4, lead: 'Ashley Moody', leadAmt: '$3.2M', color: 'var(--orange)', href: '/federal' },
  { office: 'Attorney General', note: 'Moody vacated for Senate run',                                   raised: '$1.9M+', pacs: 2, lead: 'James Uthmeier', leadAmt: '$1.4M', color: 'var(--blue)',   href: '/race/attorney-general/2026' },
];

export default async function Home() {
  const { candidateCount, committeeCount, totalSpending, totalContributions, totalDonors, updatedDate } = await getHomeData();

  return (
    <main>
      {/* ── Hero ── */}
      <HeroReveal updatedDate={updatedDate} />

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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700, color: race.color }}>{race.raised}</span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{race.pacs} PACs affiliated</span>
                </div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  Leading: <span style={{ color: 'var(--text)' }}>{race.lead}</span> · {race.leadAmt}
                </div>
              </div>
            </a>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {[
            { href: '/races/2026',  label: '→ all 2026 races',           color: 'var(--teal)'     },
            { href: '/who-funds',  label: '→ who funds your district',   color: 'var(--teal)'     },
            { href: '/flow',       label: '→ money + lobbying combined', color: 'var(--orange)'   },
            { href: '/follow',     label: '→ follow the money trail',    color: 'var(--blue)'     },
            { href: '/donors',     label: '→ browse all donors',         color: 'var(--text-dim)' },
          ].map(l => (
            <a key={l.label} href={l.href} style={{ fontSize: '0.7rem', color: l.color, textDecoration: 'none', border: `1px solid ${l.color}33`, borderRadius: '3px', padding: '0.35rem 0.75rem' }}>
              {l.label}
            </a>
          ))}
        </div>
      </section>

      {/* ── Recent Contributions ── */}
      <RecentContributions />

      {/* ── Analysis Hub ── */}
      <AnalysisHub />

      {/* ── Email Alert Strip ── */}
      <EmailStrip />
    </main>
  )
}
