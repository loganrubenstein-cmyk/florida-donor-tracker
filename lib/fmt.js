/**
 * lib/fmt.js — number and date formatting helpers.
 * Used across home, stats strips, and profile headers.
 */

/**
 * Format a dollar amount for display.
 * fmtMoney(1234567.89)  → "$1,234,567.89"
 * fmtMoney(1234567, 0)  → "$1,234,567"
 */
export function fmtMoney(value, decimals = 2) {
  const n = Number(value);
  if (!isFinite(n)) return '$0';
  return '$' + n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Compact dollar format — abbreviates large numbers.
 * fmtMoneyCompact(1_234_567)  → "$1.2M"
 * fmtMoneyCompact(89_000)     → "$89K"
 * fmtMoneyCompact(500)        → "$500"
 */
export function fmtMoneyCompact(value) {
  const n = Number(value);
  if (!isFinite(n) || n === 0) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (abs >= 1_000_000)     return `${sign}$${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1_000)         return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/**
 * Format a plain integer count.
 * fmtCount(1234567) → "1,234,567"
 */
export function fmtCount(value) {
  const n = Number(value);
  if (!isFinite(n)) return '0';
  return Math.round(n).toLocaleString('en-US');
}

/**
 * Compact count — abbreviates large numbers.
 * fmtCountCompact(1_234_567) → "1.2M"
 * fmtCountCompact(12_000)    → "12K"
 * fmtCountCompact(500)       → "500"
 */
export function fmtCountCompact(value) {
  const n = Number(value);
  if (!isFinite(n)) return '0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${Math.round(abs)}`;
}

/**
 * Format a date string for display.
 * fmtDate('2024-03-15') → 'Mar 15, 2024'
 */
export function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return String(value);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ── Bill number utilities ─────────────────────────────────────────────────

// 'H1019' → 'hb-1019'   'S0220' → 'sb-220'
// Used to join legislator_votes.bill_number → bill_disclosures.bill_slug
export function billNumberToSlug(billNum) {
  if (!billNum) return null;
  const m = String(billNum).match(/^([HS])0*(\d+)$/i);
  if (!m) return null;
  return `${m[1].toUpperCase() === 'H' ? 'hb' : 'sb'}-${m[2]}`;
}

// 'H1019' → 'HB 1019'   'S0220' → 'SB 220'
export function billNumberToDisplay(billNum) {
  if (!billNum) return String(billNum || '');
  const m = String(billNum).match(/^([HS])0*(\d+)$/i);
  if (!m) return String(billNum);
  return `${m[1].toUpperCase() === 'H' ? 'HB' : 'SB'} ${m[2]}`;
}

// Returns the odd-year start of the FL biennial session a given year belongs to.
// getBienniumStart(2025) → 2025   getBienniumStart(2026) → 2025
// getBienniumStart(2024) → 2023   getBienniumStart(2023) → 2023
// Used so HB 220 (2025-26 session) ≠ HB 220 (2023-24 session) in any cache or join.
export function getBienniumStart(year) {
  const y = Number(year);
  return y % 2 === 1 ? y : y - 1;
}
