import Link from 'next/link';
import SectionHeader from '@/components/shared/SectionHeader';

export const metadata = {
  title: 'Data',
  description: 'Data dictionary, coverage notes, sources, and methodology for Florida Donor Tracker.',
};

export default function DataHub() {
  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <span>Data</span>
      </div>

      <SectionHeader title="Data" eyebrow="Florida Donor Tracker · Sources & Coverage" />
      <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '0.25rem' }}>
        Everything you need to understand what this site shows, where it comes from, and what it doesn&apos;t cover.
      </p>

      <div className="hub-grid">
        <Link href="/methodology" className="hub-card">
          <div className="hub-card-title">Methodology</div>
          <div className="hub-card-desc">Data collection, normalization, name deduplication, classification logic, and inference confidence levels.</div>
        </Link>

        <Link href="/data-dictionary" className="hub-card">
          <div className="hub-card-title">Data Dictionary</div>
          <div className="hub-card-desc">Field-by-field reference for every value shown on donor, candidate, and committee profile pages.</div>
        </Link>

        <Link href="/coverage" className="hub-card">
          <div className="hub-card-title">Coverage &amp; Limits</div>
          <div className="hub-card-desc">Which years, entity types, and transaction categories are included — and what&apos;s known to be missing.</div>
        </Link>
      </div>

      <div style={{ marginTop: '3rem', borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
        <h2 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '1rem', letterSpacing: '0.05em' }}>
          PRIMARY SOURCES
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.82rem', color: 'var(--text-dim)' }}>
          <div>
            <a href="https://dos.elections.myflorida.com/campaign-finance/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>
              Florida Division of Elections — Campaign Finance
            </a>
            <span style={{ marginLeft: '0.75rem' }}>Contributions and expenditures for committees and candidates</span>
          </div>
          <div>
            <a href="https://www.floridalobbyist.gov/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>
              Florida Lobbyist Registration Office
            </a>
            <span style={{ marginLeft: '0.75rem' }}>Lobbyist registrations, principal clients, and compensation solicitations</span>
          </div>
          <div>
            <a href="https://dos.fl.gov/elections/candidates-committees/campaign-finance/committees/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>
              Florida DOS — Committee Registry
            </a>
            <span style={{ marginLeft: '0.75rem' }}>PACs, ECOs, PCOs, CCEs, and party committees</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '2rem', fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
        Data is updated periodically. Last pipeline run dates are noted on each profile page.
        If you believe a record is incorrect, check the original filing at the Division of Elections before contacting us.
      </div>
    </main>
  );
}
