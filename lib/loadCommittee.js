// lib/loadCommittee.js
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const COMMITTEES_DIR = join(process.cwd(), 'public', 'data', 'committees');

export function loadCommittee(acctNum) {
  const file = join(COMMITTEES_DIR, `${acctNum}.json`);
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch (err) {
    throw new Error(`Failed to load committee ${acctNum}.json: ${err.message}`);
  }
}

export function listCommitteeAcctNums() {
  return readdirSync(COMMITTEES_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('.lobbyists') && !f.includes('.connections'))
    .map(f => f.replace('.json', ''));
}
