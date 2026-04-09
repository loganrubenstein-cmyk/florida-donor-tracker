import { loadDonor } from '@/lib/loadDonor';
import { loadAnnotations } from '@/lib/loadAnnotations';
import DonorProfile from '@/components/donors/DonorProfile';
import { notFound } from 'next/navigation';

// Server-rendered on demand — no static file dependency
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const data = await loadDonor(slug);
    return { title: `${data.name} | FL Donor Tracker` };
  } catch {
    return { title: 'Donor | FL Donor Tracker' };
  }
}

export default async function DonorPage({ params }) {
  const { slug } = await params;
  let data;
  try {
    data = await loadDonor(slug);
  } catch {
    notFound();
  }
  const annotations = loadAnnotations();
  return <DonorProfile data={data} annotations={annotations} />;
}
