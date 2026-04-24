import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadBill } from '@/lib/loadBill';
import { slugify } from '@/lib/slugify';
import { buildMeta } from '@/lib/seo';
import DataTrustBlock from '@/components/shared/DataTrustBlock';

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const data = await loadBill(slug);
  if (!data) return { title: 'Bill' };
  const titlePart = data.title ? `${data.bill_number} — ${data.title}` : data.bill_number;
  return buildMeta({
    title: titlePart,
    description: `${data.bill_number} (${data.year}) — ${data.title || 'Florida legislative bill'}. Sponsors, votes, and lobbyist filings.`,
    path: `/bill/${slug}`,
  });
}

const STATUS_COLORS = {
  Signed:       { bg: 'rgba(128,255,160,0.10)', border: 'rgba(128,255,160,0.35)', color: '#80ffa0' },
  Vetoed:       { bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.35)', color: '#f87171' },
  Enrolled:     { bg: 'rgba(77,216,240,0.10)',  border: 'rgba(77,216,240,0.30)',  color: '#4dd8f0' },
  Passed:       { bg: 'rgba(77,216,240,0.10)',  border: 'rgba(77,216,240,0.30)',  color: '#4dd8f0' },
  Adopted:      { bg: 'rgba(77,216,240,0.10)',  border: 'rgba(77,216,240,0.30)',  color: '#4dd8f0' },
  Died:         { bg: 'rgba(90,106,136,0.15)',  border: 'rgba(90,106,136,0.35)', color: '#5a6a88' },
  Withdrawn:    { bg: 'rgba(90,106,136,0.15)',  border: 'rgba(90,106,136,0.35)', color: '#5a6a88' },
  Tabled:       { bg: 'rgba(90,106,136,0.15)',  border: 'rgba(90,106,136,0.35)', color: '#5a6a88' },
  'In Committee':{ bg: 'rgba(255,176,96,0.10)', border: 'rgba(255,176,96,0.30)', color: '#ffb060' },
  Filed:        { bg: 'rgba(255,176,96,0.08)',  border: 'rgba(255,176,96,0.22)', color: '#ffb060' },
};

function StatusBadge({ status }) {
  if (!status) return null;
  const s = STATUS_COLORS[status] || { bg: 'rgba(90,106,136,0.12)', border: 'var(--border)', color: 'var(--text-dim)' };
  return (
    <span style={{
      fontSize: '0.68rem', padding: '2px 8px', borderRadius: '3px',
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
    }}>{status}</span>
  );
}

function partyColor(p) {
  if (p === 'R') return 'var(--republican)';
  if (p === 'D') return 'var(--democrat)';
  return 'var(--text-dim)';
}

function VoteTallyCard({ chamber, roll }) {
  if (!roll) {
    return (
      <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px' }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--text)', marginBottom: '0.35rem' }}>{chamber}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>No floor vote recorded for this session.</div>
      </div>
    );
  }
  const { Yea, Nay, NV, Absent } = roll.tally;
  const total = Yea + Nay + NV + Absent;
  const passed = Yea > Nay;
  return (
    <div style={{ padding: '1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.35rem' }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--text)' }}>{chamber}</div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>{roll.date}</div>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.82rem', fontFamily: 'var(--font-mono)', marginBottom: '0.25rem' }}>
        <span style={{ color: passed ? '#80ffa0' : 'var(--text-dim)' }}>{Yea} Y</span>
        <span style={{ color: !passed && Nay > 0 ? '#f87171' : 'var(--text-dim)' }}>{Nay} N</span>
        {(NV + Absent) > 0 && <span style={{ color: 'var(--text-dim)' }}>{NV + Absent} NV</span>}
      </div>
      <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)' }}>{total} members voting</div>
    </div>
  );
}

