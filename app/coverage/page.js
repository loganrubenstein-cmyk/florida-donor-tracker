import Link from 'next/link';
import SectionHeader from '@/components/shared/SectionHeader';

export const metadata = {
  title: 'Coverage & Limits',
  description: 'What data is included in Florida Donor Tracker, what years are covered, and what is missing.',
};

const StatusBadge = ({ status }) => {
  const styles = {
    complete: { background: 'rgba(128,255,160,0.12)', color: '#80ffa0', border: '1px solid rgba(128,255,160,0.25)' },
    partial:  { background: 'rgba(255,176,96,0.1)',   color: 'var(--orange)', border: '1px solid rgba(255,176,96,0.2)' },
    missing:  { background: 'rgba(90,106,136,0.15)',  color: 'var(--text-dim)', border: '1px solid var(--border)' },
  };
  return (
    <span style={{
      ...styles[status],
      fontSize: '0.68rem', padding: '0.1rem 0.45rem', borderRadius: '3px',
      fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
};

const Row = ({ label, status, note }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '0.6rem 0', borderBottom: '1px solid rgba(100,140,220,0.08)', fontSize: '0.82rem' }}>
    <div style={{ flex: 1, color: 'var(--text)' }}>{label}</div>
    <StatusBadge status={status} />
    {note && <div style={{ flex: 2, color: 'var(--text-dim)', fontSize: '0.78rem' }}>{note}</div>}
  </div>
);

export default function CoveragePage() {
  return (
    <main style={{ maxWidth: '800px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/data" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Data</Link>
        {' / '}
        <span>Coverage</span>
      </div>

      <SectionHeader title="Coverage & Limits" eyebrow="Florida Donor Tracker · Scope & Caveats" />
      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '2.5rem' }}>
        What this site covers, what years are included, and what is known to be missing or incomplete.
      </p>

      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '0.85rem', color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
          Data Categories
        </h2>
        <Row label="Committee contributions (receipts)" status="complete" note="~7.7M rows, all committees on file with FL Division of Elections" />
        <Row label="Candidate contributions (receipts)" status="complete" note="~3.2M rows" />
        <Row label="Committee expenditures (disbursements)" status="complete" note="Summary totals + top vendors for 1,673 committees; $2.78B tracked" />
        <Row label="Candidate expenditures" status="complete" note="Summary totals + top vendors for all candidates" />
        <Row label="Independent expenditures (IEs)" status="complete" note="$70.9M total across 492 committees; committee-level totals (transaction detail not yet included)" />
        <Row label="Lobbyist registrations" status="complete" note="All registered FL state lobbyists" />
        <Row label="Principal (client) registrations" status="complete" note="All registered FL lobbyist principals" />
        <Row label="Lobbyist compensation solicitations" status="complete" note="Compensation range disclosures by period" />
        <Row label="Candidate profiles" status="complete" note="All candidates in the DOE registry" />
        <Row label="Committee profiles" status="complete" note="All committees in the DOE registry" />
      </section>

      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '0.85rem', color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
          Year Coverage
        </h2>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.7 }}>
          <p>Contribution data spans from approximately <strong style={{ color: 'var(--text)' }}>1996 to present</strong>, reflecting the full history available from the Division of Elections bulk download.</p>
          <p style={{ marginTop: '0.5rem' }}>Older records (pre-2006) may be less complete due to filing gaps in the original Division of Elections database.</p>
          <p style={{ marginTop: '0.5rem' }}>Lobbyist data covers registration years available in the annual export from the Florida Lobbyist Registration Office.</p>
        </div>
      </section>

      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '0.85rem', color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
          Known Gaps &amp; Caveats
        </h2>
        <ul style={{ fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.8, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <li>Name deduplication is exact-match only. The same real-world donor may appear under multiple profiles if their name was filed differently across reports.</li>
          <li>Industry and entity type classifications are rules-based — not verified against any external registry.</li>
          <li>Lobbyist compensation is disclosed in bands (&lt;$10K, $10K–$24K, etc.) — exact amounts are not public.</li>
          <li>Race-level comparisons (candidates running for the same seat in the same year) are not yet supported.</li>
          <li>This site reflects <em>reported</em> campaign finance — late, amended, or unfiled reports will not appear.</li>
          <li>Federal PAC contributions to Florida candidates or committees are not included — only state-level filings.</li>
        </ul>
      </section>

      <div style={{ paddingTop: '1.5rem', borderTop: '1px solid var(--border)', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
        <Link href="/methodology" style={{ color: 'var(--teal)', textDecoration: 'none' }}>Full methodology →</Link>
        {' · '}
        <Link href="/data-dictionary" style={{ color: 'var(--teal)', textDecoration: 'none' }}>Data dictionary →</Link>
      </div>
    </main>
  );
}
