import { readFileSync } from 'fs';
import { join } from 'path';
import BackLinks from '@/components/BackLinks';
import ElectionsView from '@/components/elections/ElectionsView';
import SectionHeader from '@/components/shared/SectionHeader';

export const metadata = {
  title: 'Election Results',
  description: 'Florida election results 2012–2024 — finance-matched race results, cost per vote, and statewide race breakdowns.',
};

function loadCycles() {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'public', 'data', 'elections', 'summary.json'), 'utf-8')
  );
}

const LEG_CONTESTS = new Set(['State Representative', 'State Senator', 'STATE REPRESENTATIVE', 'STATE SENATOR']);

function loadLegLeaderboards(electionType = 'general') {
  const years = ['2012', '2014', '2016', '2018', '2020', '2022', '2024'];
  const result = {};
  for (const year of years) {
    try {
      const d = JSON.parse(
        readFileSync(join(process.cwd(), 'public', 'data', 'elections', `${year}_${electionType}.json`), 'utf-8')
      );
      const leg = (d.candidates || []).filter(c =>
        LEG_CONTESTS.has(c.contest_name) && c.finance_acct_num && c.finance_total_raised > 0
      );
      if (leg.length > 0) result[year] = leg;
    } catch {
      // file not found for this year
    }
  }
  return result;
}

export default function ElectionsPage() {
  const cycles = loadCycles();
  const legLeaderboards = loadLegLeaderboards('general');
  const legLeaderboardsPrimary = loadLegLeaderboards('primary');

  const generals = cycles.filter(c => c.election_type === 'general');
  const totalRaces = generals.reduce((s, c) => s + c.contests_with_finance, 0);

  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <BackLinks links={[{ href: '/', label: 'home' }]} />

      <SectionHeader title="Election Results" eyebrow="Florida · 2012–2024" />
      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '-0.75rem', marginBottom: '2rem' }}>
        {generals.length} general elections · {totalRaces} races with finance data matched
      </div>

      <ElectionsView
        cycles={cycles}
        legLeaderboards={legLeaderboards}
        legLeaderboardsPrimary={legLeaderboardsPrimary}
      />
    </main>
  );
}
