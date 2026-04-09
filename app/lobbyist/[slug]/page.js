import { loadLobbyist } from '@/lib/loadLobbyist';
import LobbyistProfile from '@/components/lobbyists/LobbyistProfile';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const data = await loadLobbyist(slug);
    return { title: `${data.name} | FL Donor Tracker` };
  } catch {
    return { title: 'Lobbyist | FL Donor Tracker' };
  }
}

export default async function LobbyistPage({ params }) {
  const { slug } = await params;
  let data;
  try {
    data = await loadLobbyist(slug);
  } catch {
    notFound();
  }
  return <LobbyistProfile data={data} />;
}
