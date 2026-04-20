import { getDb } from '@/lib/db';

export async function loadFederalFLDonors({ limit = 100, offset = 0, q = '' } = {}) {
  const db = getDb();
  let query = db
    .from('fec_indiv_donor_totals_mv')
    .select('donor_key, name, top_city, top_employer, num_contributions, total_amount, first_dt, last_dt, cycles', { count: 'exact' })
    .order('total_amount', { ascending: false });

  if (q && q.trim()) {
    query = query.ilike('name', `%${q.trim()}%`);
  }
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    if (/does not exist|schema cache/i.test(error.message || '')) {
      return { rows: [], total: 0, not_loaded: true };
    }
    throw error;
  }
  return { rows: data || [], total: count || 0, not_loaded: false };
}
