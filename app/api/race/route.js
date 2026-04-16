import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { FEDERAL_OFFICE_CODES } from '@/lib/officeCodes';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const office = searchParams.get('office') || '';
  const year   = parseInt(searchParams.get('year') || '0', 10);

  if (!office || !year) {
    return NextResponse.json({ error: 'office and year required' }, { status: 400 });
  }

  const db = getDb();
  const federalCodes = [...FEDERAL_OFFICE_CODES];

  const { data, error } = await db
    .from('candidates')
    .select('acct_num, candidate_name, election_year, office_desc, party_code, district, hard_money_total, soft_money_total, total_combined, hard_num_contributions, num_linked_pcs')
    .ilike('office_desc', `%${office}%`)
    .eq('election_year', year)
    .not('office_code', 'in', `(${federalCodes.join(',')})`)
    .order('total_combined', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data || [], office, year });
}
