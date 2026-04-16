import { readFileSync } from 'fs';
import { join } from 'path';
import { getDb } from '@/lib/db';
import FlowPageClient from '@/components/flow/FlowPageClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Money Flow',
  description: 'Explore Florida political money — follow industries to donors, committees, and candidates.',
};

export default async function FlowPage() {
  const flows = JSON.parse(
    readFileSync(join(process.cwd(), 'public', 'data', 'donor_flows.json'), 'utf-8')
  );

  const flowsByCycle = JSON.parse(
    readFileSync(join(process.cwd(), 'public', 'data', 'donor_flows_by_year.json'), 'utf-8')
  );

  // Donor industries for Sankey diagram
  const allDonors = new Set([
    ...flows.map(f => f.donor),
    ...Object.values(flowsByCycle.by_cycle).flatMap(arr => arr.map(f => f.donor)),
  ]);

  const db = getDb();
  const { data: donorRows } = await db
    .from('donors')
    .select('name, industry')
    .in('name', [...allDonors]);

  const donorIndustries = {};
  (donorRows || []).forEach(d => {
    if (d.industry) donorIndustries[d.name] = d.industry;
  });

  return (
    <FlowPageClient
      flows={flows}
      flowsByCycle={flowsByCycle}
      donorIndustries={donorIndustries}
    />
  );
}
