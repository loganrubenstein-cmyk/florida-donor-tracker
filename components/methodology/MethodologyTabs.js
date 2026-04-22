'use client';

import { useState } from 'react';
import Link from 'next/link';

const TABS = ['Methods', 'Dictionary', 'Coverage'];

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

const Field = ({ name, source, confidence, children }) => (
  <div style={{ padding: '0.75rem 0', borderBottom: '1px solid rgba(100,140,220,0.08)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
      <code style={{ fontSize: '0.8rem', color: 'var(--orange)', background: 'rgba(255,176,96,0.08)', padding: '0.1rem 0.4rem', borderRadius: '3px' }}>{name}</code>
      {confidence && <span className={`confidence-badge confidence-${confidence}`}>{confidence}</span>}
      {source && <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>from: {source}</span>}
    </div>
    <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>{children}</div>
  </div>
);

const FieldGroup = ({ title, children }) => (
  <section style={{ marginBottom: '2.5rem' }}>
    <h2 style={{ fontSize: '0.85rem', color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
      {title}
    </h2>
    {children}
  </section>
);

const StatusBadge = ({ status }) => {
  const styles = {
    complete: { background: 'rgba(128,255,160,0.12)', color: 'var(--green)', border: '1px solid rgba(128,255,160,0.25)' },
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

const CoverageRow = ({ label, status, note }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '0.6rem 0', borderBottom: '1px solid rgba(100,140,220,0.08)', fontSize: '0.82rem' }}>
    <div style={{ flex: 1, color: 'var(--text)' }}>{label}</div>
    <StatusBadge status={status} />
    {note && <div style={{ flex: 2, color: 'var(--text-dim)', fontSize: '0.78rem' }}>{note}</div>}
  </div>
);

function MethodsTab() {
  return (
    <>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '2.5rem' }}>
        Florida Influence ingests public records from the Florida Division of Elections and Lobbyist Registration Office,
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
          Occupation strings are mapped to 15 buckets using deterministic keyword rules:
        </p>
        <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.78rem', color: 'var(--text-dim)', margin: '0.5rem 0 0.75rem' }}>
          {['Legal', 'Real Estate', 'Healthcare', 'Finance & Insurance', 'Political / Lobbying',
            'Agriculture', 'Construction', 'Education', 'Technology / Engineering',
            'Retail & Hospitality', 'Business & Consulting', 'Government & Public Service',
            'Retired', 'Not Employed', 'Other'].map(b => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <p>
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

      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        Primary sources:{' '}
        <a href="https://dos.elections.myflorida.com/campaign-finance/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>FL Division of Elections</a>
        {' · '}
        <a href="https://www.floridalobbyist.gov/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>FL Lobbyist Registration Office</a>
        {' · '}
        <a href="https://dos.fl.gov/elections/candidates-committees/campaign-finance/committees/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)', textDecoration: 'none' }}>FL DOS Committee Registry</a>
      </div>
    </>
  );
}

function DictionaryTab() {
  return (
    <>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '2.5rem' }}>
        Every field shown on this site, where it comes from, and what it means.
        Confidence labels: <span className="confidence-badge confidence-direct">direct</span> = verbatim from filing,{' '}
        <span className="confidence-badge confidence-normalized">normalized</span> = cleaned/standardized,{' '}
        <span className="confidence-badge confidence-inferred">inferred</span> = matched across datasets,{' '}
        <span className="confidence-badge confidence-classified">classified</span> = assigned by rules classifier.
      </p>

      <FieldGroup title="Contributions">
        <Field name="amount" source="Division of Elections" confidence="direct">Dollar amount of the contribution as reported on the filing.</Field>
        <Field name="contribution_date" source="Division of Elections" confidence="normalized">Date of the contribution. Normalized from mixed ISO/US formats to YYYY-MM-DD.</Field>
        <Field name="contributor_name" source="Division of Elections" confidence="direct">Contributor name exactly as it appears in the filing.</Field>
        <Field name="contributor_name_normalized" source="computed" confidence="normalized">Uppercase, whitespace-collapsed version of contributor_name used for matching and search.</Field>
        <Field name="contributor_occupation" source="Division of Elections" confidence="direct">Self-reported occupation from the contribution filing. Frequently blank or non-standard.</Field>
        <Field name="contributor_address" source="Division of Elections" confidence="direct">Contributor mailing address as reported. Not geocoded or validated.</Field>
        <Field name="type_code" source="Division of Elections" confidence="direct">Contribution type: &apos;MON&apos; (monetary), &apos;INK&apos; (in-kind), &apos;LOA&apos; (loan), etc.</Field>
        <Field name="report_year" source="Division of Elections" confidence="direct">Calendar year of the report period.</Field>
        <Field name="report_type" source="Division of Elections" confidence="direct">Reporting period type (e.g., &apos;Q1&apos;, &apos;M6&apos;, &apos;TR&apos; for termination report).</Field>
      </FieldGroup>

      <FieldGroup title="Donors">
        <Field name="name" source="Division of Elections" confidence="normalized">Canonical donor name — the normalized form used as the dedup key.</Field>
        <Field name="slug" source="computed" confidence="normalized">URL-safe identifier derived from the normalized name. Used in donor profile URLs.</Field>
        <Field name="total_contributed" source="computed" confidence="direct">Sum of all matched contribution amounts. Only includes contributions whose normalized name exactly matches this donor.</Field>
        <Field name="num_contributions" source="computed" confidence="direct">Count of matched contribution rows.</Field>
        <Field name="is_corporate" source="computed" confidence="classified">Legacy boolean — true if the name contains corporate keywords. Superseded by entity_type.</Field>
        <Field name="entity_type" source="computed" confidence="classified">One of: individual, corporation, political_committee, party_committee, nonprofit, union, association, trust, unknown. Assigned by keyword classifier.</Field>
        <Field name="industry" source="computed" confidence="classified">Broad industry sector derived from contributor_occupation across all linked contributions. Most common occupation bucket wins.</Field>
      </FieldGroup>

      <FieldGroup title="Candidates">
        <Field name="name" source="Division of Elections" confidence="direct">Candidate name as filed.</Field>
        <Field name="office_desc" source="Division of Elections" confidence="direct">Office sought (e.g., &apos;State Representative&apos;, &apos;Governor&apos;).</Field>
        <Field name="district" source="Division of Elections" confidence="direct">Electoral district number.</Field>
        <Field name="party_code" source="Division of Elections" confidence="direct">Party affiliation: &apos;REP&apos;, &apos;DEM&apos;, &apos;NPA&apos;, etc.</Field>
        <Field name="election_year" source="Division of Elections" confidence="direct">Year of the election this candidate ran in.</Field>
        <Field name="status_desc" source="Division of Elections" confidence="direct">Current filing status: &apos;Active&apos;, &apos;Inactive&apos;, &apos;Withdrew&apos;, etc.</Field>
        <Field name="total_raised" source="computed" confidence="direct">Total contributions received, from candidate contribution records.</Field>
        <Field name="total_spent" source="computed" confidence="direct">Total expenditures, from candidate expenditure records.</Field>
      </FieldGroup>

      <FieldGroup title="Committees">
        <Field name="name" source="Division of Elections" confidence="direct">Committee name as registered.</Field>
        <Field name="acct_num" source="Division of Elections" confidence="direct">Division of Elections account number — unique identifier for the committee.</Field>
        <Field name="type_code" source="Division of Elections" confidence="direct">Committee type: CCE, PCO, PAC, ECO, or PTY.</Field>
        <Field name="total_raised" source="computed" confidence="direct">Sum of all contribution amounts received by this committee.</Field>
        <Field name="top_donors" source="computed" confidence="inferred">Top contributing donors by aggregate amount. Donor links are inferred via name matching.</Field>
      </FieldGroup>

      <FieldGroup title="Lobbyists & Principals">
        <Field name="lobbyist_name" source="Lobbyist Registration Office" confidence="direct">Registered lobbyist name as filed.</Field>
        <Field name="principal_name" source="Lobbyist Registration Office" confidence="direct">Principal (client) organization name as filed.</Field>
        <Field name="compensation_range" source="Lobbyist Registration Office" confidence="direct">Disclosed compensation amount. Below $50K: reported in $10K bands (e.g., &apos;$10,000–$19,999&apos;) — midpoint used. $50K and above: exact figures as reported to the state.</Field>
        <Field name="donor_link" source="computed" confidence="inferred">Link between a lobbyist or principal and a campaign donor profile. Matched by normalized name — not confirmed.</Field>
      </FieldGroup>
    </>
  );
}

function CoverageTab() {
  return (
    <>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '2.5rem' }}>
        What this site covers, what years are included, and what is known to be missing or incomplete.
      </p>

      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '0.85rem', color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
          Data Categories
        </h2>
        <CoverageRow label="Committee contributions (receipts)" status="complete" note="~19.4M rows — active and dissolved committees on file with FL Division of Elections" />
        <CoverageRow label="Candidate contributions (receipts)" status="complete" note="~2.6M rows" />
        <CoverageRow label="Committee expenditures (disbursements)" status="complete" note="Summary totals + top vendors for 1,673 committees; $2.78B tracked" />
        <CoverageRow label="Candidate expenditures" status="complete" note="Summary totals + top vendors for all candidates" />
        <CoverageRow label="Independent expenditures (IEs)" status="complete" note="$70.9M total across 492 committees; committee-level totals (transaction detail not yet included)" />
        <CoverageRow label="Lobbyist registrations" status="complete" note="All registered FL state lobbyists" />
        <CoverageRow label="Principal (client) registrations" status="complete" note="All registered FL lobbyist principals" />
        <CoverageRow label="Lobbyist compensation solicitations" status="complete" note="Compensation range disclosures by period" />
        <CoverageRow label="Candidate profiles" status="complete" note="All candidates in the DOE registry" />
        <CoverageRow label="Committee profiles" status="complete" note="All committees in the DOE registry" />
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
          Known Gaps & Caveats
        </h2>
        <ul style={{ fontSize: '0.82rem', color: 'var(--text-dim)', lineHeight: 1.8, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <li>Name deduplication is exact-match only. The same real-world donor may appear under multiple profiles if their name was filed differently across reports.</li>
          <li>Industry and entity type classifications are rules-based — not verified against any external registry.</li>
          <li>Lobbyist compensation below $50K is disclosed in $10K bands ($1–$9,999, $10K–$19,999 … $40K–$49,999) — we use band midpoints. Amounts of $50K+ are exact figures reported to the state.</li>
          <li>Race-level comparisons are available via the Race Tracker (<code style={{ fontSize: '0.78em' }}>/race/[office]/[year]</code>) — linked from each candidate profile. Multi-candidate district breakdowns are not yet included.</li>
          <li>This site reflects <em>reported</em> campaign finance — late, amended, or unfiled reports will not appear.</li>
          <li>Federal PAC contributions to Florida candidates or committees are not included — only state-level filings.</li>
        </ul>
      </section>
    </>
  );
}

export default function MethodologyTabs() {
  const [active, setActive] = useState('Methods');

  return (
    <>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '2rem', gap: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${active === tab ? 'var(--teal)' : 'transparent'}`,
              color: active === tab ? 'var(--teal)' : 'var(--text-dim)',
              fontSize: '0.72rem',
              padding: '0.55rem 1.25rem 0.6rem',
              cursor: 'pointer',
              marginBottom: '-1px',
              fontFamily: 'var(--font-mono)',
              transition: 'color 0.12s',
              letterSpacing: '0.08em',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {active === 'Methods' && <MethodsTab />}
      {active === 'Dictionary' && <DictionaryTab />}
      {active === 'Coverage' && <CoverageTab />}
    </>
  );
}
