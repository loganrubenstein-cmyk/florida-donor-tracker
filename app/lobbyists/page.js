import LobbyistsList from '@/components/lobbyists/LobbyistsList';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Lobbyists',
  description: 'Search Florida registered lobbyists, their principals, and campaign donation influence',
};

export default function LobbyistsPage() {
  return <LobbyistsList />;
}
