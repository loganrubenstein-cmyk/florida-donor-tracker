// lib/loadCandidate.js
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const CANDIDATES_DIR = join(process.cwd(), 'public', 'data', 'candidates');

export function loadCandidate(acctNum) {
  const file = join(CANDIDATES_DIR, `${acctNum}.json`);
  return JSON.parse(readFileSync(file, 'utf-8'));
}

export function listCandidateAcctNums() {
  return readdirSync(CANDIDATES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}
