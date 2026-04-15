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
