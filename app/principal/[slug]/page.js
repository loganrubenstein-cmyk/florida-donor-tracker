import { loadPrincipal } from '@/lib/loadLobbyist';
import PrincipalProfile from '@/components/principals/PrincipalProfile';
import { notFound } from 'next/navigation';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

function loadCompData(slug) {
  const path = join(process.cwd(), 'public', 'data', 'lobbyist_comp', 'by_principal', `${slug}.json`);
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const data = await loadPrincipal(slug);
    return { title: `${data.name} | FL Donor Tracker` };
  } catch {
    return { title: 'Principal | FL Donor Tracker' };
  }
}

export default async function PrincipalPage({ params }) {
  const { slug } = await params;
  let data;
  try {
    data = await loadPrincipal(slug);
  } catch {
    notFound();
  }
  const compData = loadCompData(slug);
  return <PrincipalProfile data={data} compData={compData} />;
}
