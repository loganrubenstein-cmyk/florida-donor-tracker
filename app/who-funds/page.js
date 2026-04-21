import WhoFundsPage from '@/components/who-funds/WhoFundsPage';

export const metadata = {
  title: 'Who Funds Your District',
  description: 'Enter your Florida House or Senate district to see your legislator, their top donors, and how the money breaks down by type.',
};

export default function WhoFundsRoute() {
  return <WhoFundsPage />;
}
