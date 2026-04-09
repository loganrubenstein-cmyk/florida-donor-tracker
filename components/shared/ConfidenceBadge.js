'use client';

const LABELS = {
  direct:     'direct',
  normalized: 'normalized',
  inferred:   'inferred',
  classified: 'classified',
};

const TOOLTIPS = {
  direct:     'Taken verbatim from an official filing — no transformation applied.',
  normalized: 'Cleaned or standardized from raw text, but structurally unchanged.',
  inferred:   'Derived by matching across datasets (e.g. name-based donor linking). Not confirmed by election authorities.',
  classified: 'Assigned to a category by a rules-based classifier. Auditable but not verified.',
};

/**
 * <ConfidenceBadge level="direct|normalized|inferred|classified" />
 * Shows a small inline badge with a tooltip on hover.
 */
export default function ConfidenceBadge({ level }) {
  if (!LABELS[level]) return null;
  return (
    <span
      className={`confidence-badge confidence-${level}`}
      title={TOOLTIPS[level]}
      style={{ cursor: 'help' }}
    >
      {LABELS[level]}
    </span>
  );
}
