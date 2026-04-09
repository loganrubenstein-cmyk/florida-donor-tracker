import { loadDonor } from '@/lib/loadDonor';
import { loadAnnotations } from '@/lib/loadAnnotations';
import DonorProfile from '@/components/donors/DonorProfile';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const data = loadDonor(slug);
    const name = data.name || slug;
    return { title: `${name} | FL Donor Tracker` };
  } catch {
    return { title: 'Donor | FL Donor Tracker' };
  }
}

export default async function DonorPage({ params }) {
  const { slug } = await params;
  const data = loadDonor(slug);
  const annotations = loadAnnotations();
  return <DonorProfile data={data} annotations={annotations} />;
}
