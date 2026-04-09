'use client';

import { useState, useEffect } from 'react';

function ScoreBadge({ score }) {
  const color = score >= 70 ? 'var(--orange)' : score >= 45 ? 'var(--teal)' : 'var(--text-dim)';
  return (
    <span style={{
      padding: '0.05rem 0.35rem', border: `1px solid ${color}`, color,
      borderRadius: '2px', fontSize: '0.6rem', fontFamily: 'var(--font-mono)', fontWeight: 700,
    }}>
      {score}
    </span>
  );
}

export default function CommitteeConnections({ acctNum }) {
  const [connections, setConnections] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/data/connections_pages/by_committee/${acctNum}.json`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => setConnections(data.slice(0, 6)))
      .catch(() => setError(true));
  }, [acctNum]);

  if (error || (connections && connections.length === 0)) return null;
  if (!connections) return null; // silent load — don't show skeleton

  return (
    <div style={{ marginBottom: '2rem' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '0.75rem',
      }}>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Connected Committees
        </div>
        <a href={`/connections?committee=${acctNum}`} style={{
          fontSize: '0.6rem', color: 'var(--teal)', textDecoration: 'none', fontFamily: 'var(--font-mono)',
        }}>
          all connections →
        </a>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: 'var(--border)', border: '1px solid var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
        {connections.map((conn, i) => {
          const other = conn.entity_a?.acct_num === acctNum ? conn.entity_b : conn.entity_a;
          if (!other) return null;
          const signals = [
            conn.shared_treasurer && 'TRS',
            conn.shared_address   && 'ADR',
            conn.shared_phone     && 'PHN',
            conn.shared_chair     && 'CHR',
            conn.donor_overlap_pct > 0 && `${Math.round(conn.donor_overlap_pct)}%`,
            conn.money_between > 0     && '$',
          ].filter(Boolean);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--bg)' }}>
              <ScoreBadge score={conn.connection_score} />
              <a href={`/committee/${other.acct_num}`} style={{
                color: 'var(--teal)', textDecoration: 'none', fontSize: '0.72rem', flex: 1, minWidth: 0,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {other.name}
              </a>
              <div style={{ display: 'flex', gap: '0.2rem', flexShrink: 0 }}>
                {signals.map(s => (
                  <span key={s} style={{
                    fontSize: '0.5rem', padding: '0.05rem 0.2rem',
                    background: 'rgba(77,216,240,0.1)', color: 'var(--teal)',
                    border: '1px solid rgba(77,216,240,0.25)', borderRadius: '2px',
                    fontFamily: 'var(--font-mono)',
                  }}>{s}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
