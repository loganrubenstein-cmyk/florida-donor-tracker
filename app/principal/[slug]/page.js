import { loadPrincipal, listPrincipalSlugs } from '@/lib/loadLobbyist';
import PrincipalProfile from '@/components/principals/PrincipalProfile';

export const dynamic = 'force-static';

export async function generateStaticParams() {
  return listPrincipalSlugs().map(slug => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const data = loadPrincipal(slug);
    return { title: `${data.name} | FL Donor Tracker` };
  } catch {
    return { title: 'Principal | FL Donor Tracker' };
  }
}

export default async function PrincipalPage({ params }) {
  const { slug } = await params;
  const data = loadPrincipal(slug);
  return <PrincipalProfile data={data} />;
}
