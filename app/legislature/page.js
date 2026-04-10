import Link from 'next/link';
import BackLinks from '@/components/BackLinks';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Florida Legislature — Florida Donor Tracker',
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

  const [{ data: legStats }, { data: committeeCount }] = await Promise.all([
    db.from('legislators')
      .select('chamber, party, total_raised, participation_rate')
      .eq('is_current', true),
    db.from('legislative_committees')
      .select('*', { count: 'exact', head: true }),
  ]);

  const rows = legStats || [];
  const totalRaised = rows.reduce((s, r) => s + (parseFloat(r.total_raised) || 0), 0);
  const rCount = rows.filter(r => r.party === 'R').length;
  const dCount = rows.filter(r => r.party === 'D').length;
  const houseCount = rows.filter(r => r.chamber === 'House').length;
  const senateCount = rows.filter(r => r.chamber === 'Senate').length;
  const partRates = rows.filter(r => r.participation_rate != null).map(r => parseFloat(r.participation_rate));
  const avgPart = partRates.length > 0 ? Math.round(partRates.reduce((s, v) => s + v, 0) / partRates.length * 100) : null;

  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <BackLinks links={[{ href: '/', label: 'home' }]} />

      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', color: 'var(--text)', margin: '0 0 0.3rem' }}>
          Florida Legislature
        </h1>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
          2024–2026 term · {houseCount} House + {senateCount} Senate members
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '2rem', border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden', flexWrap: 'wrap' }}>
        {[
          { label: 'Combined Raised', value: fmtCompact(totalRaised), color: 'var(--orange)' },
          { label: 'Republicans', value: `${rCount} members`, color: 'var(--republican)' },
          { label: 'Democrats', value: `${dCount} members`, color: 'var(--democrat)' },
          { label: 'Committees', value: `${committeeCount || 65}`, color: 'var(--teal)' },
          { label: 'Avg Participation', value: avgPart != null ? `${avgPart}%` : '—', color: 'var(--green)' },
        ].map(({ label, value, color }, i, arr) => (
          <div key={label} style={{ flex: '1 1 120px', padding: '0.65rem 0.85rem', borderRight: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.2rem' }}>{label}</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Hub cards */}
      <div className="hub-grid">
        <Link href="/legislators" className="hub-card">
          <div className="hub-card-title">Member Directory</div>
          <div className="hub-card-desc">All {rows.length} current House and Senate members — voting records, committee assignments, campaign finance, and contact info.</div>
          <div className="hub-card-stat">{houseCount} House · {senateCount} Senate</div>
        </Link>

        <Link href="/legislature/committees" className="hub-card">
          <div className="hub-card-title">Committees</div>
          <div className="hub-card-desc">All standing committees — membership rosters, leadership roles, and "who funds the committee" industry breakdown.</div>
          <div className="hub-card-stat">{committeeCount || 65} committees · 2024–2026 term</div>
        </Link>

        <Link href="/candidates" className="hub-card">
          <div className="hub-card-title">Campaign Finance</div>
          <div className="hub-card-desc">Full FL Division of Elections candidate finance records — matched to legislators where available.</div>
          <div className="hub-card-stat">{fmtCompact(totalRaised)} combined by current members</div>
        </Link>

        <Link href="/lobbying/bills" className="hub-card">
          <div className="hub-card-title">Lobbied Bills</div>
          <div className="hub-card-desc">14K FL House bills by lobbying activity — see which bills attracted the most principals and lobbyist registrations.</div>
          <div className="hub-card-stat">2016–2026 · FL House disclosures</div>
        </Link>
      </div>
    </main>
  );
}
