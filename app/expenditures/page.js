import Link from 'next/link';
import { getDb } from '@/lib/db';
import { fmtMoneyCompact, fmtMoney, fmtCount } from '@/lib/fmt';
import BackLinks from '@/components/BackLinks';
import DataTrustBlock from '@/components/shared/DataTrustBlock';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Expenditures',
  description: 'How Florida political money gets spent — top spending committees, top spending campaigns, and where the dollars go after contributions are banked.',
};

async function loadData() {
  const db = getDb();

  const [
    commTotals,
    candTotals,
    topCommittees,
    topCandidates,
  ] = await Promise.all([
    // Global committee expenditure totals — DB-side SUM via RPC so a row cap
    // can't silently undercount as the summary view grows (migration 043).
    db.rpc('get_committee_expenditure_global_totals'),
    db.rpc('get_candidate_expenditure_global_totals'),
    // Top 25 spending committees
    db.from('committee_expenditure_summary')
      .select('acct_num, total_spent, num_expenditures, date_start, date_end')
      .order('total_spent', { ascending: false })
      .limit(25),
    // Top 25 spending candidates
    db.from('candidate_expenditure_summary')
      .select('acct_num, total_spent, num_expenditures, date_start, date_end')
      .order('total_spent', { ascending: false })
      .limit(25),
  ]);

  const committeeTotal  = parseFloat(commTotals.data?.total_spent)      || 0;
  const candidateTotal  = parseFloat(candTotals.data?.total_spent)      || 0;
  const committeeCount  = parseInt(commTotals.data?.num_expenditures, 10) || 0;
  const candidateCount  = parseInt(candTotals.data?.num_expenditures, 10) || 0;

  // Resolve names for the top tables
  const commAccts = (topCommittees.data || []).map(r => r.acct_num);
  const candAccts = (topCandidates.data || []).map(r => r.acct_num);

  const [commNames, candNames] = await Promise.all([
    commAccts.length
      ? db.from('committees').select('acct_num, committee_name').in('acct_num', commAccts)
      : Promise.resolve({ data: [] }),
    candAccts.length
      ? db.from('candidates').select('acct_num, candidate_name, party_code, office_desc').in('acct_num', candAccts)
      : Promise.resolve({ data: [] }),
  ]);

  const commNameMap = Object.fromEntries((commNames.data || []).map(c => [c.acct_num, c.committee_name]));
  const candMetaMap = Object.fromEntries((candNames.data || []).map(c => [c.acct_num, c]));

  return {
    totals: {
      committee_total:   committeeTotal,
      candidate_total:   candidateTotal,
      combined_total:    committeeTotal + candidateTotal,
      committee_count:   committeeCount,
      candidate_count:   candidateCount,
      combined_count:    committeeCount + candidateCount,
    },
    topCommittees: (topCommittees.data || []).map(r => ({
      acct_num:    r.acct_num,
      name:        commNameMap[r.acct_num] || `Committee #${r.acct_num}`,
      total_spent: parseFloat(r.total_spent) || 0,
      num_expenditures: r.num_expenditures || 0,
      date_start:  r.date_start,
      date_end:    r.date_end,
    })),
    topCandidates: (topCandidates.data || []).map(r => {
      const meta = candMetaMap[r.acct_num] || {};
      return {
        acct_num:    r.acct_num,
        name:        meta.candidate_name || `Candidate #${r.acct_num}`,
        party:       meta.party_code || null,
        office:      meta.office_desc || null,
        total_spent: parseFloat(r.total_spent) || 0,
        num_expenditures: r.num_expenditures || 0,
      };
    }),
  };
}

function PartyChip({ party }) {
  if (!party) return null;
  const color = party === 'REP' ? 'var(--republican)' : party === 'DEM' ? 'var(--democrat)' : 'var(--text-dim)';
  return (
    <span style={{
      fontSize: '0.55rem', padding: '0.05rem 0.3rem',
      border: `1px solid ${color}`, color,
      borderRadius: '2px', fontWeight: 'bold', marginLeft: '0.3rem',
    }}>{party}</span>
  );
}

