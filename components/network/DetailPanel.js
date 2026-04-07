'use client';

const PARTY_OVERRIDES = {
  'c_4700': 'R', 'c_80335': 'R',
  'd_FRIENDS_OF_RON_DESANTIS': 'R', 'd_REPUBLICAN_NATIONAL_COMMITTEE': 'R',
  'c_61265': 'D', 'c_61018': 'D',
};
const R_KW = ['REPUBLICAN', 'GOP', 'CONSERVATIVES FOR', 'AMERICANS FOR PROSPERITY'];
const D_KW = ['DEMOCRAT', 'SEIU', 'AFSCME', 'AFL-CIO', 'LABOR ', 'UNION ', 'PROGRESSIVE'];
function getPartyAffiliation(node) {
  if (!node) return null;
  if (PARTY_OVERRIDES[node.id]) return PARTY_OVERRIDES[node.id];
  const l = (node.label || '').toUpperCase();
  if (R_KW.some(k => l.includes(k))) return 'R';
  if (D_KW.some(k => l.includes(k))) return 'D';
  return null;
}
function getNodeDescription(node) {
  if (!node) return '';
  if (node.data_pending) return 'Committee — contribution data not yet downloaded';
  const party = getPartyAffiliation(node);
  if (node.type === 'committee') {
    if (party === 'R') return 'Republican-aligned political committee';
    if (party === 'D') return 'Democrat-aligned political committee';
    return 'Florida political committee';
  }
  if (node.type === 'corporate') return 'Corporate donor';
  return 'Individual / PAC donor';
}

