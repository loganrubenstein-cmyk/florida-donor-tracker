import PrincipalsList from '@/components/principals/PrincipalsList';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Lobbying Principals | FL Donor Tracker',
  description: 'Organizations and entities registered as lobbying principals with the Florida Legislature.',
};

export default function PrincipalsPage() {
  return <PrincipalsList />;
}
