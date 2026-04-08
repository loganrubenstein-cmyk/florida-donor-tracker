import DonorsList from '@/components/donors/DonorsList';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Donors | FL Donor Tracker',
  description: 'Search and explore all Florida political donors',
};

export default function DonorsPage() {
  return <DonorsList />;
}
