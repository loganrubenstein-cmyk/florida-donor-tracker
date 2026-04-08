import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const LOBBYISTS_DIR  = join(process.cwd(), 'public', 'data', 'lobbyists');
const PRINCIPALS_DIR = join(process.cwd(), 'public', 'data', 'principals');

let _lobIndex = null;
let _priIndex = null;

export function loadLobbyistIndex() {
  if (_lobIndex) return _lobIndex;
  _lobIndex = JSON.parse(readFileSync(join(LOBBYISTS_DIR, 'index.json'), 'utf-8'));
  return _lobIndex;
}

export function loadLobbyist(slug) {
  return JSON.parse(readFileSync(join(LOBBYISTS_DIR, `${slug}.json`), 'utf-8'));
}

export function listLobbyistSlugs() {
  if (!existsSync(LOBBYISTS_DIR)) return [];
  return readdirSync(LOBBYISTS_DIR)
    .filter(f => f.endsWith('.json') && f !== 'index.json')
    .map(f => f.replace('.json', ''));
}

export function loadPrincipalIndex() {
  if (_priIndex) return _priIndex;
  _priIndex = JSON.parse(readFileSync(join(PRINCIPALS_DIR, 'index.json'), 'utf-8'));
  return _priIndex;
}

export function loadPrincipal(slug) {
  return JSON.parse(readFileSync(join(PRINCIPALS_DIR, `${slug}.json`), 'utf-8'));
}

export function listPrincipalSlugs() {
  if (!existsSync(PRINCIPALS_DIR)) return [];
  return readdirSync(PRINCIPALS_DIR)
    .filter(f => f.endsWith('.json') && f !== 'index.json')
    .map(f => f.replace('.json', ''));
}
