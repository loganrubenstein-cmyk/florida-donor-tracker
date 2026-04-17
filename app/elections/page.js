import { readFileSync } from 'fs';
import { join } from 'path';
import BackLinks from '@/components/BackLinks';
import ElectionsView from '@/components/elections/ElectionsView';
import SectionHeader from '@/components/shared/SectionHeader';

export const metadata = {
  title: 'Election Results',
  description: 'Florida election results 2012–2024 — ballot-style race results, vote totals, and finance data matched to candidates.',
};

function loadCycles() {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'public', 'data', 'elections', 'summary.json'), 'utf-8')
  );
}

function loadDistrictMap() {
  const stats = JSON.parse(
    readFileSync(join(process.cwd(), 'public', 'data', 'candidate_stats.json'), 'utf-8')
  );
  const map = {};
  for (const s of stats) {
    if (s.acct_num && s.district && s.election_year) {
      if (!map[s.acct_num]) map[s.acct_num] = {};
      map[s.acct_num][s.election_year] = s.district;
    }
  }
  return map;
}

export default function ElectionsPage() {
  const cycles = loadCycles();
  const districtMap = loadDistrictMap();

  const generals = cycles.filter(c => c.election_type === 'general');
  const totalRaces = generals.reduce((s, c) => s + c.contests_with_finance, 0);

  return (
    <main style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <BackLinks links={[{ href: '/', label: 'home' }, { href: '/cycles', label: 'cycles' }, { href: '/party-finance', label: 'party finance' }]} />

      <SectionHeader title="Election Results" eyebrow="Florida · 2012–2024" />
      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '-0.75rem', marginBottom: '2rem' }}>
        {generals.length} general elections · {totalRaces} races with finance data matched
      </div>

      <ElectionsView cycles={cycles} districtMap={districtMap} />
    </main>
  );
}
