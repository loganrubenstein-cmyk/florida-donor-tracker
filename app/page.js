import DonorTable from '@/components/donors/DonorTable'
import FloridaOutline from '@/components/shared/FloridaOutline'
import HeroCounter from '@/components/home/HeroCounter'
import AnimatedStat from '@/components/shared/AnimatedStat'
import { getDb } from '@/lib/db'
import { FEDERAL_OFFICE_CODES } from '@/lib/officeCodes'
import { DATA_LAST_UPDATED } from '@/lib/dataLastUpdated'

export const dynamic = 'force-dynamic';

export const metadata = {
  title: { absolute: 'Florida Donor Tracker — Follow the Money in Florida Politics' },
  description: 'Track billions in Florida political contributions. Search donors, committees, candidates, lobbyists, and every campaign transaction from 1996 to 2026.',
};

function formatBillions(n) {
  return '$' + (n / 1_000_000_000).toFixed(1) + 'B+'
}

function formatThousands(n) {
  return Math.round(n / 1000) + 'K'
}

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
  const totalDonors = donorCount ?? 336478;
  const totalContributions = contributionCount ?? 10898659;

  return {
    topDonors: topDonorsData || [],
    candidateCount: candidateCount || 4421,
    committeeCount: committeeCount || 1687,
    totalSpending,
    totalContributions,
    totalDonors,
    updatedDate: DATA_LAST_UPDATED,
  };
}

