import DonorOverlap from '@/components/tools/DonorOverlap';

export const metadata = {
  title: 'Donor Overlap',
  description: 'Compare any two Florida candidates or committees — find their shared donors, overlapping money, and the industries funding both.',
};

export default function ComparePage() {
  return <DonorOverlap />;
}
