import { loadPrincipal } from '@/lib/loadLobbyist';
import PrincipalProfile from '@/components/principals/PrincipalProfile';
import { notFound } from 'next/navigation';
import { buildMeta } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const data = await loadPrincipal(slug);
    const { fmtMoneyCompact } = await import('@/lib/fmt');
    const comp = data.comp?.total_comp || 0;
    const desc = `${data.name} — lobbying principal with ${data.total_lobbyists || 0} FL lobbyists.${comp > 0 ? ` ${fmtMoneyCompact(comp)} in compensation.` : ''}`;
    return buildMeta({ title: data.name, description: desc, path: `/principal/${slug}` });
  } catch {
    return { title: 'Principal' };
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
