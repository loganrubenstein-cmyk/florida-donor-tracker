import Link from 'next/link';
import { readFileSync } from 'fs';
import { join } from 'path';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { fmtCount } from '../../../../lib/fmt';
import { slugify } from '@/lib/slugify';
import DataTrustBlock from '@/components/shared/DataTrustBlock';
import { buildMeta } from '@/lib/seo';
import dynamic from 'next/dynamic';

const BillMoneyMap = dynamic(() => import('@/components/lobbying/BillMoneyMap'), { ssr: false });

export const dynamic = 'force-dynamic';

// Generate static params for top 500 most-lobbied bills (reads committed top_bills.json)
export async function generateStaticParams() {
  try {
    const topBills = JSON.parse(readFileSync(
      join(process.cwd(), 'public', 'data', 'lobbyist_disclosures', 'top_bills.json'), 'utf8'
    ));
    return topBills.map(b => ({ slug: b.slug }));
  } catch { return []; }
}

async function loadBill(slug) {
  try {
    const db = getDb();
    const { data: entries } = await db
      .from('bill_disclosures')
      .select('bill_canon, lobbyist, principal, firm, issues, year')
      .eq('bill_slug', slug)
      .order('year', { ascending: true })
      .limit(20000);

    if (!entries || entries.length === 0) return null;

    const years      = [...new Set(entries.map(e => e.year))].sort();
    const principals = [...new Set(entries.map(e => e.principal))].sort();
    const lobbyists  = [...new Set(entries.map(e => e.lobbyist))].sort();
    const firms      = [...new Set(entries.map(e => e.firm).filter(Boolean))].sort();
    const issues     = [...new Set(entries.flatMap(e => {
      try { return JSON.parse(e.issues || '[]'); } catch { return []; }
    }).filter(i => i && i.length > 2))];

    const byYear = {};
    for (const e of entries) {
      if (!byYear[e.year]) byYear[e.year] = { filings: 0, principals: new Set(), lobbyists: new Set() };
      byYear[e.year].filings++;
      byYear[e.year].principals.add(e.principal);
      byYear[e.year].lobbyists.add(e.lobbyist);
    }

    const byPrincipal = {};
    for (const e of entries) {
      if (!byPrincipal[e.principal]) byPrincipal[e.principal] = { name: e.principal, filings: 0, lobbyists: new Set(), years: new Set() };
      byPrincipal[e.principal].filings++;
      byPrincipal[e.principal].lobbyists.add(e.lobbyist);
      byPrincipal[e.principal].years.add(e.year);
    }
    const principalList = Object.values(byPrincipal)
      .sort((a, b) => b.filings - a.filings)
      .map(p => ({ ...p, lobbyists: [...p.lobbyists], years: [...p.years].sort() }));

    return {
      bill: entries[0].bill_canon,
      entries,
      years,
      principals,
      lobbyists,
      firms,
      issues,
      byYear: Object.fromEntries(
        Object.entries(byYear).map(([yr, d]) => [yr, { ...d, principals: d.principals.size, lobbyists: d.lobbyists.size }])
      ),
      principalList,
    };
  } catch { return null; }
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const data = await loadBill(slug);
  if (!data) return { title: 'Bill' };
  return buildMeta({
    title: `${data.bill} Lobbying`,
    description: `Who lobbied on Florida ${data.bill}. ${data.entries.length} lobbyist-principal filings across ${data.years.join(', ')}.`,
    path: `/lobbying/bill/${slug}`,
  });
}

