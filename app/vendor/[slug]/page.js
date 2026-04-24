import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadVendor } from '@/lib/loadVendor';
import { fmtMoney, fmtMoneyCompact } from '@/lib/fmt';
import { buildMeta } from '@/lib/seo';
import BackLinks from '@/components/BackLinks';
import NewsBlock from '@/components/shared/NewsBlock';

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const v = await loadVendor(slug);
    if (!v) return { title: 'Vendor' };
    const total = Number(v.totals.committee_total) + Number(v.totals.candidate_total);
    return buildMeta({
      title: v.entity.canonical_name,
      description: `${v.entity.canonical_name} — paid ${fmtMoneyCompact(total)} by Florida political committees and candidates.`,
      path: `/vendor/${slug}`,
    });
  } catch {
    return { title: 'Vendor' };
  }
}

export default async function VendorPage({ params }) {
  const { slug } = await params;
  const v = await loadVendor(slug);
  if (!v) notFound();

  const { entity, totals, by_committee, by_candidate, by_year, aliases, news } = v;
  const grandTotal = Number(totals.committee_total) + Number(totals.candidate_total);
  const grandPayments = (totals.committee_payments || 0) + (totals.candidate_payments || 0);

  return (
    <div className="container" style={{ padding: '1.5rem 1rem 3rem' }}>
      <BackLinks links={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }, { href: '/vendors', label: 'All Vendors' }]} />

      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
          Vendor / Payee
          {entity.is_government ? ' · Government' : ''}
          {entity.is_franchise ? ' · Franchise' : ''}
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', margin: 0, color: 'var(--text)' }}>
          {entity.canonical_name}
        </h1>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
          Paid <strong style={{ color: 'var(--orange)' }}>{fmtMoney(grandTotal)}</strong>
          {' '}across {grandPayments.toLocaleString()} payments from Florida political committees and candidates.
        </div>
      </div>

      <div className="rg-2" style={{ marginBottom: '1.5rem' }}>
        <StatBox
          label="From committees"
          value={fmtMoney(Number(totals.committee_total))}
          sub={`${(totals.committee_payments || 0).toLocaleString()} payments`}
        />
        <StatBox
          label="From candidates"
          value={fmtMoney(Number(totals.candidate_total))}
          sub={`${(totals.candidate_payments || 0).toLocaleString()} payments`}
        />
      </div>

      {by_committee.length > 0 && (
        <Section title={`Top committees paying ${entity.canonical_name}`}>
          <Table
            headers={['Committee', 'Payments', 'Total']}
            rows={by_committee.map(c => [
              c.committee_name
                ? <Link href={`/committee/${c.acct_num}`} style={{ color: 'var(--teal)' }}>{c.committee_name}</Link>
                : <span style={{ color: 'var(--text-dim)' }}>Acct {c.acct_num}</span>,
              (c.num_payments || 0).toLocaleString(),
              fmtMoney(Number(c.total)),
            ])}
          />
        </Section>
      )}

      {by_candidate.length > 0 && (
        <Section title={`Top candidates paying ${entity.canonical_name}`}>
          <Table
            headers={['Candidate', 'Payments', 'Total']}
            rows={by_candidate.map(c => [
              c.candidate_name
                ? <span style={{ color: 'var(--orange)' }}>{c.candidate_name}</span>
                : <span style={{ color: 'var(--text-dim)' }}>Acct {c.acct_num}</span>,
              (c.num_payments || 0).toLocaleString(),
              fmtMoney(Number(c.total)),
            ])}
          />
        </Section>
      )}

      {by_year.length > 0 && (
        <Section title="Payments by year">
          <YearBars data={by_year} />
          <div style={{ marginTop: '1rem' }}>
            <Table
              headers={['Year', 'Payments', 'Total']}
              rows={by_year.map(y => [y.report_year, (y.n || 0).toLocaleString(), fmtMoney(Number(y.total))])}
            />
          </div>
        </Section>
      )}

      {aliases.length > 0 && (
        <Section title="Name variants merged into this vendor">
          <div style={{ fontSize: '0.76rem', color: 'var(--text-dim)', lineHeight: 1.7 }}>
            {aliases.join(' · ')}
          </div>
        </Section>
      )}

      {news?.length > 0 && <NewsBlock articles={news} />}

      <div style={{ marginTop: '2rem', padding: '0.9rem', border: '1px solid var(--border)', borderRadius: '3px', fontSize: '0.76rem', color: 'var(--text-dim)' }}>
        Totals aggregate raw expenditures filed by Florida committees and candidates with the FL Division of Elections. Name matching uses exact normalization plus pg_trgm fuzzy similarity (≥0.75); look-alike vendor names are clustered under a single canonical entity.
      </div>
      <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <a href={`https://www.usaspending.gov/search/?keyword=${encodeURIComponent(entity.canonical_name)}`} target="_blank" rel="noopener noreferrer"
           style={{ fontSize: '0.68rem', color: 'var(--teal)', textDecoration: 'none', border: '1px solid rgba(77,216,240,0.25)', borderRadius: '3px', padding: '0.2rem 0.55rem' }}>
          Search on USASpending ↗
        </a>
        <a href="https://apps.fldfs.com/FACTS/" target="_blank" rel="noopener noreferrer"
           style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textDecoration: 'none', border: '1px solid var(--border)', borderRadius: '3px', padding: '0.2rem 0.55rem' }}>
          FL Contracts (FACTS) ↗
        </a>
      </div>
    </div>
  );
}

function StatBox({ label, value, sub }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '3px', padding: '0.9rem 1rem', background: 'var(--surface)' }}>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>{label}</div>
      <div style={{ fontSize: '1.35rem', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h2 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: '0.6rem' }}>{title}</h2>
      {children}
    </div>
  );
}

function YearBars({ data }) {
  const rows = [...data].sort((a, b) => Number(a.report_year) - Number(b.report_year));
  const max = Math.max(...rows.map(r => Number(r.total) || 0), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.35rem', height: '120px', padding: '0.5rem 0.25rem 0', border: '1px solid var(--border)', borderRadius: '3px', background: 'var(--surface)' }}>
      {rows.map(r => {
        const h = (Number(r.total) / max) * 100;
        return (
          <div key={r.report_year} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', minWidth: 0 }}>
            <div title={`${r.report_year}: ${fmtMoney(Number(r.total))} (${(r.n || 0).toLocaleString()} payments)`}
              style={{ width: '100%', height: `${Math.max(h, 2)}%`, background: 'var(--teal)', opacity: 0.75, borderRadius: '2px 2px 0 0' }} />
            <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{String(r.report_year).slice(-2)}</div>
          </div>
        );
      })}
    </div>
  );
}

function Table({ headers, rows }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
        <thead>
          <tr style={{ background: 'var(--surface)' }}>
            {headers.map((h, i) => (
              <th key={i} style={{ padding: '0.55rem 0.7rem', textAlign: i === 0 ? 'left' : 'right', color: 'var(--text-dim)', fontWeight: 400, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ borderBottom: ri === rows.length - 1 ? 'none' : '1px solid var(--border)' }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ padding: '0.5rem 0.7rem', textAlign: ci === 0 ? 'left' : 'right', color: 'var(--text)', fontFamily: ci === 0 ? 'inherit' : 'var(--font-mono)' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
