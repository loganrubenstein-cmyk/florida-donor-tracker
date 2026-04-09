import { readFileSync } from 'fs';
import { join } from 'path';
import CycleProfile from '@/components/cycles/CycleProfile';

export const dynamic = 'force-static';

function loadStats() {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'public', 'data', 'candidate_stats.json'), 'utf-8')
  );
}

function loadCycleDonors() {
  try {
    return JSON.parse(
      readFileSync(join(process.cwd(), 'public', 'data', 'cycle_donors.json'), 'utf-8')
    );
  } catch {
    return {};
  }
}

export async function generateStaticParams() {
  const stats = loadStats();
  const years = [...new Set(stats.map(c => c.election_year).filter(Boolean))];
  return years.map(year => ({ year }));
}

export async function generateMetadata({ params }) {
  const { year } = await params;
  return { title: `${year} Florida Elections | FL Donor Tracker` };
}

export default async function CyclePage({ params }) {
  const { year } = await params;
  const stats = loadStats();
  const cycleDonors = loadCycleDonors();
  const candidates = stats.filter(c => c.election_year === year);
  const topDonors = cycleDonors[year] || [];
  return <CycleProfile year={year} candidates={candidates} topDonors={topDonors} />;
}
