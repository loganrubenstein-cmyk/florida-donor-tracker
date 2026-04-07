import { loadNetworkGraph } from '@/lib/loadNetworkGraph';
import NetworkClient from '@/components/network/NetworkClient';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Political Influence Network | FL Donor Tracker',
};

export default function NetworkPage() {
  const data = loadNetworkGraph();
  return <NetworkClient data={data} />;
}
