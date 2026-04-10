import LegislatorsList from '@/components/legislators/LegislatorsList';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Florida Legislators — Florida Donor Tracker',
  description: 'All 160 current Florida House and Senate members — voting records, campaign finance, committee assignments.',
};

export default function LegislatorsPage() {
  return <LegislatorsList />;
}
