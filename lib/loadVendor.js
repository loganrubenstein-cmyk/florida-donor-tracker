import { getDb } from '@/lib/db';

export async function loadVendor(slug) {
  const db = getDb();
  const { data, error } = await db.rpc('get_vendor_profile', { p_slug: slug });
  if (error) throw error;
  if (!data || !data.entity) return null;
  return data;
}
