import CyclesList from '@/components/cycles/CyclesList';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Election Cycles | FL Donor Tracker',
  description: 'Florida campaign finance by election cycle — 2008 through 2026.',
};

export default function CyclesPage() {
  return <CyclesList />;
}
