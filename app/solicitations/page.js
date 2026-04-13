// app/solicitations/page.js
import SolicitationsList from '@/components/solicitations/SolicitationsList';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Public Solicitations',
  description: 'Florida organizations registered to solicit political contributions — searchable directory with websites, solicitors, and filing dates.',
};

export default function SolicitationsPage() {
  return <SolicitationsList />;
}