export default async function ExpendituresPage() {
  const { totals, topCommittees, topCandidates } = await loadData();

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2.5rem 2rem 4rem' }}>
      <BackLinks links={[{ href: '/', label: 'home' }]} />

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{
          display: 'inline-block', fontSize: '0.6rem', textTransform: 'uppercase',
          letterSpacing: '0.13em', padding: '0.28rem 0.7rem', borderRadius: '2px',
          marginBottom: '0.75rem', border: '1px solid rgba(255,176,96,0.3)',
          background: 'rgba(255,176,96,0.06)', color: 'var(--orange)',
        }}>
          Expenditures
        </div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.4rem, 3vw, 2rem)',
          fontWeight: 400, color: 'var(--text)', marginBottom: '0.3rem',
        }}>
          How Florida political money gets spent
        </h1>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.6, maxWidth: '640px' }}>
          Every contribution raised is eventually paid out — to consultants, media buyers, mailhouses, printers, staff, and vendors of every kind.
          This page is about the <strong style={{ color: 'var(--text)' }}>outflow</strong> side: which committees and campaigns spend the most,
          and where to drill in. Distinct from independent expenditures (outside spending) and from contributions (money in).
        </p>
      </div>

      {/* Hero stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '1px', background: 'var(--border)',
        border: '1px solid var(--border)', borderRadius: '3px',
        marginBottom: '2rem', overflow: 'hidden',
      }}>
        {[
          { label: 'Combined Spend',       value: fmtMoneyCompact(totals.combined_total),   hero: true, sub: `${fmtCount(totals.combined_count)} transactions` },
          { label: 'Committee Spend',      value: fmtMoneyCompact(totals.committee_total),  sub: `${fmtCount(totals.committee_count)} transactions` },
          { label: 'Candidate Spend',      value: fmtMoneyCompact(totals.candidate_total),  sub: `${fmtCount(totals.candidate_count)} transactions` },
          { label: 'Top Spending Entities', value: `${topCommittees.length + topCandidates.length}`, sub: 'highest spenders shown' },
        ].map(({ label, value, hero, sub }) => (
          <div key={label} style={{
            background: hero ? 'rgba(8,8,24,0.9)' : 'var(--bg)',
            padding: '1.1rem 1.35rem',
            position: 'relative', overflow: 'hidden',
            ...(hero ? { boxShadow: 'inset 0 -2px 0 0 var(--orange)' } : {}),
          }}>
            <div style={{ fontSize: '0.57rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.35rem' }}>
              {label}
            </div>
            <div style={{
              fontFamily: 'var(--font-serif)',
              fontSize: hero ? '1.75rem' : '1.25rem',
              color: hero ? 'var(--orange)' : 'var(--text)',
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
            }}>
              {value}
            </div>
            {sub && (
              <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)', marginTop: '0.2rem', fontFamily: 'var(--font-mono)' }}>
                {sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Two-column top spenders */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
        {/* Top spending committees */}
        <div>
          <div style={{
            fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--text-dim)', fontWeight: 600,
            marginBottom: '0.4rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)',
          }}>
            Top Spending Committees
          </div>
          <p style={{ fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.55, marginBottom: '0.75rem' }}>
            Click a committee to see its Payees tab — the specific vendors paid.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {topCommittees.map((c, i) => (
              <Link key={c.acct_num} href={`/committee/${c.acct_num}?tab=payees`} style={{
                display: 'grid', gridTemplateColumns: '1.5rem 1fr auto', gap: '0.6rem',
                alignItems: 'baseline', padding: '0.5rem 0.75rem',
                border: '1px solid var(--border)', borderRadius: '3px',
                background: 'var(--surface)', textDecoration: 'none',
              }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{i + 1}.</span>
                <span style={{ fontSize: '0.76rem', color: 'var(--teal)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}
                </span>
                <span style={{ fontSize: '0.76rem', color: 'var(--orange)', fontFamily: 'var(--font-mono)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {fmtMoneyCompact(c.total_spent)}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Top spending candidates */}
        <div>
          <div style={{
            fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--text-dim)', fontWeight: 600,
            marginBottom: '0.4rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)',
          }}>
            Top Spending Campaigns
          </div>
          <p style={{ fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.55, marginBottom: '0.75rem' }}>
            Click a candidate to see the Expenditures tab — top vendors and % of budget.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {topCandidates.map((c, i) => (
              <Link key={c.acct_num} href={`/candidate/${c.acct_num}?tab=expenditures`} style={{
                display: 'grid', gridTemplateColumns: '1.5rem 1fr auto', gap: '0.6rem',
                alignItems: 'baseline', padding: '0.5rem 0.75rem',
                border: '1px solid var(--border)', borderRadius: '3px',
                background: 'var(--surface)', textDecoration: 'none',
              }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{i + 1}.</span>
                <span style={{ fontSize: '0.76rem', color: 'var(--orange)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}<PartyChip party={c.party} />
                </span>
                <span style={{ fontSize: '0.76rem', color: 'var(--orange)', fontFamily: 'var(--font-mono)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {fmtMoneyCompact(c.total_spent)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Cross-links */}
      <div style={{
        padding: '1.25rem', border: '1px solid var(--border)', borderRadius: '3px',
        background: 'rgba(255,255,255,0.015)', marginBottom: '2rem',
      }}>
        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: '0.6rem' }}>
          Explore spending from other angles
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <Link href="/vendors" style={chipStyle('teal')}>→ Vendors directory (who gets paid)</Link>
          <Link href="/ie" style={chipStyle('text-dim')}>→ Independent expenditures (outside spending)</Link>
          <Link href="/explorer" style={chipStyle('text-dim')}>→ Contributions explorer (money in)</Link>
          <Link href="/flow" style={chipStyle('text-dim')}>→ Money flow diagram</Link>
        </div>
      </div>

      <DataTrustBlock
        source="Florida Division of Elections — Campaign Finance Expenditures"
        sourceUrl="https://dos.fl.gov/elections/candidates-committees/campaign-finance/"
        direct={['acct_num', 'expenditure_date', 'amount', 'vendor_name', 'purpose', 'type_code']}
        normalized={['committee name lookup', 'candidate name lookup', 'vendor canonicalization (ongoing)']}
        caveats={[
          'Not every committee has expenditure data loaded; the "Top Spending Committees" list reflects only committees with expenditures ingested.',
          'Vendor canonicalization is in progress — the same vendor may appear under multiple raw names on entity profiles. The vendors directory uses canonical entities where available.',
          'Combined totals are the sum of committee-side + candidate-side spend, which are tracked in separate source tables; some vendor payments may be duplicated across both.',
        ]}
      />
    </main>
  );
}

function chipStyle(color) {
  const c = color === 'teal' ? 'var(--teal)' : 'var(--text-dim)';
  const bg = color === 'teal' ? 'rgba(77,216,240,0.08)' : 'rgba(90,106,136,0.08)';
  const border = color === 'teal' ? 'rgba(77,216,240,0.25)' : 'var(--border)';
  return {
    fontSize: '0.7rem', fontFamily: 'var(--font-mono)',
    padding: '0.35rem 0.7rem', borderRadius: '3px',
    background: bg, color: c, border: `1px solid ${border}`,
    textDecoration: 'none', whiteSpace: 'nowrap',
  };
}
