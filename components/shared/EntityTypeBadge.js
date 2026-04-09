'use client';

const TYPE_MAP = {
  individual:           { label: 'Individual',    cls: 'entity-individual' },
  corporation:          { label: 'Corporation',   cls: 'entity-corporation' },
  political_committee:  { label: 'PAC',           cls: 'entity-pac' },
  party_committee:      { label: 'Party',         cls: 'entity-party' },
  nonprofit:            { label: 'Nonprofit',     cls: 'entity-nonprofit' },
  union:                { label: 'Union',         cls: 'entity-union' },
  association:          { label: 'Association',   cls: 'entity-individual' },
  trust:                { label: 'Trust',         cls: 'entity-corporation' },
  lobbyist_linked:      { label: 'Lobbyist',      cls: 'entity-individual' },
  unknown:              { label: 'Unknown',       cls: 'entity-unknown' },
  // legacy
  true:                 { label: 'Corporate',     cls: 'entity-corporation' },
  false:                { label: 'Individual',    cls: 'entity-individual' },
};

// Committee type codes
const COMMITTEE_TYPE_MAP = {
  CCE: { label: 'Candidate Committee', cls: 'entity-pac' },
  PCO: { label: 'Political Committee', cls: 'entity-pac' },
  PAC: { label: 'PAC',                 cls: 'entity-pac' },
  ECO: { label: 'Electioneering',      cls: 'entity-individual' },
  PTY: { label: 'Party',               cls: 'entity-party' },
};

/**
 * <EntityTypeBadge type="individual|corporation|..." />
 * or
 * <EntityTypeBadge committeeType="CCE|PCO|PAC|ECO|PTY" />
 */
export default function EntityTypeBadge({ type, committeeType }) {
  if (committeeType) {
    const info = COMMITTEE_TYPE_MAP[committeeType];
    if (!info) return null;
    return <span className={`entity-badge ${info.cls}`}>{info.label}</span>;
  }
  if (type === undefined || type === null) return null;
  const key = String(type);
  const info = TYPE_MAP[key];
  if (!info) return null;
  return <span className={`entity-badge ${info.cls}`}>{info.label}</span>;
}
