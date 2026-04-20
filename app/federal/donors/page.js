import Link from 'next/link';
import { loadFederalFLDonors } from '@/lib/loadFederalFLDonors';
import { fmtMoney, fmtMoneyCompact, fmtDate } from '@/lib/fmt';
import { buildMeta } from '@/lib/seo';
import BackLinks from '@/components/BackLinks';

export const dynamic = 'force-dynamic';

export const metadata = buildMeta({
  title: 'Florida Federal Individual Donors',
  description: 'Top Florida-based individual donors to federal campaigns — FEC Schedule A bulk data.',
  path: '/federal/donors',
});

const PAGE_SIZE = 100;

export default async function FederalDonorsPage({ searchParams }) {
  const sp = await searchParams;
  const q = typeof sp?.q === 'string' ? sp.q : '';
  const page = Math.max(1, parseInt(sp?.page || '1', 10));
  const offset = (page - 1) * PAGE_SIZE;

  const { rows, total, not_loaded } = await loadFederalFLDonors({ limit: PAGE_SIZE, offset, q });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="container" style={{ padding: '1.5rem 1rem 3rem' }}>
      <BackLinks links={[{ href: '/', label: 'Home' }, { href: '/federal', label: 'FL Federal' }]} />

      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
          Federal Elections · Florida · Individual Donors
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', margin: 0, color: 'var(--text)' }}>
          FL Federal Individual Donors
        </h1>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
          {not_loaded
            ? 'FEC individual-contribution data (itcont.txt) is still being loaded. Check back after the next pipeline run.'
            : `${total.toLocaleString()} Florida-based individuals across cycles 2016–2026.`}
        </div>
      </div>

      {!not_loaded && (
        <form method="get" style={{ marginBottom: '1.25rem' }}>
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search donor name…"
            style={{
              width: '100%', maxWidth: '420px',
              padding: '0.55rem 0.75rem',
              border: '1px solid var(--border)', borderRadius: '3px',
              background: 'var(--surface)', color: 'var(--text)',
              fontFamily: 'var(--font-mono)', fontSize: '0.82rem',
            }}
          />
        </form>
      )}

      {not_loaded ? (
        <div style={{ padding: '1rem', border: '1px dashed var(--border)', borderRadius: '3px', fontSize: '0.82rem', color: 'var(--text-dim)' }}>
          The <code>fec_indiv</code> table is empty or the materialized view has not been built yet.
          The loader (script 105) filters FEC bulk itcont.txt to Florida only and refreshes{' '}
          <code>fec_indiv_donor_totals_mv</code> at the end. Once the GitHub Actions run completes, this page populates automatically.
        </div>
      ) : (
        <>
          <div style={{ border: '1px solid var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: 'var(--surface)' }}>
                  <Th>Donor</Th>
                  <Th>City</Th>
                  <Th>Top Employer</Th>
                  <Th>Cycles</Th>
                  <Th right>Gifts</Th>
                  <Th right>Total</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.donor_key} style={{ borderBottom: i === rows.length - 1 ? 'none' : '1px solid var(--border)' }}>
                    <Td>{r.name || '—'}</Td>
                    <Td>{r.top_city || '—'}</Td>
                    <Td>{r.top_employer || '—'}</Td>
                    <Td>{Array.isArray(r.cycles) ? r.cycles.join(', ') : '—'}</Td>
                    <Td right mono>{(r.num_contributions || 0).toLocaleString()}</Td>
                    <Td right mono>{fmtMoney(Number(r.total_amount))}</Td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><Td>{q ? `No results for "${q}".` : 'No rows.'}</Td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', fontSize: '0.76rem' }}>
              {page > 1 && (
                <Link href={`/federal/donors?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page - 1) })}`}
                  style={{ color: 'var(--teal)', textDecoration: 'none' }}>← prev</Link>
              )}
              <span style={{ color: 'var(--text-dim)' }}>page {page} / {totalPages}</span>
              {page < totalPages && (
                <Link href={`/federal/donors?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page + 1) })}`}
                  style={{ color: 'var(--teal)', textDecoration: 'none' }}>next →</Link>
              )}
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: '2rem', padding: '0.9rem', border: '1px solid var(--border)', borderRadius: '3px', fontSize: '0.76rem', color: 'var(--text-dim)' }}>
        Individual contributions are aggregated by normalized donor name (lowercase, trimmed).
        Rows represent only FEC Schedule A filings where the contributor state = FL. Totals include
        refunds and amendments — amounts may differ from candidate-side tallies. Source:{' '}
        <a href="https://www.fec.gov/campaign-finance-data/contributions-individuals-file-description/"
           target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}>
          FEC individual contributions file (itcont.txt)
        </a>.
      </div>
    </div>
  );
}

function Th({ children, right }) {
  return (
    <th style={{ padding: '0.55rem 0.7rem', textAlign: right ? 'right' : 'left', color: 'var(--text-dim)', fontWeight: 400, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)' }}>
      {children}
    </th>
  );
}

function Td({ children, right, mono }) {
  return (
    <td style={{ padding: '0.5rem 0.7rem', textAlign: right ? 'right' : 'left', color: 'var(--text)', fontFamily: mono ? 'var(--font-mono)' : 'inherit' }}>
      {children}
    </td>
  );
}
