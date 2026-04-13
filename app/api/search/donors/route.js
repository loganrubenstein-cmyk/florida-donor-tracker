import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Cache for 1 hour — donor index changes only after quarterly pipeline runs
export const revalidate = 3600;

const BATCH = 5000;

export async function GET() {
  const db = getDb();
  const all = [];
  let from = 0;

  while (true) {
    const { data, error } = await db
      .from('donors')
      .select('slug, name, industry, top_location')
      .gte('total_combined', 1000)
      .order('total_combined', { ascending: false })
      .range(from, from + BATCH - 1);

    if (error) {
      return NextResponse.json({ error: 'Failed to load donor index' }, { status: 500 });
    }

    all.push(...data);
    if (data.length < BATCH) break;
    from += BATCH;
  }

  const index = all.map(d => ({
    id: d.slug,
    n:  d.name,
    t:  'donor',
    u:  `/donor/${d.slug}`,
    s:  [d.industry, d.top_location].filter(Boolean).join(' · '),
  }));

  return NextResponse.json(index);
}
