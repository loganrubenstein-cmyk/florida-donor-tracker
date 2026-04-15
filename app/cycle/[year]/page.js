import { readFileSync } from 'fs';
import { join } from 'path';
import { notFound } from 'next/navigation';
import CycleProfile from '@/components/cycles/CycleProfile';
import { buildMeta } from '@/lib/seo';

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

function loadElectionSummary() {
  try {
    return JSON.parse(
      readFileSync(join(process.cwd(), 'public', 'data', 'elections', 'summary.json'), 'utf-8')
    );
  } catch {
    return [];
  }
}

export async function generateStaticParams() {
  const stats = loadStats();
  const years = [...new Set(stats.map(c => c.election_year).filter(Boolean))];
  return years.map(year => ({ year }));
}

export async function generateMetadata({ params }) {
  const { year } = await params;
  return buildMeta({
    title: `${year} Florida Elections`,
    description: `${year} Florida election cycle — campaign finance totals, top raisers, statewide race results, and party breakdowns.`,
    path: `/cycle/${year}`,
  });
}

export default async function CyclePage({ params }) {
  const { year } = await params;
  const yearNum = parseInt(year, 10);
  if (!yearNum || yearNum < 2000 || yearNum > 2100) notFound();
  const stats = loadStats();
  const cycleDonors = loadCycleDonors();
  const electionSummary = loadElectionSummary();
  const candidates = stats.filter(c => c.election_year === year);
  const topDonors = cycleDonors[year] || [];
  const electionCycle = electionSummary.find(e => String(e.year) === String(year) && e.election_type === 'general') || null;
  return <CycleProfile year={year} candidates={candidates} topDonors={topDonors} electionCycle={electionCycle} />;
}
