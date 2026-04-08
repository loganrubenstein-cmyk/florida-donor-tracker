import { loadDonor, listDonorSlugs } from '@/lib/loadDonor';
import DonorProfile from '@/components/donors/DonorProfile';

export const dynamic = 'force-static';

export async function generateStaticParams() {
  return listDonorSlugs().map(slug => ({ slug }));
}

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
  return <DonorProfile data={data} />;
}
