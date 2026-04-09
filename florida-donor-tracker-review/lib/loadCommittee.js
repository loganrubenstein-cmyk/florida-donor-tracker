// lib/loadCommittee.js
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const COMMITTEES_DIR = join(process.cwd(), 'public', 'data', 'committees');

export function loadCommittee(acctNum) {
  const file = join(COMMITTEES_DIR, `${acctNum}.json`);
  return JSON.parse(readFileSync(file, 'utf-8'));
}

export function listCommitteeAcctNums() {
  return readdirSync(COMMITTEES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''));
}
