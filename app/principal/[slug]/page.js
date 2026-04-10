import { loadPrincipal } from '@/lib/loadLobbyist';
import PrincipalProfile from '@/components/principals/PrincipalProfile';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const data = await loadPrincipal(slug);
    return { title: `${data.name} | FL Donor Tracker` };
  } catch {
    return { title: 'Principal | FL Donor Tracker' };
  }
}

export default async function PrincipalPage({ params }) {
  const { slug } = await params;
  let data;
  try {
    data = await loadPrincipal(slug);
  } catch {
    notFound();
  }
  return <PrincipalProfile data={data} compData={data.comp} />;
}
