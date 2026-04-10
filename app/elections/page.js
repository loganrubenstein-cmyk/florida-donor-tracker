import { readFileSync } from 'fs';
import { join } from 'path';
import BackLinks from '@/components/BackLinks';
import ElectionsView from '@/components/elections/ElectionsView';

export const metadata = {
  title: 'Election Results — Florida Donor Tracker',
  description: 'Florida election results 2012–2024 — finance-matched race results, cost per vote, and statewide race breakdowns.',
};

function loadCycles() {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'public', 'data', 'elections', 'summary.json'), 'utf-8')
  );
}

const LEG_CONTESTS = new Set(['State Representative', 'State Senator', 'STATE REPRESENTATIVE', 'STATE SENATOR']);

function loadLegLeaderboards() {
  const years = ['2012', '2014', '2016', '2018', '2020', '2022', '2024'];
  const result = {};
  for (const year of years) {
    try {
      const d = JSON.parse(
        readFileSync(join(process.cwd(), 'public', 'data', 'elections', `${year}_general.json`), 'utf-8')
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
  const legLeaderboards = loadLegLeaderboards();

  const generals = cycles.filter(c => c.election_type === 'general');
  const totalCycles = generals.length;
  const totalFinanceRaces = generals.reduce((s, c) => s + c.contests_with_finance, 0);
  const totalLegCandidates = Object.values(legLeaderboards).reduce((s, a) => s + a.length, 0);

  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
      <BackLinks links={[{ href: '/', label: 'home' }]} />

      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', color: 'var(--text)', margin: '0 0 0.3rem' }}>
          Election Results
        </h1>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
          {totalCycles} general elections · {totalFinanceRaces} races with finance data · {totalLegCandidates.toLocaleString()} FL legislative candidates matched · 2012–2024
        </div>
      </div>

      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', lineHeight: 1.8, marginBottom: '2rem', maxWidth: '620px', padding: '0.85rem 1rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '4px' }}>
        <strong style={{ color: 'var(--text)' }}>About this data:</strong> FL Division of Elections results matched to campaign finance records.
        Statewide races (US Senate, AG, CFO) have individual candidate breakdowns where finance was matched.
        FL House and Senate races show finance-matched candidates sorted by total raised — district-level
        groupings are not available in this dataset.
      </div>

      <ElectionsView cycles={cycles} legLeaderboards={legLeaderboards} />
    </main>
  );
}
