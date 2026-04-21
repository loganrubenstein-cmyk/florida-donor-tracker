import Link from 'next/link';
import { loadFederalFL } from '@/lib/loadFederalFL';
import { fmtMoney, fmtMoneyCompact } from '@/lib/fmt';
import { buildMeta } from '@/lib/seo';
import BackLinks from '@/components/BackLinks';

export const dynamic = 'force-dynamic';

export const metadata = buildMeta({
  title: 'Florida Federal Candidates',
  description: 'Florida U.S. Senate and House candidates — PAC contributions from FEC bulk data.',
  path: '/federal',
});

const OFFICE_LABEL = { P: 'President', S: 'U.S. Senate', H: 'U.S. House' };
const PARTY_COLOR = { REP: 'var(--republican)', DEM: 'var(--democrat)' };

export default async function FederalPage({ searchParams }) {
  const sp = await searchParams;
  const cycle = sp?.cycle ? parseInt(sp.cycle, 10) : 2026;
  const data = await loadFederalFL(cycle);
  const { cycles, candidates, totals } = data;

  const byOffice = { S: [], H: [], P: [] };
  for (const c of candidates) {
    if (byOffice[c.office]) byOffice[c.office].push(c);
  }

  return (
    <div className="container" style={{ padding: '1.5rem 1rem 3rem' }}>
      <BackLinks links={[{ href: '/', label: 'Home' }]} />

      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
          Federal Elections · Florida
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', margin: 0, color: 'var(--text)' }}>
          FL Federal Candidates — {cycle}
        </h1>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
          {totals.num_candidates?.toLocaleString() || 0} candidates · {fmtMoneyCompact(totals.pac_total || 0)} PAC contributions across {(totals.pac_payments || 0).toLocaleString()} transactions.
        </div>
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <Link href="/federal/donors" style={{ fontSize: '0.78rem', color: 'var(--teal)', textDecoration: 'none' }}>
          View FL individual donors →
        </Link>
      </div>

      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {cycles.map(c => (
          <Link
            key={c}
            href={`/federal?cycle=${c}`}
            style={{
              padding: '0.35rem 0.75rem',
              border: '1px solid var(--border)',
              borderRadius: '3px',
              fontSize: '0.76rem',
              color: c === cycle ? 'var(--orange)' : 'var(--text-dim)',
              background: c === cycle ? 'rgba(255,176,96,0.08)' : 'transparent',
              textDecoration: 'none',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {c}
          </Link>
        ))}
      </div>

      {['S', 'H', 'P'].map(office =>
        byOffice[office].length > 0 ? (
          <OfficeSection
            key={office}
            title={OFFICE_LABEL[office]}
            candidates={byOffice[office]}
          />
        ) : null
      )}

      <div style={{ marginTop: '2rem', padding: '0.9rem', border: '1px solid var(--border)', borderRadius: '3px', fontSize: '0.76rem', color: 'var(--text-dim)' }}>
        PAC contribution totals reflect FEC Schedule A (pas2) bulk data for the selected cycle. Individual donor contributions are available on the{' '}
        <Link href="/federal/donors" style={{ color: 'var(--teal)' }}>FL Federal Donors</Link> page. Source:{' '}
        <a href="https://www.fec.gov/data/browse-data/?tab=bulk-data" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}>FEC bulk data</a>.
      </div>
    </div>
  );
}

function OfficeSection({ title, candidates }) {
  const top = candidates.slice(0, 50);
  return (
    <div style={{ marginBottom: '1.75rem' }}>
      <h2 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: '0.6rem' }}>
        {title} — {candidates.length} candidates
      </h2>
      <div style={{ border: '1px solid var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ background: 'var(--surface)' }}>
              <Th>Candidate</Th>
              <Th>Party</Th>
              <Th>District</Th>
              <Th>I/C</Th>
              <Th right>Payments</Th>
              <Th right>PAC $</Th>
            </tr>
          </thead>
          <tbody>
            {top.map((c, i) => (
              <tr key={c.cand_id} style={{ borderBottom: i === top.length - 1 ? 'none' : '1px solid var(--border)' }}>
                <Td>{c.name}</Td>
                <Td><span style={{ color: PARTY_COLOR[c.party] || 'var(--text-dim)' }}>{c.party || '—'}</span></Td>
                <Td>{c.district || '—'}</Td>
                <Td>{c.ici || '—'}</Td>
                <Td right mono>{(c.pac_payments || 0).toLocaleString()}</Td>
                <Td right mono>{fmtMoney(Number(c.pac_total))}</Td>
              </tr>
            ))}
          </tbody>
        </table>
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
