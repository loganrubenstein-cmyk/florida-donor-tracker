import { loadLobbyist, listLobbyistSlugs } from '@/lib/loadLobbyist';
import LobbyistProfile from '@/components/lobbyists/LobbyistProfile';

export const dynamic = 'force-static';

export async function generateStaticParams() {
  return listLobbyistSlugs().map(slug => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const data = loadLobbyist(slug);
    return { title: `${data.name} | FL Donor Tracker` };
  } catch {
    return { title: 'Lobbyist | FL Donor Tracker' };
  }
}

export default async function LobbyistPage({ params }) {
  const { slug } = await params;
  const data = loadLobbyist(slug);
  return <LobbyistProfile data={data} />;
}
