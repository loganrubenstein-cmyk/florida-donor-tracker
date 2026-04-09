import { readFileSync } from 'fs';
import { join } from 'path';
import InvestigationsList from '@/components/investigations/InvestigationsList';
import { slugify } from '@/lib/slugify';

export const dynamic = 'force-static';

export const metadata = {
  title: 'Investigations | FL Donor Tracker',
  description: 'Florida political entities with documented influence — cross-referenced with investigative journalism.',
};

// Normalize a name for matching: uppercase, strip non-alphanumeric
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

export default function InvestigationsPage() {
  const DATA = join(process.cwd(), 'public', 'data');

  // Load annotations
  const annotations = JSON.parse(
    readFileSync(join(DATA, 'research', 'annotations.json'), 'utf-8')
  );
  const entityMap = annotations.entities; // keyed dict

  // Load indexes for stat lookup
  const committeeIndex = JSON.parse(readFileSync(join(DATA, 'committees', 'index.json'), 'utf-8'));
  const donorIndex     = JSON.parse(readFileSync(join(DATA, 'donors', 'index.json'), 'utf-8'));

  // Map committee name → acct + total
  const committeeByName = {};
  for (const c of committeeIndex) {
    committeeByName[norm(c.committee_name)] = c;
  }
  // Map donor name → slug + total
  const donorByName = {};
  for (const d of donorIndex) {
    donorByName[norm(d.name)] = d;
  }

  const entities = Object.values(entityMap).map(e => {
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
        // Fallback: candidate page for DeSantis-style candidate committees
        page_url = `/candidates`;
      }
    } else {
      // corporate donor
      const match = donorByName[norm(e.canonical_name)];
      if (match) {
        page_url  = `/donor/${match.slug}`;
        stat_raw  = match.total_combined;
        stat      = fmt(match.total_combined);
        stat_label = 'Total Donated';
      } else {
        // Try slugified name as fallback
        page_url = `/donor/${slugify(e.canonical_name)}`;
      }
    }

    return { ...e, page_url, stat_raw, stat, stat_label };
  });

  return <InvestigationsList entities={entities} />;
}
