import PulsePage from '@/components/home/PulsePage';

export const metadata = {
  title: 'Pulse',
  description: 'Live feed of recent large contributions, newly registered committees, and top donors of the current Florida election cycle.',
};

export default function PulseRoute() {
  return <PulsePage />;
}
