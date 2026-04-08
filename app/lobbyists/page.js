import LobbyistsList from '@/components/lobbyists/LobbyistsList';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Lobbyists | FL Donor Tracker',
  description: 'Search Florida registered lobbyists and their principals',
};

export default function LobbyistsPage() {
  return <LobbyistsList />;
}
