/**
 * Shared slugify logic — must match the Python slugify() in script 25
 * so that frontend links resolve to the correct donor profile files.
 *
 * Python version (scripts/25_export_donor_profiles.py):
 *   s = name.lower()
 *   s = re.sub(r"[^\w\s-]", "", s)
 *   s = re.sub(r"[\s_]+", "-", s).strip("-")
 *   s = re.sub(r"-{2,}", "-", s)
 *   return s[:120]
 */
export function slugify(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 120);
}
