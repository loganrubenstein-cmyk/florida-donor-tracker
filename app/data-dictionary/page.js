import Link from 'next/link';

export const metadata = {
  title: 'Data Dictionary',
  description: 'Field-by-field reference for every value in Florida Donor Tracker profiles.',
};

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

const Group = ({ title, children }) => (
  <section style={{ marginBottom: '2.5rem' }}>
    <h2 style={{ fontSize: '0.85rem', color: 'var(--teal)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
      {title}
    </h2>
    {children}
  </section>
);

export default function DataDictionary() {
  return (
    <main style={{ maxWidth: '800px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
        <Link href="/" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/data" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Data</Link>
        {' / '}
        <span>Data Dictionary</span>
      </div>

      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', color: 'var(--text)', marginBottom: '0.5rem' }}>
        Data Dictionary
      </h1>
      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '2.5rem' }}>
        Every field shown on this site, where it comes from, and what it means.
        Confidence labels: <span className="confidence-badge confidence-direct">direct</span> = verbatim from filing,{' '}
        <span className="confidence-badge confidence-normalized">normalized</span> = cleaned/standardized,{' '}
        <span className="confidence-badge confidence-inferred">inferred</span> = matched across datasets,{' '}
        <span className="confidence-badge confidence-classified">classified</span> = assigned by rules classifier.
      </p>

      <Group title="Contributions">
        <Field name="amount" source="Division of Elections" confidence="direct">Dollar amount of the contribution as reported on the filing.</Field>
        <Field name="contribution_date" source="Division of Elections" confidence="normalized">Date of the contribution. Normalized from mixed ISO/US formats to YYYY-MM-DD.</Field>
        <Field name="contributor_name" source="Division of Elections" confidence="direct">Contributor name exactly as it appears in the filing.</Field>
        <Field name="contributor_name_normalized" source="computed" confidence="normalized">Uppercase, whitespace-collapsed version of contributor_name used for matching and search.</Field>
        <Field name="contributor_occupation" source="Division of Elections" confidence="direct">Self-reported occupation from the contribution filing. Frequently blank or non-standard.</Field>
        <Field name="contributor_address" source="Division of Elections" confidence="direct">Contributor mailing address as reported. Not geocoded or validated.</Field>
        <Field name="type_code" source="Division of Elections" confidence="direct">Contribution type: &apos;MON&apos; (monetary), &apos;INK&apos; (in-kind), &apos;LOA&apos; (loan), etc.</Field>
        <Field name="report_year" source="Division of Elections" confidence="direct">Calendar year of the report period.</Field>
        <Field name="report_type" source="Division of Elections" confidence="direct">Reporting period type (e.g., &apos;Q1&apos;, &apos;M6&apos;, &apos;TR&apos; for termination report).</Field>
      </Group>

      <Group title="Donors">
        <Field name="name" source="Division of Elections" confidence="normalized">Canonical donor name — the normalized form used as the dedup key.</Field>
        <Field name="slug" source="computed" confidence="normalized">URL-safe identifier derived from the normalized name. Used in donor profile URLs.</Field>
        <Field name="total_contributed" source="computed" confidence="direct">Sum of all matched contribution amounts. Only includes contributions whose normalized name exactly matches this donor.</Field>
        <Field name="num_contributions" source="computed" confidence="direct">Count of matched contribution rows.</Field>
        <Field name="is_corporate" source="computed" confidence="classified">Legacy boolean — true if the name contains corporate keywords. Superseded by entity_type.</Field>
        <Field name="entity_type" source="computed" confidence="classified">One of: individual, corporation, political_committee, party_committee, nonprofit, union, association, trust, unknown. Assigned by keyword classifier.</Field>
        <Field name="industry" source="computed" confidence="classified">Broad industry sector derived from contributor_occupation across all linked contributions. Most common occupation bucket wins.</Field>
      </Group>

      <Group title="Candidates">
        <Field name="name" source="Division of Elections" confidence="direct">Candidate name as filed.</Field>
        <Field name="office_desc" source="Division of Elections" confidence="direct">Office sought (e.g., &apos;State Representative&apos;, &apos;Governor&apos;).</Field>
        <Field name="district" source="Division of Elections" confidence="direct">Electoral district number.</Field>
        <Field name="party_code" source="Division of Elections" confidence="direct">Party affiliation: &apos;REP&apos;, &apos;DEM&apos;, &apos;NPA&apos;, etc.</Field>
        <Field name="election_year" source="Division of Elections" confidence="direct">Year of the election this candidate ran in.</Field>
        <Field name="status_desc" source="Division of Elections" confidence="direct">Current filing status: &apos;Active&apos;, &apos;Inactive&apos;, &apos;Withdrew&apos;, etc.</Field>
        <Field name="total_raised" source="computed" confidence="direct">Total contributions received, from candidate contribution records.</Field>
        <Field name="total_spent" source="computed" confidence="direct">Total expenditures, from candidate expenditure records.</Field>
      </Group>

      <Group title="Committees">
        <Field name="name" source="Division of Elections" confidence="direct">Committee name as registered.</Field>
        <Field name="acct_num" source="Division of Elections" confidence="direct">Division of Elections account number — unique identifier for the committee.</Field>
        <Field name="type_code" source="Division of Elections" confidence="direct">Committee type: CCE, PCO, PAC, ECO, or PTY.</Field>
        <Field name="total_raised" source="computed" confidence="direct">Sum of all contribution amounts received by this committee.</Field>
        <Field name="top_donors" source="computed" confidence="inferred">Top contributing donors by aggregate amount. Donor links are inferred via name matching.</Field>
      </Group>

      <Group title="Lobbyists &amp; Principals">
        <Field name="lobbyist_name" source="Lobbyist Registration Office" confidence="direct">Registered lobbyist name as filed.</Field>
        <Field name="principal_name" source="Lobbyist Registration Office" confidence="direct">Principal (client) organization name as filed.</Field>
        <Field name="compensation_range" source="Lobbyist Registration Office" confidence="direct">Disclosed compensation band (e.g., &apos;$10,000 - $24,999&apos;). Exact figures are not public.</Field>
        <Field name="donor_link" source="computed" confidence="inferred">Link between a lobbyist or principal and a campaign donor profile. Matched by normalized name — not confirmed.</Field>
      </Group>
    </main>
  );
}
