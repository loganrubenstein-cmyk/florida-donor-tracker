import DarkMoneyScoreboard from '@/components/tools/DarkMoneyScoreboard';

export const metadata = {
  title: 'Dark Money Scoreboard',
  description: 'Rank Florida political committees by transparency — see which are funded by identifiable individuals vs. corporate and PAC dark money.',
};

export default function TransparencyPage() {
  return <DarkMoneyScoreboard />;
}
