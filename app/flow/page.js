import { readFileSync } from 'fs';
import { join } from 'path';
import nextDynamic from 'next/dynamic';

export const dynamic = 'force-static';

const FlowClient = nextDynamic(() => import('@/components/flow/FlowClient'), { ssr: false });

export const metadata = {
  title: 'Money Flow | FL Donor Tracker',
  description: 'Top donor-to-committee money flows in Florida politics.',
};

export default function FlowPage() {
  const flows = JSON.parse(
    readFileSync(join(process.cwd(), 'public', 'data', 'donor_flows.json'), 'utf-8')
  );
  // Already sorted by total_amount desc from script — pass as-is
  return <FlowClient flows={flows} />;
}
