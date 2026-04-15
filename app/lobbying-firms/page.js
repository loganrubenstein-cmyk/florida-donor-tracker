import LobbyingFirmsList from '@/components/lobbyists/LobbyingFirmsList';

export const metadata = {
  title: 'Lobbying Firms',
  description: 'Top Florida lobbying firms by estimated compensation — searchable directory with trend chart and stats, 2007–2025.',
};

export default function LobbyingFirmsPage() {
  return <LobbyingFirmsList />;
}
