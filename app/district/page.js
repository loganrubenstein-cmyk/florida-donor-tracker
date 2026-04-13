import DistrictLookup from '@/components/tools/DistrictLookup';

export const metadata = {
  title: 'Money in Your District',
  description: 'Enter your Florida House or Senate district to see your legislator, their fundraising, top donors, voting record, and how they compare to peers.',
};

export default function DistrictPage() {
  return <DistrictLookup />;
}
