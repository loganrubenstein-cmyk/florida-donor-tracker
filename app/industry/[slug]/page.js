import { readFileSync } from 'fs';
import { join } from 'path';
import IndustryProfile from '@/components/industries/IndustryProfile';
import { slugify } from '@/lib/slugify';

export const dynamic = 'force-static';

function loadSummary() {
  const raw = readFileSync(
    join(process.cwd(), 'public', 'data', 'industry_summary.json'),
    'utf-8'
  );
  return JSON.parse(raw);
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
  const ind = summary.industries.find(i => slugify(i.industry) === slug);
  return <IndustryProfile data={ind} totalAmount={summary.total_amount} />;
}
