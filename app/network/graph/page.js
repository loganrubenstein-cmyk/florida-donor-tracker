import NetworkClient from '@/components/network/NetworkClient';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Network Graph | FL Donor Tracker',
};

export default function NetworkGraphPage() {
  return <NetworkClient />;
}
