import { readFileSync } from 'fs';
import { join } from 'path';
import InvestigationsList from '@/components/investigations/InvestigationsList';
import { slugify } from '@/lib/slugify';
import { getDb } from '@/lib/db';

// Migrated to Supabase — no donors/index.json needed
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Investigations | FL Donor Tracker',
  description: 'Florida political entities with documented influence — cross-referenced with investigative journalism.',
};

function norm(s) {
  return String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function fmt(n) {
  if (!n) return null;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default async function InvestigationsPage() {
  const DATA = join(process.cwd(), 'public', 'data');

  // Annotations stay in static JSON (sourced, curated content)
  const annotations = JSON.parse(
    readFileSync(join(DATA, 'research', 'annotations.json'), 'utf-8')
  );
  const entityMap = annotations.entities;

  // Pull names we need to look up
  const entityList = Object.values(entityMap);
  const committeeNames = entityList.filter(e => e.type === 'committee').map(e => e.canonical_name);
  const donorNames     = entityList.filter(e => e.type !== 'committee').map(e => e.canonical_name);

  const db = getDb();

  // Look up committees by name
  let committeeRows = [];
  try {
    const { data } = await db
      .from('committees')
      .select('acct_num, committee_name, total_received')
      .in('committee_name', committeeNames);
    committeeRows = data || [];
  } catch (e) {
    console.error('investigations: committee lookup failed', e);
  }

  const committeeByName = {};
  for (const c of committeeRows) {
    committeeByName[norm(c.committee_name)] = c;
  }

  // Look up donors by name
  let donorRows = [];
  try {
    const { data } = await db
      .from('donors')
      .select('slug, name, total_combined')
      .in('name', donorNames);
    donorRows = data || [];
  } catch (e) {
    console.error('investigations: donor lookup failed', e);
  }

  const donorByName = {};
  for (const d of (donorRows || [])) {
    donorByName[norm(d.name)] = d;
  }

  const entities = entityList.map(e => {
    let page_url = '/';
    let stat_raw = 0;
    let stat = null;
    let stat_label = 'Total';

    if (e.type === 'committee') {
      const match = committeeByName[norm(e.canonical_name)];
      if (match) {
        page_url  = `/committee/${match.acct_num}`;
        stat_raw  = match.total_received;
        stat      = fmt(match.total_received);
        stat_label = 'Total Received';
      } else {
        page_url = `/candidates`;
      }
    } else {
      const match = donorByName[norm(e.canonical_name)];
      if (match) {
        page_url  = `/donor/${match.slug}`;
        stat_raw  = match.total_combined;
        stat      = fmt(match.total_combined);
        stat_label = 'Total Donated';
      } else {
        page_url = `/donor/${slugify(e.canonical_name)}`;
      }
    }

    return { ...e, page_url, stat_raw, stat, stat_label };
  });

  return <InvestigationsList entities={entities} />;
}
