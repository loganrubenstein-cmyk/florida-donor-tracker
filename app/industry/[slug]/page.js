import { readFileSync } from 'fs';
import { join } from 'path';
import IndustryProfile from '@/components/industries/IndustryProfile';
import { slugify } from '@/lib/slugify';
import { getDb } from '@/lib/db';
import { buildMeta } from '@/lib/seo';

export const dynamic = 'force-dynamic';

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

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const summary = loadSummary();
  const ind = summary.industries.find(i => slugify(i.industry) === slug);
  if (!ind) return { title: 'Industry' };
  return buildMeta({
    title: ind.industry,
    description: `${ind.industry} — Florida political contributions by sector. Top donors, cycle trends, and connected legislators.`,
    path: `/industry/${slug}`,
  });
}

export default async function IndustryPage({ params }) {
  const { slug } = await params;
  const summary = loadSummary();
  const trends = loadTrends();
  const topDonors = loadIndustryDonors(slug);
  const ind = summary.industries.find(i => slugify(i.industry) === slug);

  let topLegislators = [];
  if (ind?.industry) {
    try {
      const db = getDb();
      const { data: indRows } = await db
        .from('industry_by_committee')
        .select('acct_num, total')
        .eq('industry', ind.industry)
        .order('total', { ascending: false })
        .limit(100);

      if (indRows?.length) {
        const acctNums = indRows.map(r => r.acct_num);
        const totalsMap = Object.fromEntries(indRows.map(r => [r.acct_num, parseFloat(r.total) || 0]));

        const { data: legRows } = await db
          .from('legislators')
          .select('people_id, display_name, chamber, party, district, acct_num')
          .in('acct_num', acctNums)
          .eq('is_current', true);

        topLegislators = (legRows || [])
          .map(l => ({ ...l, industry_total: totalsMap[l.acct_num] || 0 }))
          .sort((a, b) => b.industry_total - a.industry_total)
          .slice(0, 10);
      }
    } catch {}
  }

  return <IndustryProfile data={ind} totalAmount={summary.total_amount} trendData={trends} topDonors={topDonors} topLegislators={topLegislators} />;
}