export default async function Home() {
  const { topDonors, candidateCount, committeeCount, totalSpending, totalContributions, totalDonors, updatedDate } = await getHomeData();
  const meta = {
    grand_totals: { total_political_spending_tracked: totalSpending },
    campaign_finance: { total_donors: totalDonors },
    committees: { total_committees: committeeCount },
    candidates: { total_candidates: candidateCount },
    total_contributions: totalContributions,
    total_amount: totalSpending,
    total_committees_with_data: committeeCount,
    generated_at: new Date().toISOString(),
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Florida Donor Tracker',
    url: 'https://florida-donor-tracker.vercel.app',
    description: 'Follow the money in Florida politics',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://florida-donor-tracker.vercel.app/search?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* ── Hero ── */}
      <section className="m-padx" style={{
        padding: '3.5rem 2.5rem 2.5rem',
        borderBottom: '1px solid rgba(100,140,220,0.1)',
        maxWidth: '900px',
        margin: '0 auto',
        position: 'relative',
      }}>
        <div className="star-field" />
        <div style={{
          fontSize: '0.65rem',
          letterSpacing: '0.18em',
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          marginBottom: '1rem',
        }}>
          Florida · 1996–2026 · Public Record
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', marginBottom: '1.5rem' }}>
          <h1 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(2rem, 5vw, 3.2rem)',
            lineHeight: 1.05,
            color: 'var(--text)',
            fontWeight: 400,
            flex: 1,
          }}>
            <HeroCounter total={meta.grand_totals?.total_political_spending_tracked ?? meta.campaign_finance?.estimated_total_contributions ?? 0} />
            <br />raised in Florida<br />politics.
          </h1>
          <FloridaOutline
            size="hero"
            className="hide-mobile"
            style={{ flexShrink: 0, opacity: 0.9 }}
          />
        </div>

        <p style={{
          fontSize: '0.84rem',
          color: 'rgba(200,216,240,0.75)',
          marginBottom: '2rem',
          maxWidth: '520px',
          lineHeight: 1.8,
        }}>
          Connecting the dots to shed light on the Sunshine State —
          who funds Florida&rsquo;s politicians, how the money flows, and what it buys.
        </p>

        {/* Search bar */}
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
              fontSize: '0.75rem',
              borderRadius: '3px',
              fontFamily: 'var(--font-mono)',
              outline: 'none',
            }}
          />
          <button type="submit" style={{
            background: 'var(--orange)',
            color: '#01010d',
            border: 'none',
            padding: '0.6rem 1.1rem',
            fontSize: '0.72rem',
            fontWeight: 700,
            fontFamily: 'var(--font-sans)',
            borderRadius: '3px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}>
            Search
          </button>
        </form>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <a href="#donors" style={{
            background: 'var(--orange)',
            color: '#01010d',
            padding: '0.5rem 1.2rem',
            fontSize: '0.65rem',
            fontWeight: 700,
            fontFamily: 'var(--font-sans)',
            borderRadius: '3px',
            textDecoration: 'none',
            letterSpacing: '0.03em',
          }}>
            Top Donors
          </a>
          <a href="/candidates" style={{
            border: '1px solid rgba(160,192,255,0.3)',
            color: 'var(--blue)',
            padding: '0.5rem 1.2rem',
            fontSize: '0.65rem',
            borderRadius: '3px',
            textDecoration: 'none',
            fontFamily: 'var(--font-mono)',
          }}>
            → candidates
          </a>
          <a href="/flow" style={{
            border: '1px solid rgba(77,216,240,0.3)',
            color: 'var(--teal)',
            padding: '0.5rem 1.2rem',
            fontSize: '0.65rem',
            borderRadius: '3px',
            textDecoration: 'none',
            fontFamily: 'var(--font-mono)',
          }}>
            → flow
          </a>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>
            Updated {updatedDate}
          </span>
        </div>
      </section>

      {/* ── Stats Strip ── */}
      <section className="m-padx" style={{
        padding: '1.75rem 2.5rem',
        borderBottom: '1px solid rgba(100,140,220,0.1)',
        background: 'rgba(255,255,255,0.01)',
        maxWidth: '900px',
        margin: '0 auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }}>
          <div className="rg-4" style={{ gap: '1.5rem', flex: 1 }}>
            {[
              { rawValue: meta.grand_totals?.total_political_spending_tracked ?? 0, format: 'billions', label: 'total political\nspending tracked', color: 'var(--orange)' },
              { rawValue: meta.campaign_finance?.total_donors ?? 0,                  format: 'count',    label: 'donor\nprofiles',              color: 'var(--teal)'   },
              { rawValue: meta.committees?.total_committees ?? 0,                    format: 'count',    label: 'committees\ntracked',          color: 'var(--green)'  },
              { rawValue: meta.candidates?.total_candidates ?? 0,                    format: 'count',    label: 'candidates\ntracked',          color: 'var(--blue)'   },
            ].map(({ rawValue, format, label, color }) => (
              <div key={label}>
                <div style={{ fontSize: '1.65rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
                  <AnimatedStat value={rawValue} format={format} color={color} />
                </div>
                <div style={{ fontSize: '0.67rem', color: 'var(--text-dim)', marginTop: '0.35rem', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ── Tool Cards ── */}
      <section className="m-padx" style={{
        padding: '2rem 2.5rem',
        borderBottom: '1px solid rgba(100,140,220,0.1)',
        maxWidth: '900px',
        margin: '0 auto',
      }}>
        <div style={{
          fontSize: '0.65rem',
          letterSpacing: '0.15em',
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          marginBottom: '1.5rem',
        }}>
          Explore the data
        </div>

        {/* Three-column layout: Who Gave | Who Got Paid | How Money Moved */}
        <div className="tool-grid-3">

          {/* Column 1 — Who Gave */}
          <div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.75rem', borderBottom: '1px solid rgba(100,140,220,0.1)', paddingBottom: '0.4rem' }}>
              Who gave
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <CardLink href="/donors" color="var(--orange)" accent="rgba(255,176,96,0.2)" title="→ donors" desc="Search 336K deduped donor profiles — total giving, committee funding, lobbyist connections." />
              <CardLink href="/explorer" color="var(--orange)" accent="rgba(255,176,96,0.35)" title="→ transaction explorer" desc="Browse every contribution row — filter by name, amount, date, recipient." highlight />
              <CardLink href="/industries" color="var(--blue)" accent="rgba(160,192,255,0.15)" title="→ industries" desc="Legal, Real Estate, Healthcare, Finance — see which sectors fund what." />
              <CardLink href="/lobbyists" color="var(--blue)" accent="rgba(160,192,255,0.15)" title="→ lobbyists" desc="2,480 registered FL lobbyists cross-referenced with donation records." />
              <CardLink href="/principals" color="var(--green)" accent="rgba(128,255,160,0.2)" title="→ principals" desc="Lobbying clients matched to their campaign contributions." />
              <CardLink href="/lobbying/bills" color="var(--blue)" accent="rgba(160,192,255,0.1)" title="→ lobbied bills" desc="14K FL House bills by lobbying activity 2016–2026. Top issues and most active lobbyists." />
              <CardLink href="/influence" color="var(--orange)" accent="rgba(255,176,96,0.2)" title="→ influence index" desc="Organizations ranked by combined lobbying + donations — the most comprehensive political spending index in FL." highlight />
            </div>
          </div>

          {/* Column 2 — Who Got Paid */}
          <div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.75rem', borderBottom: '1px solid rgba(100,140,220,0.1)', paddingBottom: '0.4rem' }}>
              Who got paid
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <CardLink href="/candidates" color="var(--blue)" accent="rgba(160,192,255,0.2)" title="→ candidates" desc="Every FL candidate — hard money raised, linked PACs, combined total." />
              <CardLink href="/committees" color="var(--green)" accent="rgba(128,255,160,0.2)" title="→ committees" desc="4,440 PACs, ECOs, and party committees with full donor breakdowns." />
              <CardLink href="/cycles" color="var(--green)" accent="rgba(128,255,160,0.15)" title="→ election cycles" desc="10 cycles 2008–2026 — totals, top raisers, party and office splits." />
              <CardLink href="/investigations" color="var(--orange)" accent="rgba(255,176,96,0.25)" title="→ investigations" desc="11 entities with documented political influence, linked to journalism." />
              <CardLink href="/legislature" color="var(--gold)" accent="rgba(255,208,96,0.12)" title="→ legislature" desc="160 current FL House + Senate members — voting records, committee assignments, campaign finance, and who funds them." />
              <CardLink href="/elections" color="var(--blue)" accent="rgba(160,192,255,0.12)" title="→ elections" desc="FL election results 2012–2024 — finance-matched race breakdowns, cost per vote, statewide races." />
              <CardLink href="/party-finance" color="var(--teal)" accent="rgba(77,216,240,0.1)" title="→ party finance" desc="Republican vs Democrat fundraising trends by year and office." />
              <CardLink href="/contracts" color="var(--gold)" accent="rgba(255,208,96,0.15)" title="→ state contracts" desc="FL vendors who received state contracts — cross-referenced with campaign donors." />
              <CardLink href="/federal-contracts" color="var(--green)" accent="rgba(128,255,160,0.1)" title="→ federal contracts" desc="$219B in federal awards to FL recipients — matched to state vendors and campaign donors." />
            </div>
          </div>

          {/* Column 3 — How Money Moved */}
          <div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.75rem', borderBottom: '1px solid rgba(100,140,220,0.1)', paddingBottom: '0.4rem' }}>
              How money moved
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <CardLink href="/flow" color="var(--teal)" accent="rgba(77,216,240,0.2)" title="→ flow explorer" desc="Click through donors, committees, candidates, and industries. Follow money in any direction." />
              <CardLink href="/flow" color="var(--teal)" accent="rgba(77,216,240,0.15)" title="→ money flow" desc="Sankey diagram of the largest donor-to-committee flows. Filter by election cycle, industry, or party." />
              <CardLink href="/ie" color="var(--orange)" accent="rgba(255,176,96,0.15)" title="→ independent expenditures" desc="$70.9M in IE/EC spending — committees advocating for and against candidates." />
              <CardLink href="/connections" color="var(--orange)" accent="rgba(255,176,96,0.12)" title="→ committee connections" desc="56K+ committee pairs sharing treasurers, addresses, donors, or money flows." />
              <CardLink href="/search" color="var(--orange)" accent="rgba(255,176,96,0.35)" title="→ global search" desc="Search all 20K+ entities — donors, committees, candidates, lobbyists." highlight />
            </div>
          </div>

        </div>
      </section>

      {/* ── Donor Table ── */}
      <section id="donors" className="m-padx" style={{
        padding: '2.5rem 2.5rem 3rem',
        maxWidth: '900px',
        margin: '0 auto',
      }}>
        <DonorTable donors={topDonors} />
      </section>

    </main>
  )
}

function CardLink({ href, color, accent, title, desc, highlight }) {
  return (
    <a href={href} style={{ textDecoration: 'none' }}>
      <div style={{
        border: `1px solid ${accent}`,
        borderRadius: '3px',
        padding: '0.85rem 1rem',
        background: highlight ? accent.replace('0.35', '0.04').replace('0.25', '0.03') : 'transparent',
        transition: 'background 0.15s',
      }}>
        <div style={{ fontSize: '0.7rem', color, fontWeight: 700, marginBottom: '0.3rem', fontFamily: 'var(--font-mono)' }}>
          {title}
        </div>
        <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
          {desc}
        </div>
      </div>
    </a>
  );
}
