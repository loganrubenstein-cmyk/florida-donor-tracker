import Link from 'next/link';
import BackLinks from '@/components/BackLinks';
import { getDb } from '@/lib/db';
import SectionHeader from '@/components/shared/SectionHeader';
import { slugify } from '@/lib/slugify';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Florida Legislature',
  description: 'Florida Legislature — 160 current members, 65 committees, voting records, and campaign finance.',
};

function fmtCompact(n) {
  if (!n) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

export default async function LegislaturePage() {
  const db = getDb();

  const [{ data: legStats }, { count: committeeCount }] = await Promise.all([
    db.from('legislators')
      .select('chamber, party, total_raised, participation_rate, acct_num')
      .eq('is_current', true),
    db.from('legislative_committees')
      .select('*', { count: 'exact', head: true }),
  ]);

  const acctNums = (legStats || []).map(r => r.acct_num).filter(Boolean);
  let industryFunding = [];
  if (acctNums.length > 0) {
    const { data: indRows } = await db
      .from('industry_by_committee')
      .select('industry, total')
      .in('acct_num', acctNums)
      .not('industry', 'in', '("Other","Not Employed","Retired")');

    const indMap = {};
    for (const r of (indRows || [])) {
      indMap[r.industry] = (indMap[r.industry] || 0) + (parseFloat(r.total) || 0);
    }
    const indTotal = Object.values(indMap).reduce((s, v) => s + v, 0);
    industryFunding = Object.entries(indMap)
      .sort(([, a], [, b]) => b - a)
      .map(([industry, total]) => ({ industry, total, pct: indTotal > 0 ? (total / indTotal) * 100 : 0 }));
  }

  const rows = legStats || [];
  const totalRaised = rows.reduce((s, r) => s + (parseFloat(r.total_raised) || 0), 0);
  const rCount = rows.filter(r => r.party === 'R').length;
  const dCount = rows.filter(r => r.party === 'D').length;
  const houseCount = rows.filter(r => r.chamber === 'House').length;
  const senateCount = rows.filter(r => r.chamber === 'Senate').length;
  const partRates = rows.filter(r => r.participation_rate != null).map(r => parseFloat(r.participation_rate));
  const avgPart = partRates.length > 0 ? Math.round(partRates.reduce((s, v) => s + v, 0) / partRates.length * 100) : null;

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <BackLinks links={[{ href: '/', label: 'home' }]} />

      <SectionHeader title="Florida Legislature" eyebrow="FL Legislature · 2024–2026 Term" />
      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '-0.75rem', marginBottom: '1.75rem' }}>
        {houseCount} House + {senateCount} Senate members
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '2rem', border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden', flexWrap: 'wrap' }}>
        {[
          { label: 'Combined Raised', value: fmtCompact(totalRaised), color: 'var(--orange)' },
          { label: 'Republicans', value: `${rCount} members`, color: 'var(--republican)' },
          { label: 'Democrats', value: `${dCount} members`, color: 'var(--democrat)' },
          { label: 'Committees', value: `${committeeCount ?? 65}`, color: 'var(--teal)' },
          { label: 'Avg Participation', value: avgPart != null ? `${avgPart}%` : '—', color: 'var(--green)' },
        ].map(({ label, value, color }, i, arr) => (
          <div key={label} style={{ flex: '1 1 120px', padding: '0.65rem 0.85rem', borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.2rem' }}>{label}</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 400, color, fontFamily: 'var(--font-serif)' , fontVariantNumeric: 'tabular-nums' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Quick member search */}
      <form action="/legislators" method="get" style={{ marginBottom: '1.75rem', display: 'flex', gap: '0.5rem', maxWidth: '400px' }}>
        <input
          name="q"
          type="search"
          placeholder="Search a member — e.g. DeSantis, Passidomo…"
          style={{
            flex: 1, background: 'var(--surface)', border: '1px solid rgba(100,140,220,0.35)',
            color: 'var(--text)', padding: '0.5rem 0.75rem', fontSize: '0.78rem',
            borderRadius: '3px', fontFamily: 'var(--font-mono)', outline: 'none',
          }}
        />
        <button type="submit" style={{
          background: 'transparent', border: '1px solid rgba(100,140,220,0.35)',
          color: 'var(--text-dim)', padding: '0.5rem 0.75rem', fontSize: '0.72rem',
          borderRadius: '3px', cursor: 'pointer', fontFamily: 'var(--font-mono)',
        }}>
          →
        </button>
      </form>

      {/* Hub cards */}
      <div className="hub-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <Link href="/legislators" className="hub-card">
          <div className="hub-card-title">Member Directory</div>
          <div className="hub-card-desc">All {rows.length} current House and Senate members — voting records, committee assignments, campaign finance, and contact info.</div>
          <div className="hub-card-stat">{houseCount} House · {senateCount} Senate</div>
        </Link>

        <Link href="/legislature/committees" className="hub-card">
          <div className="hub-card-title">Committees</div>
          <div className="hub-card-desc">All standing committees — membership rosters, leadership roles, and "who funds the committee" industry breakdown.</div>
          <div className="hub-card-stat">{committeeCount ?? 65} committees · 2024–2026 term</div>
        </Link>

        <Link href="/candidates" className="hub-card">
          <div className="hub-card-title">Campaign Finance</div>
          <div className="hub-card-desc">Full FL Division of Elections candidate finance records — matched to legislators where available.</div>
          <div className="hub-card-stat">{fmtCompact(totalRaised)} combined by current members</div>
        </Link>

        <Link href="/lobbying/bills" className="hub-card">
          <div className="hub-card-title">Lobbied Bills</div>
          <div className="hub-card-desc">14K FL House bills by lobbying activity — see which bills attracted the most principals and lobbyist registrations.</div>
          <div className="hub-card-stat">2017–2026 · FL House disclosures</div>
        </Link>

        <Link href="/follow" className="hub-card">
          <div className="hub-card-title">Follow the Money</div>
          <div className="hub-card-desc">Pick a donor and trace their money through committees to the legislators they funded — then see how those legislators voted.</div>
          <div className="hub-card-stat">Donor → Committee → Legislator → Vote</div>
        </Link>

        <Link href="/flow" className="hub-card">
          <div className="hub-card-title">Money Flow Explorer</div>
          <div className="hub-card-desc">Browse by industry or party to see which sectors fund which legislators most. Multi-column drill-down.</div>
          <div className="hub-card-stat">Industry · Party · Committee · Donor</div>
        </Link>

        <Link href="/solicitations" className="hub-card">
          <div className="hub-card-title">Public Solicitations</div>
          <div className="hub-card-desc">Organizations registered to solicit political contributions in Florida — cross-reference donors and committees.</div>
          <div className="hub-card-stat">FL Division of Elections registry</div>
        </Link>
      </div>

      {/* Industry funding breakdown */}
      {industryFunding.length > 0 && (
        <div style={{ marginTop: '2.5rem' }}>
          <div style={{ fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 600, marginBottom: '0.5rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)' }}>
            Individual Donor Industries — Current Legislators
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '1rem' }}>
            Hard money contributions classified by donor industry · {acctNums.length} legislators with matched campaign accounts
          </div>

          {/* Stacked bar */}
          <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', marginBottom: '1rem' }}>
            {industryFunding.slice(0, 8).map(ind => (
              <div key={ind.industry} style={{ width: `${ind.pct}%`, background: INDUSTRY_COLORS[ind.industry] || '#444466', minWidth: '2px' }} />
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem 1.5rem' }}>
            {industryFunding.map(ind => (
              <div key={ind.industry} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: INDUSTRY_COLORS[ind.industry] || '#444466', flexShrink: 0 }} />
                <Link href={`/industry/${slugify(ind.industry)}`} style={{ fontSize: '0.73rem', color: 'var(--blue)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: 'none' }}>
                  {ind.industry}
                </Link>
                <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                  {fmtCompact(ind.total)} <span style={{ color: 'rgba(100,140,220,0.4)' }}>({ind.pct.toFixed(1)}%)</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginTop: '0.75rem' }}>
            Source: FL Division of Elections individual contributions by occupation → industry bucket.
            Does not include PAC-to-candidate transfers.
          </div>
        </div>
      )}

      <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
          Official Sources
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          {[
            { label: 'Florida Senate →', href: 'https://www.flsenate.gov/' },
            { label: 'Florida House →', href: 'https://www.flhouse.gov/' },
            { label: 'Senate Members →', href: 'https://www.flsenate.gov/Senators/' },
            { label: 'House Members →', href: 'https://www.flhouse.gov/Sections/Representatives/representatives.aspx' },
            { label: 'House Lobbyist Disclosures →', href: 'https://www.flhouse.gov/Sections/Lobbyists/lobbyists.aspx' },
            { label: 'FL Commission on Ethics →', href: 'https://ethics.state.fl.us/' },
          ].map(({ label, href }) => (
            <a key={href} href={href} target="_blank" rel="noopener noreferrer" style={{
              fontSize: '0.68rem', color: 'var(--teal)', textDecoration: 'none',
              border: '1px solid rgba(77,216,240,0.25)', borderRadius: '3px',
              padding: '0.2rem 0.55rem',
            }}>
              {label}
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}

const INDUSTRY_COLORS = {
  'Legal':                       '#4dd8f0',
  'Real Estate':                 '#f0a04d',
  'Healthcare':                  '#7dd87d',
  'Finance & Insurance':         '#a04df0',
  'Political / Lobbying':        '#f04d4d',
  'Agriculture':                 '#d8c84d',
  'Construction':                '#d8884d',
  'Education':                   '#4d88f0',
  'Technology / Engineering':    '#4df0d8',
  'Retail & Hospitality':        '#d84d88',
  'Business & Consulting':       '#8888cc',
  'Government & Public Service': '#88cc88',
  'Retired':                     '#aaaaaa',
  'Not Employed':                '#888899',
  'Other':                       '#555570',
};
