import { loadDonor } from '@/lib/loadDonor';
import { loadAnnotations } from '@/lib/loadAnnotations';
import DonorProfile from '@/components/donors/DonorProfile';
import { notFound } from 'next/navigation';
import { buildMeta } from '@/lib/seo';
import { fmtMoneyCompact } from '@/lib/fmt';

// Server-rendered on demand — no static file dependency
export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const data = await loadDonor(slug);
    const total = data.total_amount || data.total_combined || 0;
    const count = data.num_contributions || 0;
    const desc = `${data.name} — ${fmtMoneyCompact(total)} across ${count.toLocaleString()} contributions to Florida political committees and candidates.`;
    return buildMeta({ title: data.name, description: desc, path: `/donor/${slug}` });
  } catch {
    return { title: 'Donor' };
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