export default async function BillLobbyingPage({ params, searchParams }) {
  const { slug } = await params;
  const tab = (await searchParams)?.tab || 'overview';
  const data = await loadBill(slug);
  if (!data) return notFound();

  const { bill, entries, years, principals, lobbyists, firms, issues, byYear, principalList } = data;
  const yearStr = years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : String(years[0]);
  const maxFilings = Math.max(...Object.values(byYear).map(y => y.filings), 1);
  const maxPrincipal = principalList[0]?.filings || 1;

  return (
    <main style={{ maxWidth: '1040px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/lobbying" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Lobbying</Link>
        {' / '}
        <Link href="/lobbying/bills" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Bills</Link>
        {' / '}
        <span style={{ fontFamily: 'var(--font-mono)' }}>{bill}</span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.8rem', color: 'var(--teal)', marginBottom: '0.25rem' }}>
        {bill}
      </h1>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '0.25rem' }}>
        Florida House lobbyist disclosure filings for this bill number, {yearStr}.
        Each filing represents one lobbyist–principal pair reporting they lobbied on this bill.
      </p>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '2rem' }}>
        Source: FL House Lobbyist Disclosure portal. Not affiliated with the State of Florida. All data from public records.
      </p>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '2.5rem', padding: '1rem 1.25rem', background: 'var(--surface)', borderRadius: '6px', border: '1px solid var(--border)' }}>
        <StatBox value={fmtCount(entries.length)} label="Total Filings" />
        <StatBox value={fmtCount(principals.length)} label="Unique Principals" />
        <StatBox value={fmtCount(lobbyists.length)} label="Unique Lobbyists" />
        <StatBox value={fmtCount(firms.length)} label="Firms" />
        <StatBox value={yearStr} label="Years Active" color="var(--text-dim)" />
      </div>

      {issues.length > 0 && (
        <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {issues.slice(0, 8).map(iss => (
            <span key={iss} style={{ fontSize: '0.72rem', padding: '2px 8px', background: 'rgba(77,216,240,0.08)', border: '1px solid rgba(77,216,240,0.2)', borderRadius: '3px', color: 'var(--teal)' }}>
              {iss.length > 50 ? iss.slice(0, 50) + '…' : iss}
            </span>
          ))}
        </div>
      )}

      <div className="tab-bar" style={{ marginBottom: '1.75rem' }}>
        <a href={`/lobbying/bill/${slug}`} className={`tab${tab === 'overview' ? ' tab-active' : ''}`}>Overview</a>
        <a href={`/lobbying/bill/${slug}?tab=money`} className={`tab${tab === 'money' ? ' tab-active' : ''}`}>Money Map</a>
      </div>

      {tab === 'money' && <BillMoneyMap billSlug={slug} />}

      {tab === 'overview' && <div className="profile-2col">
        <div>
          <h2 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '0.75rem' }}>
            Principals Filing on This Bill — {fmtCount(principalList.length)} total
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {principalList.slice(0, 60).map((p, i) => (
              <div key={p.name} style={{ padding: '0.5rem 0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.2rem' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', width: '20px', flexShrink: 0 }}>{i + 1}.</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.7rem', color: 'var(--text-dim)', flexShrink: 0, marginLeft: '0.5rem' }}>
                    {p.filings > 1 && <span>{p.years.join(', ')}</span>}
                    <span style={{ color: 'var(--teal)' }}>{p.filings > 1 ? `${p.filings} filings` : `${p.years[0]}`}</span>
                  </div>
                </div>
                <div style={{ height: '2px', background: 'var(--border)', borderRadius: '1px' }}>
                  <div style={{ height: '100%', width: `${(p.filings / maxPrincipal * 100).toFixed(0)}%`, background: 'var(--teal)', borderRadius: '1px', opacity: 0.5 }} />
                </div>
                {p.lobbyists.length > 0 && (
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.lobbyists.slice(0, 3).join(' · ')}
                    {p.lobbyists.length > 3 && ` +${p.lobbyists.length - 3} more`}
                  </div>
                )}
              </div>
            ))}
            {principalList.length > 60 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', padding: '0.5rem 0.75rem' }}>
                +{principalList.length - 60} more principals
              </div>
            )}
          </div>
        </div>

        <div>
          <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.75rem' }}>Activity by Year</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {Object.entries(byYear).sort(([a], [b]) => Number(a) - Number(b)).map(([yr, d]) => (
                <div key={yr}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '2px' }}>
                    <span style={{ color: 'var(--text-dim)' }}>{yr}</span>
                    <span style={{ color: 'var(--text-dim)' }}>{d.filings} filings · {d.principals} principals</span>
                  </div>
                  <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px' }}>
                    <div style={{ height: '100%', width: `${(d.filings / maxFilings * 100).toFixed(0)}%`, background: 'var(--teal)', borderRadius: '2px', opacity: 0.7 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.75rem' }}>
              Lobbyists ({fmtCount(lobbyists.length)})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '300px', overflowY: 'auto' }}>
              {lobbyists.map(l => (
                <Link key={l} href={`/lobbyist/${slugify(l)}`} style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textDecoration: 'none', padding: '0.1rem 0', display: 'block' }}>
                  {l}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>}

      <div style={{ marginTop: '2rem' }}>
        <Link href="/lobbying/bills" style={{ fontSize: '0.78rem', color: 'var(--teal)', textDecoration: 'none' }}>
          ← Back to most lobbied bills
        </Link>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <DataTrustBlock
          source="FL House Lobbyist Disclosure Portal"
          sourceUrl="https://www.flhouse.gov/Sections/Lobbyist/lobbyist.aspx"
          
          direct={['bill number', 'lobbyist name', 'principal name', 'firm', 'filing year']}
          normalized={['issue tags extracted from free-text issue fields']}
          inferred={[]}
          caveats={[
            'Data covers FL House lobbyist disclosures only — Senate disclosures are filed separately.',
            'Each filing represents one lobbyist–principal pair; a single organization may appear multiple times if they used multiple lobbyists.',
            'Bills are matched by number — the same bill number in different sessions represents different legislation.',
          ]}
        />
      </div>
    </main>
  );
}

function StatBox({ value, label, color = 'var(--teal)' }) {
  return (
    <div>
      <div style={{ fontSize: '1.3rem', fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{value}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  );
}
