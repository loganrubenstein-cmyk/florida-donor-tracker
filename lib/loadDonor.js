import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const DONORS_DIR = join(process.cwd(), 'public', 'data', 'donors');

let _index = null;

export function loadDonorIndex() {
  if (_index) return _index;
  const path = join(DONORS_DIR, 'index.json');
  _index = JSON.parse(readFileSync(path, 'utf-8'));
  return _index;
}

let _indexBySlug = null;

export function loadDonor(slug) {
  const path = join(DONORS_DIR, `${decodeURIComponent(slug)}.json`);
  const profile = JSON.parse(readFileSync(path, 'utf-8'));
  // Merge industry from index (added by script 32) if available
  if (!profile.industry) {
    if (!_indexBySlug) {
      const idx = loadDonorIndex();
      _indexBySlug = {};
      for (const d of idx) _indexBySlug[d.slug] = d;
    }
    const entry = _indexBySlug[slug];
    if (entry?.industry) profile.industry = entry.industry;
  }
  return profile;
}

export function listDonorSlugs() {
  if (!existsSync(DONORS_DIR)) return [];
  return readdirSync(DONORS_DIR)
    .filter(f => f.endsWith('.json') && f !== 'index.json')
    .map(f => f.replace('.json', ''));
}
