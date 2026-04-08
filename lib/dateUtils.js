// lib/dateUtils.js

export function fmtArticleDate(s, { includeDay = false } = {}) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const opts = { month: 'short', year: 'numeric' };
  if (includeDay) opts.day = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}
