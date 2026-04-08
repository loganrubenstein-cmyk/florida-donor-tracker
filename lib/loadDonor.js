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

export function loadDonor(slug) {
  const path = join(DONORS_DIR, `${slug}.json`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function listDonorSlugs() {
  if (!existsSync(DONORS_DIR)) return [];
  return readdirSync(DONORS_DIR)
    .filter(f => f.endsWith('.json') && f !== 'index.json')
    .map(f => f.replace('.json', ''));
}
