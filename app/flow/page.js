import { readFileSync } from 'fs';
import { join } from 'path';
import nextDynamic from 'next/dynamic';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const FlowClient = nextDynamic(() => import('@/components/flow/FlowClient'), { ssr: false });

export const metadata = {
  title: 'Money Flow | FL Donor Tracker',
  description: 'Top donor-to-committee money flows in Florida politics.',
};

export default async function FlowPage() {
  const flows = JSON.parse(
    readFileSync(join(process.cwd(), 'public', 'data', 'donor_flows.json'), 'utf-8')
  );

  // Fetch donor industries from Supabase for the donors in this flow set
  const donorNames = [...new Set(flows.map(f => f.donor))];
  const db = getDb();
  const { data: donorRows } = await db
    .from('donors')
    .select('name, industry')
    .in('name', donorNames);

  const donorIndustries = {};
  (donorRows || []).forEach(d => {
    if (d.industry) donorIndustries[d.name] = d.industry;
  });

  return <FlowClient flows={flows} donorIndustries={donorIndustries} />;
}