export default async function BillPage({ params, searchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const yearOverride = sp?.year || null;
  const data = await loadBill(slug, yearOverride);
  if (!data) return notFound();

  const { bill_number, year, title, status, last_action, primary_sponsor, available_years, sponsors, votes_summary, principals, fl_senate_url } = data;

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/legislature" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Legislature</Link>
        {' / '}
        <span style={{ fontFamily: 'var(--font-mono)' }}>{bill_number}</span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.8rem', color: 'var(--teal)', marginBottom: '0.25rem' }}>
        {bill_number} · {year}
      </h1>
      {title && (
        <p style={{ fontSize: '1.15rem', color: 'var(--text)', fontFamily: 'var(--font-serif)', lineHeight: 1.4, marginBottom: '0.5rem' }}>
          {title}
        </p>
      )}

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <StatusBadge status={status} />
        {primary_sponsor && (
          <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
            Primary sponsor: <span style={{ color: 'var(--text)' }}>{primary_sponsor}</span>
          </span>
        )}
        {last_action && (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
            {last_action.length > 100 ? last_action.slice(0, 100) + '…' : last_action}
          </span>
        )}
      </div>

      {available_years.length > 1 && (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>Same bill number, other sessions:</span>
          {available_years.map(yr => (
            <a key={yr} href={`/bill/${slug}?year=${yr}`}
              style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '3px', textDecoration: 'none',
                background: yr === year ? 'rgba(77,216,240,0.12)' : 'transparent',
                border: `1px solid ${yr === year ? 'rgba(77,216,240,0.4)' : 'var(--border)'}`,
                color: yr === year ? 'var(--teal)' : 'var(--text-dim)',
              }}>{yr}</a>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        {fl_senate_url && (
          <a href={fl_senate_url} target="_blank" rel="noopener noreferrer"
             style={{ fontSize: '0.68rem', color: 'var(--teal)', textDecoration: 'none',
               border: '1px solid rgba(77,216,240,0.3)', borderRadius: '3px', padding: '0.2rem 0.55rem' }}>
            View on FL Senate ↗
          </a>
        )}
        <Link href={`/lobbying/bill/${slug}${yearOverride ? `?year=${yearOverride}` : ''}`}
              style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textDecoration: 'none',
                border: '1px solid var(--border)', borderRadius: '3px', padding: '0.2rem 0.55rem' }}>
          Lobbying detail →
        </Link>
      </div>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '0.75rem' }}>Floor votes</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          <VoteTallyCard chamber="House"  roll={votes_summary.House} />
          <VoteTallyCard chamber="Senate" roll={votes_summary.Senate} />
        </div>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '0.75rem' }}>
          Sponsors ({sponsors.length})
        </h2>
        {sponsors.length === 0 ? (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            No sponsor records for this session.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {sponsors.map(s => (
              <div key={`${s.people_id}-${s.sponsor_type}`} style={{
                padding: '0.5rem 0.75rem', background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: '4px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                  <Link href={`/politician/${slugify(s.display_name)}`}
                        style={{ fontSize: '0.82rem', color: 'var(--text)', textDecoration: 'none' }}>
                    {s.display_name}
                  </Link>
                  <span style={{ fontSize: '0.7rem', color: partyColor(s.party) }}>
                    {s.party}{s.district ? `-${s.district}` : ''}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                    {s.chamber}
                  </span>
                </div>
                <span style={{ fontSize: '0.66rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {s.sponsor_type}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '0.75rem' }}>
          Lobbied by ({principals.length} principals)
        </h2>
        {principals.length === 0 ? (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            No lobbyist disclosures filed on this bill in the {year} session.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {principals.slice(0, 30).map((p, i) => (
                <div key={p.principal} style={{
                  padding: '0.4rem 0.75rem', background: 'var(--surface)',
                  border: '1px solid var(--border)', borderRadius: '4px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                }}>
                  <div style={{ display: 'flex', gap: '0.4rem', flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', width: '20px', flexShrink: 0 }}>{i + 1}.</span>
                    <Link href={`/principal/${slugify(p.principal)}`}
                          style={{ fontSize: '0.78rem', color: 'var(--text)', textDecoration: 'none',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.principal}
                    </Link>
                  </div>
                  <span style={{ fontSize: '0.68rem', color: 'var(--teal)', flexShrink: 0 }}>
                    {p.filings} {p.filings === 1 ? 'filing' : 'filings'}
                  </span>
                </div>
              ))}
            </div>
            {principals.length > 30 && (
              <div style={{ marginTop: '0.75rem' }}>
                <Link href={`/lobbying/bill/${slug}${yearOverride ? `?year=${yearOverride}` : ''}`}
                      style={{ fontSize: '0.72rem', color: 'var(--teal)', textDecoration: 'none' }}>
                  View all {principals.length} principals →
                </Link>
              </div>
            )}
          </>
        )}
      </section>

      <div style={{ marginTop: '2.5rem' }}>
        <DataTrustBlock
          source="FL Senate bill pages, LegiScan session bill lists, FL House Lobbyist Disclosure portal"
          sourceUrl="https://www.flsenate.gov/Session/Bills"
          direct={['bill number', 'title', 'primary sponsor', 'last action', 'roll-call votes']}
          normalized={['bill slug (hb-1019 ↔ H1019)', 'status label']}
          inferred={[]}
          caveats={[
            'The same bill number (e.g. HB 1019) refers to different legislation each session year. Use the session selector above.',
            'Lobbyist disclosures are self-reported House filings only; Senate disclosures are filed separately.',
            'Sponsor and vote data is scoped to the session whose roll-call dates match the displayed year.',
          ]}
        />
      </div>
    </main>
  );
}
