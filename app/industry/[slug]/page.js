import { readFileSync } from 'fs';
import { join } from 'path';
import IndustryProfile from '@/components/industries/IndustryProfile';
import { slugify } from '@/lib/slugify';

export const dynamic = 'force-static';

function loadSummary() {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'public', 'data', 'industry_summary.json'), 'utf-8')
  );
}

function loadTrends() {
  try {
    return JSON.parse(
      readFileSync(join(process.cwd(), 'public', 'data', 'industry_trends.json'), 'utf-8')
    );
  } catch {
    return null;
  }
}

function loadIndustryDonors(slug) {
  try {
    return JSON.parse(
      readFileSync(join(process.cwd(), 'public', 'data', 'industry_donors', `${slug}.json`), 'utf-8')
    );
  } catch {
    return null;
  }
}

export async function generateStaticParams() {
  const summary = loadSummary();
  return summary.industries.map(ind => ({ slug: slugify(ind.industry) }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const summary = loadSummary();
  const ind = summary.industries.find(i => slugify(i.industry) === slug);
  if (!ind) return { title: 'Industry | FL Donor Tracker' };
  return { title: `${ind.industry} | FL Donor Tracker` };
}

export default async function IndustryPage({ params }) {
  const { slug } = await params;
  const summary = loadSummary();
  const trends = loadTrends();
  const topDonors = loadIndustryDonors(slug);
  const ind = summary.industries.find(i => slugify(i.industry) === slug);
  return <IndustryProfile data={ind} totalAmount={summary.total_amount} trendData={trends} topDonors={topDonors} />;
}
