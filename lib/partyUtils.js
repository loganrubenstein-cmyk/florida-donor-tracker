// lib/partyUtils.js
// Shared party classification logic used across ForceView, DetailPanel, CommitteeProfile.

export const PARTY_COLOR = {
  REP: 'var(--republican)',
  DEM: 'var(--democrat)',
  NPA: 'var(--text-dim)',
};

export const PARTY_OVERRIDES = {
  'c_4700': 'R', 'c_80335': 'R',
  'd_FRIENDS_OF_RON_DESANTIS': 'R', 'd_REPUBLICAN_NATIONAL_COMMITTEE': 'R',
  'c_61265': 'D', 'c_61018': 'D',
};

export const R_KW = ['REPUBLICAN', 'GOP', 'CONSERVATIVES FOR', 'AMERICANS FOR PROSPERITY'];
export const D_KW = ['DEMOCRAT', 'SEIU', 'AFSCME', 'AFL-CIO', 'LABOR ', 'UNION ', 'PROGRESSIVE'];

/**
 * Returns 'R', 'D', or null for a node object { id, label }.
 */
export function getPartyAffiliation(node) {
  if (!node) return null;
  if (PARTY_OVERRIDES[node.id]) return PARTY_OVERRIDES[node.id];
  const l = (node.label || '').toUpperCase();
  if (R_KW.some(k => l.includes(k))) return 'R';
  if (D_KW.some(k => l.includes(k))) return 'D';
  return null;
}

/**
 * Returns 'R', 'D', or null for a plain name + acct_num (used in CommitteeProfile).
 */
export function getPartyFromName(name, acctNum) {
  if (PARTY_OVERRIDES[`c_${acctNum}`]) return PARTY_OVERRIDES[`c_${acctNum}`];
  const u = (name || '').toUpperCase();
  if (R_KW.some(k => u.includes(k))) return 'R';
  if (D_KW.some(k => u.includes(k))) return 'D';
  return null;
}
