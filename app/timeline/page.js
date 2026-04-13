import InfluenceTimeline from '@/components/tools/InfluenceTimeline';

export const metadata = {
  title: 'Influence Timeline',
  description: 'Visualize the fundraising timeline for any Florida candidate — see donation spikes, PAC formations, and pre-election surges.',
};

export default function TimelinePage() {
  return <InfluenceTimeline />;
}
