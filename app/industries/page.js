import IndustriesList from '@/components/industries/IndustriesList';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Industries',
  description: 'Florida political contributions broken down by donor industry — Legal, Real Estate, Healthcare, and more',
};

export default function IndustriesPage() {
  return <IndustriesList />;
}
