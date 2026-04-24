import { buildMeta } from '@/lib/seo';
import VendorsList from '@/components/vendors/VendorsList';
import BackLinks from '@/components/BackLinks';

export const revalidate = 1800;

export const metadata = buildMeta({
  title: 'Vendors — Florida Political Payees',
  description: 'Every vendor, consultant, and payee hired by Florida political committees and candidates.',
  path: '/vendors',
});

export default function VendorsPage() {
  return (
    <main className="container" style={{ padding: '1.5rem 1rem 3rem' }}>
      <BackLinks links={[{ href: '/', label: 'Home' }, { href: '/tools', label: 'Tools' }]} />
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
          Directory
        </div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', margin: 0, color: 'var(--text)' }}>
          Vendors &amp; Payees
        </h1>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)', marginTop: '0.5rem', lineHeight: 1.5 }}>
          205,254 canonical vendors aggregated from FL committee + candidate expenditures. Aliased names (e.g., &quot;FPL&quot; and &quot;Florida Power &amp; Light&quot;) are merged via exact normalization + pg_trgm fuzzy matching.
        </div>
      </div>
      <VendorsList />
    </main>
  );
}
