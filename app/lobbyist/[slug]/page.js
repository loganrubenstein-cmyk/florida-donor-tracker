import { loadLobbyist } from '@/lib/loadLobbyist';
import LobbyistProfile from '@/components/lobbyists/LobbyistProfile';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const data = await loadLobbyist(slug);
    const firm = data.firm ? ` at ${data.firm}` : '';
    const desc = `${data.name} — Florida registered lobbyist${firm}. Represents ${data.num_principals || 0} principals.`;
    return { title: data.name, description: desc };
  } catch {
    return { title: 'Lobbyist' };
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
