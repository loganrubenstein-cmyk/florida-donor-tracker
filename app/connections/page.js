import ConnectionsView from '@/components/connections/ConnectionsView';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Committee Connections | FL Donor Tracker',
  description: 'Political committees sharing treasurers, addresses, donors, or money flows',
};

export default function ConnectionsPage() {
  return <ConnectionsView />;
}
