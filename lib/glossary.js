// Plain-English definitions for FL campaign-finance jargon.
// Used by <GlossaryTerm> to render dotted-underline tooltips on terms
// that appear in headers, stat cells, and body copy across the site.
//
// Keep definitions short (fits in a `title` tooltip) and written for a
// voter who has never read an FL Division of Elections filing.

export const GLOSSARY = {
  HARD: "Hard money — direct contributions to a candidate's own campaign account. Capped per contributor per cycle by FL law.",
  SOFT: 'Soft money — contributions to political committees (PACs) that spend on behalf of a candidate. Not capped.',
  COMBINED: "Combined total — hard money plus soft money raised by linked committees. Best single-number estimate of a candidate's total fundraising reach.",
  CCE: 'CCE — Committee of Continuous Existence. A type of FL political committee that raises money year-round, not tied to a specific election.',
  ECO: 'ECO — Electioneering Communications Organization. Spends on ads that reference candidates without explicitly urging a vote.',
  PCO: 'PCO — Political Committee. Standard FL PAC that raises and spends on FL races.',
  PC: 'PC — Political Committee. Standard FL PAC that raises and spends on FL races.',
  'STATE OF FLORIDA': 'The State of Florida appears as a donor because of the FL tax-return check-off system, which routes small per-taxpayer amounts to qualifying candidates. Not a discretionary political donation.',
};

export function getGlossary(term) {
  if (!term) return null;
  const key = typeof term === 'string' ? term.toUpperCase() : term;
  return GLOSSARY[key] ?? null;
}
