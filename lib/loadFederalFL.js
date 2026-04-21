import { getDb } from '@/lib/db';

export async function loadFederalFL(cycle = null) {
  const db = getDb();
  const { data, error } = await db.rpc('get_federal_fl_overview', { p_cycle: cycle });
  if (error) console.error('loadFederalFL:', error.message);
  return data || { cycles: [], cycle, candidates: [], totals: {} };
}
