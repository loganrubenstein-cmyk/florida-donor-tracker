import DonorTable from '@/components/donors/DonorTable'
import HeroCounter from '@/components/home/HeroCounter'
import { getDb } from '@/lib/db'

export const dynamic = 'force-dynamic';

function formatDate(iso) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'recently'
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

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
    { data: donorAgg },
  ] = await Promise.all([
    db.from('donors').select('slug, name, is_corporate, total_combined, total_soft, total_hard, num_contributions').order('total_combined', { ascending: false }).limit(100),
    db.from('candidates').select('*', { count: 'exact', head: true }),
    db.from('committees').select('*', { count: 'exact', head: true }),
    db.from('donors').select('total_combined.sum()').single(),
  ]);

  const totalDonors = 336478; // from last pipeline run — update quarterly
  const totalSpending = 3894316430; // from meta.json grand_totals
  const totalContributions = 10898659; // contributions table count

  return {
    topDonors: topDonorsData || [],
    candidateCount: candidateCount || 4421,
    committeeCount: committeeCount || 1687,
    totalSpending,
    totalContributions,
    totalDonors,
    updatedDate: formatDate(new Date().toISOString()),
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

  return (
    <main>
      {/* ── Hero ── */}
      <section className="m-padx" style={{
        padding: '3.5rem 2.5rem 2.5rem',
        borderBottom: '1px solid rgba(100,140,220,0.1)',
        maxWidth: '900px',
        margin: '0 auto',
      }}>
        <div style={{
          fontSize: '0.6rem',
          letterSpacing: '0.18em',
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          marginBottom: '1rem',
        }}>
          Florida · 1996–2026 · Public Record
        </div>

        <h1 style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 'clamp(2rem, 5vw, 3.2rem)',
          lineHeight: 1.05,
          color: '#fff',
          marginBottom: '1.5rem',
          fontWeight: 400,
        }}>
          <HeroCounter total={meta.grand_totals?.total_political_spending_tracked ?? meta.campaign_finance?.estimated_total_contributions ?? 0} />
          <br />raised in Florida<br />politics.
        </h1>

        <p style={{
          fontSize: '0.7rem',
          color: 'var(--text-dim)',
          marginBottom: '2rem',
          maxWidth: '520px',
          lineHeight: 1.8,
        }}>
          Connecting the dots to shed light on the Sunshine State —
          who funds Florida&rsquo;s politicians, how the money flows, and what it buys.
        </p>

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
          <a href="/network" style={{
            border: '1px solid rgba(100,140,220,0.2)',
            color: 'var(--text-dim)',
            padding: '0.5rem 1.2rem',
            fontSize: '0.65rem',
            borderRadius: '3px',
            textDecoration: 'none',
            fontFamily: 'var(--font-mono)',
          }}>
            → network
          </a>
          <span style={{ fontSize: '0.58rem', color: 'rgba(90,106,136,0.6)' }}>
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
              { value: formatBillions(meta.grand_totals?.total_political_spending_tracked ?? meta.campaign_finance?.estimated_total_contributions ?? 0), label: 'total political\nspending tracked', color: 'var(--orange)' },
              { value: (meta.campaign_finance?.total_donors ?? 0).toLocaleString(),               label: 'donors\nindexed',              color: 'var(--teal)'   },
              { value: (meta.committees?.total_committees ?? meta.lobbyist_registrations?.total_principals ?? 0).toLocaleString(), label: 'committees\ntracked',  color: 'var(--green)'  },
              { value: (meta.candidates?.total_candidates ?? 0).toLocaleString(), label: 'candidates\ntracked',       color: 'var(--blue)'   },
            ].map(({ value, label, color }) => (
              <div key={label}>
                <div style={{ fontSize: '1.5rem', color, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
                  {value}
                </div>
                <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', marginTop: '0.35rem', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          <div className="hide-mobile" style={{ flexShrink: 0 }}>
            <a href="/about" style={{
              fontSize: '0.6rem',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
              textDecoration: 'none',
              border: '1px solid rgba(100,140,220,0.2)',
              padding: '0.5rem 1rem',
              borderRadius: '3px',
              whiteSpace: 'nowrap',
            }}>
              → about this site
            </a>
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
          fontSize: '0.6rem',
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
            <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.75rem', borderBottom: '1px solid rgba(100,140,220,0.1)', paddingBottom: '0.4rem' }}>
              Who gave
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <CardLink href="/donors" color="var(--orange)" accent="rgba(255,176,96,0.2)" title="→ donors" desc="Search 336K donors — total giving, committee funding, lobbyist connections." />
              <CardLink href="/explorer" color="var(--orange)" accent="rgba(255,176,96,0.35)" title="→ transaction explorer" desc="Browse every contribution row — filter by name, amount, date, recipient." highlight />
              <CardLink href="/industries" color="var(--blue)" accent="rgba(160,192,255,0.15)" title="→ industries" desc="Legal, Real Estate, Healthcare, Finance — see which sectors fund what." />
              <CardLink href="/lobbyists" color="var(--blue)" accent="rgba(160,192,255,0.15)" title="→ lobbyists" desc="2,480 registered FL lobbyists cross-referenced with donation records." />
              <CardLink href="/principals" color="var(--green)" accent="rgba(128,255,160,0.2)" title="→ principals" desc="Lobbying clients matched to their campaign contributions." />
              <CardLink href="/lobbying/bills" color="var(--blue)" accent="rgba(160,192,255,0.1)" title="→ lobbied bills" desc="14K FL House bills by lobbying activity 2016–2026. Top issues and most active lobbyists." />
            </div>
          </div>

          {/* Column 2 — Who Got Paid */}
          <div>
            <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.75rem', borderBottom: '1px solid rgba(100,140,220,0.1)', paddingBottom: '0.4rem' }}>
              Who got paid
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <CardLink href="/candidates" color="var(--blue)" accent="rgba(160,192,255,0.2)" title="→ candidates" desc="Every FL candidate — hard money raised, linked PACs, combined total." />
              <CardLink href="/committees" color="var(--green)" accent="rgba(128,255,160,0.2)" title="→ committees" desc="4,440 PACs, ECOs, and party committees with full donor breakdowns." />
              <CardLink href="/cycles" color="var(--green)" accent="rgba(128,255,160,0.15)" title="→ election cycles" desc="10 cycles 2008–2026 — totals, top raisers, party and office splits." />
              <CardLink href="/investigations" color="var(--orange)" accent="rgba(255,176,96,0.25)" title="→ investigations" desc="11 entities with documented political influence, linked to journalism." />
              <CardLink href="/legislators" color="var(--blue)" accent="rgba(160,192,255,0.12)" title="→ legislators" desc="224 FL House/Senate members — voting records + campaign finance." />
              <CardLink href="/elections" color="var(--teal)" accent="rgba(77,216,240,0.12)" title="→ elections" desc="Results 2012–2024 with cost-per-vote for finance-matched candidates." />
              <CardLink href="/party-finance" color="var(--teal)" accent="rgba(77,216,240,0.1)" title="→ party finance" desc="Republican vs Democrat fundraising trends by year and office." />
            </div>
          </div>

          {/* Column 3 — How Money Moved */}
          <div>
            <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.75rem', borderBottom: '1px solid rgba(100,140,220,0.1)', paddingBottom: '0.4rem' }}>
              How money moved
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <CardLink href="/network/graph" color="var(--teal)" accent="rgba(77,216,240,0.2)" title="→ network graph" desc="Visualize the full donor-committee network. Trace money flows across thousands of nodes." />
              <CardLink href="/flow" color="var(--teal)" accent="rgba(77,216,240,0.15)" title="→ money flow" desc="Sankey diagram of the 500 largest donor-to-committee flows." />
              <CardLink href="/transfers" color="var(--teal)" accent="rgba(77,216,240,0.1)" title="→ committee transfers" desc="$147M in committee-to-committee money flows — how PC networks funnel funds." />
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
        <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
          {desc}
        </div>
      </div>
    </a>
  );
}