function fmt(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function TypeBadge({ type, dataPending }) {
  const color = dataPending ? 'var(--text-dim)' : ({
    committee: 'var(--teal)',
    corporate: '#94a3b8',
    individual: 'var(--blue)',
  }[type] || 'var(--text-dim)');
  return (
    <span style={{
      display: 'inline-block', padding: '0.15rem 0.5rem',
      border: `1px solid ${color}`, color,
      fontSize: '0.7rem', borderRadius: '3px',
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>
      {dataPending ? '? pending' : type}
    </span>
  );
}

function PartyBadge({ party }) {
  if (!party) return null;
  const color = party === 'R' ? 'var(--republican)' : 'var(--democrat)';
  return (
    <span style={{
      display: 'inline-block', marginLeft: '0.4rem',
      padding: '0.15rem 0.45rem',
      border: `1px solid ${color}`, color,
      fontSize: '0.7rem', borderRadius: '3px',
      letterSpacing: '0.06em', fontWeight: 'bold',
    }}>
      {party}
    </span>
  );
}

const LINK_STYLE = {
  display: 'block', padding: '0.45rem 0.75rem',
  background: 'transparent', border: '1px solid var(--border)',
  color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem', textDecoration: 'none', borderRadius: '3px',
};

export default function DetailPanel({ node, graphData, onRecenter }) {
  if (!node) {
    return (
      <div style={{
        width: '30%', minWidth: '260px', maxWidth: '380px',
        padding: '2rem 1.5rem',
        borderLeft: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-dim)', fontSize: '0.85rem', textAlign: 'center',
      }}>
        <div>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem', opacity: 0.4 }}>✦</div>
          Click any node<br />to explore
        </div>
      </div>
    );
  }

  const party       = getPartyAffiliation(node);
  const description = getNodeDescription(node);
  const allEdges    = graphData?.edges || [];
  const nodeById    = Object.fromEntries((graphData?.nodes || []).map(n => [n.id, n]));

  const incomingEdges = allEdges
    .filter(e => e.target === node.id)
    .sort((a, b) => b.total_amount - a.total_amount)
    .slice(0, 25);

  const outgoingEdges = allEdges
    .filter(e => e.source === node.id)
    .sort((a, b) => b.total_amount - a.total_amount)
    .slice(0, 10);

  const totalIncoming = allEdges.filter(e => e.target === node.id).length;

  const researchLinks = [
    {
      label: 'FL Elections Records →',
      href: 'https://dos.fl.gov/elections/campaign-finance/reports-data/',
    },
    {
      label: 'Google News →',
      href: `https://news.google.com/search?q=${encodeURIComponent(node.label + ' Florida politics')}`,
    },
    {
      label: 'OpenSecrets →',
      href: `https://www.opensecrets.org/search?q=${encodeURIComponent(node.label)}&type=donors`,
    },
  ];

  return (
    <div style={{
      width: '30%', minWidth: '260px', maxWidth: '380px',
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '1.25rem 1.25rem 0.75rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ marginBottom: '0.4rem' }}>
          <TypeBadge type={node.type} dataPending={node.data_pending} />
          <PartyBadge party={party} />
        </div>
        <div style={{
          fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text)',
          lineHeight: 1.3, marginBottom: '0.3rem', wordBreak: 'break-word',
        }}>
          {node.label}
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>
          {description}
        </div>
        {node.acct_num && (
          <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', opacity: 0.7 }}>
            Acct #{node.acct_num}
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: '1px', background: 'var(--border)',
        borderBottom: '1px solid var(--border)',
      }}>
        {[
          { label: 'Total Given',    value: fmt(node.total_given) },
          { label: 'Total Received', value: fmt(node.total_received) },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'var(--bg)', padding: '0.75rem 1rem' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>{label}</div>
            <div style={{ fontSize: '1rem', color: 'var(--orange)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1.25rem' }}>

        {/* Funded By */}
        {incomingEdges.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              Funded By
            </div>
            {incomingEdges.map((edge, i) => {
              const src = nodeById[edge.source];
              return (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  padding: '0.3rem 0',
                  borderBottom: '1px solid rgba(100,140,220,0.06)',
                  fontSize: '0.78rem',
                  color: src?.type === 'committee' ? 'var(--teal)' : 'var(--text)',
                }}>
                  <span style={{ flex: 1, marginRight: '0.5rem', wordBreak: 'break-word' }}>
                    {src?.label || edge.source}
                  </span>
                  <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>{fmt(edge.total_amount)}</span>
                </div>
              );
            })}
            {totalIncoming > 25 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--teal)', padding: '0.4rem 0' }}>
                + {totalIncoming - 25} more
              </div>
            )}
          </div>
        )}

        {/* Funds These PACs */}
        {outgoingEdges.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              Funds These PACs
            </div>
            {outgoingEdges.map((edge, i) => {
              const tgt = nodeById[edge.target];
              return (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  padding: '0.3rem 0',
                  borderBottom: '1px solid rgba(100,140,220,0.06)',
                  fontSize: '0.78rem', color: 'var(--teal)',
                }}>
                  <span style={{ flex: 1, marginRight: '0.5rem', wordBreak: 'break-word' }}>
                    {tgt?.label || edge.target}
                  </span>
                  <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>{fmt(edge.total_amount)}</span>
                </div>
              );
            })}
          </div>
        )}

        {!incomingEdges.length && !outgoingEdges.length && (
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
            {node.data_pending ? 'Contribution data not yet downloaded.' : 'No donation records found.'}
          </div>
        )}
      </div>

      {/* Actions + Research links */}
      <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <button
          onClick={() => onRecenter(node)}
          style={{
            padding: '0.45rem', background: 'rgba(77,216,240,0.08)',
            border: '1px solid var(--border)', color: 'var(--teal)',
            fontFamily: 'var(--font-mono)', fontSize: '0.75rem', cursor: 'pointer', borderRadius: '3px',
          }}
        >
          Re-center graph here
        </button>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '0.25rem' }}>
          Research
        </div>
        {researchLinks.map(({ label, href }) => (
          <a key={label} href={href} target="_blank" rel="noopener noreferrer" style={LINK_STYLE}>
            {label}
          </a>
        ))}
      </div>
    </div>
  );
}
