// Florida Division of Elections office codes
// Used to classify candidates as state-level vs federal for display filtering.

export const FEDERAL_OFFICE_CODES = new Set(['PRE', 'USR', 'USS', 'USP', 'USV']);

export const STATE_OFFICE_CODES = new Set([
  'GOV', // Governor
  'STS', // State Senator
  'STR', // State Representative
  'ATG', // Attorney General
  'CFO', // Chief Financial Officer
  'AGR', // Commissioner of Agriculture
  'STA', // State Attorney
  'PUB', // Public Defender
  'CTJ', // Circuit/County Judge
  'SCJ', // Supreme Court Justice
  'DCA', // District Court of Appeal
  'CSC', // County School Superintendent
  'CCC', // County Commissioner
  'CLK', // Clerk of Courts
  'SHF', // Sheriff
  'TAX', // Tax Collector
  'SUP', // Supervisor of Elections
  'PRP', // Property Appraiser
  'ECW', // Special district / other state
  'EWF', // Special district / other state
  'LOX', // Local / other
]);

export function isStateLevelOffice(office_code) {
  if (!office_code) return true; // assume state if missing
  return !FEDERAL_OFFICE_CODES.has(office_code.toUpperCase());
}

export function isStateLevelOfficeDesc(office_desc) {
  if (!office_desc) return true;
  const desc = office_desc.toLowerCase();
  return !(
    desc.includes('u.s.') ||
    desc.includes('u. s.') ||
    desc.includes('united states') ||
    desc.includes('president') ||
    desc.includes('congress') ||
    desc.includes('senate') && desc.includes('u.s') ||
    desc.includes('representative') && (desc.includes('u.s') || desc.includes('federal'))
  );
}
