import Link from 'next/link';
import SectionHeader from '@/components/shared/SectionHeader';

export const metadata = {
  title: 'Methodology',
  description: 'How Florida Donor Tracker collects, normalizes, classifies, and presents campaign finance data.',
};

const Section = ({ title, children }) => (
  <section style={{ marginBottom: '2.5rem' }}>
    <h2 style={{ fontSize: '0.85rem', color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
      {title}
    </h2>
    <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', lineHeight: 1.75 }}>
      {children}
    </div>
  </section>
);

export default function MethodologyPage() {
  return (
    <main style={{ maxWidth: '800px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/data" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Data</Link>
        {' / '}
        <span>Methodology</span>
      </div>

      <SectionHeader title="Methodology" eyebrow="Florida Donor Tracker · Data Methods" />
      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '2.5rem' }}>
        Florida Donor Tracker ingests public records from the Florida Division of Elections and Lobbyist Registration Office,
        normalizes them, and builds a unified index of donors, candidates, committees, and lobbyist relationships.
        This page documents every transformation applied to that data and its confidence level.
      </p>

      <Section title="Data Collection">
        <p>Raw data is downloaded in bulk from the <a href="https://dos.elections.myflorida.com/campaign-finance/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>Florida Division of Elections CGI API</a> (TreFin.exe).
        Each committee and candidate is queried individually; results are tab-delimited text files stored locally then imported into a PostgreSQL database.</p>
        <p style={{ marginTop: '0.75rem' }}>Lobbyist and solicitation data is sourced from the <a href="https://www.floridalobbyist.gov/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>Florida Lobbyist Registration Office</a> annual export.</p>
      </Section>

      <Section title="Confidence Levels">
        <p>Every data point on this site is labeled with one of four confidence levels:</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <span className="confidence-badge confidence-direct">direct</span>
            <span>Taken verbatim from an official filing. No transformation. Examples: contribution amount, contribution date, committee name.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <span className="confidence-badge confidence-normalized">normalized</span>
            <span>Cleaned from raw text but structurally unchanged. Examples: uppercase contributor names, trimmed whitespace, standardized date formats.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <span className="confidence-badge confidence-inferred">inferred</span>
            <span>Derived by matching across datasets. Examples: linking a contributor name to a known donor profile, matching a lobbyist to a donor by name similarity.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <span className="confidence-badge confidence-classified">classified</span>
            <span>Assigned to a category by a rules-based classifier. Examples: industry sector, donor entity type (individual vs. corporation vs. PAC).</span>
          </div>
        </div>
      </Section>

      <Section title="Name Deduplication">
        <p>
          Contributor names appear inconsistently across filings — &quot;JOHN SMITH&quot;, &quot;John Smith&quot;, &quot;Smith, John&quot;, &quot;J Smith&quot; may all be the same person.
          We normalize all names to uppercase with collapsed whitespace, then apply an exact-match deduplication step.
          No fuzzy name matching is currently applied to the donor index — a donor profile only aggregates contributions whose
          normalized name matches exactly. This means some donors are split across multiple profiles.
        </p>
        <p style={{ marginTop: '0.75rem' }}>
          Donor-to-contribution links are labeled <span className="confidence-badge confidence-inferred">inferred</span> — the match is based on normalized name only,
          not address, occupation, or any other corroborating field. This approach errs toward undercounting (misses real matches)
          rather than overcounting (avoids false merges).
        </p>
        <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(100,140,220,0.05)', border: '1px solid rgba(100,140,220,0.15)', borderRadius: '3px' }}>
          <strong style={{ color: 'var(--text)', fontSize: '0.78rem' }}>Why do different pages show different donor counts?</strong>
          <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <li><strong>~22M+ contribution records</strong> — every filed contribution line, including duplicates across amendments.</li>
            <li><strong>~880K+ contributor names</strong> — unique normalized names across all records (before deduplication).</li>
            <li><strong>~883K donor profiles</strong> — unique names that received a deduplication slot; browseable at <Link href="/donors" style={{ color: 'var(--teal)', textDecoration: 'none' }}>/donors</Link>.</li>
            <li><strong>~94K donors in the default directory view</strong> — a filtered subset of donors with ≥$1K in total contributions, to keep the directory usable. Smaller donors exist in the index; search for them directly.</li>
          </ul>
        </div>
      </Section>

      <Section title="Entity Type Classification">
        <p>
          Donors are classified into entity types (individual, corporation, PAC, party, nonprofit, union, etc.)
          using a keyword-based rules classifier applied to normalized donor names.
          Keywords include: &quot;INC&quot;, &quot;LLC&quot;, &quot;CORP&quot;, &quot;PAC&quot;, &quot;COMMITTEE&quot;, &quot;PARTY&quot;, &quot;FOUNDATION&quot;, &quot;TRUST&quot;, &quot;UNION&quot;, &quot;ASSOCIATION&quot;, etc.
          All entity type assignments are labeled <span className="confidence-badge confidence-classified">classified</span>.
          The classifier does not use machine learning — it is deterministic and auditable.
        </p>
      </Section>

      <Section title="Industry Classification">
        <p>
          Industry sectors are assigned to donors based on the <strong>contributor_occupation</strong> field in contribution filings.
          Occupation strings are mapped to ~15 buckets: Real Estate, Healthcare, Finance, Legal, Energy, Agriculture, Technology, Education, and others.
          Assignments are <span className="confidence-badge confidence-classified">classified</span> — the raw occupation string is preserved and visible on donor profiles.
          Many occupations are blank or non-standard; those donors appear as &quot;Unclassified&quot;.
        </p>
      </Section>

      <Section title="Committee Types">
        <p>
          Florida committees are classified by the Division of Elections as: CCE (Candidate Campaign Committee), PCO (Political Committee Opposing),
          PAC (Political Action Committee), ECO (Electioneering Communications Organization), or PTY (Political Party).
          These types are sourced directly from the committee registry and are <span className="confidence-badge confidence-direct">direct</span> data.
        </p>
      </Section>

      <Section title="Known Limits">
        <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <li>Lobbyist compensation below $50K is disclosed in $10K bands — we use midpoint estimates. Amounts of $50K+ are exact figures as reported to the state.</li>
          <li>Race-level candidate comparisons (same office, same year) are not yet built.</li>
          <li>Data freshness varies — some committees may lag by weeks or months depending on filing schedules.</li>
          <li>Name deduplication is exact-match only — contributions from the same person with differently-spelled names are not merged.</li>
          <li>Independent expenditure data shows committee-level totals. Individual IE transaction detail is not yet included.</li>
        </ul>
      </Section>

      <div style={{ marginTop: '1rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
        <Link href="/data-dictionary" style={{ color: 'var(--teal)', textDecoration: 'none' }}>Data dictionary →</Link>
        {' · '}
        <Link href="/coverage" style={{ color: 'var(--teal)', textDecoration: 'none' }}>Coverage &amp; limits →</Link>
      </div>
    </main>
  );
}
