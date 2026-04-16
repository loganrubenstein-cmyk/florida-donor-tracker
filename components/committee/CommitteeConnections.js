'use client';

import { useState, useEffect } from 'react';

const CAPS_KEEP = new Set(['PAC', 'LLC', 'ECO', 'NOP', 'DBA', 'INC', 'II', 'III', 'IV', 'PC', 'LP', 'LLP']);
function toTitle(s) {
  if (!s) return s;
  return s.toLowerCase().replace(/\b\w+/g, w =>
    CAPS_KEEP.has(w.toUpperCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)
  );
}

export default function CommitteeConnections({ acctNum }) {
  const [connections, setConnections] = useState(null);

  useEffect(() => {
    fetch(`/api/connections?committee=${acctNum}&sort=connection_score`)
      .then(r => r.json())
      .then(json => setConnections((json.data || []).slice(0, 8)))
      .catch(() => setConnections([]));
  }, [acctNum]);

  if (!connections) return (
    <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', padding: '1rem 0' }}>
      Loading…
    </div>
  );
  if (connections.length === 0) return (
    <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', padding: '1rem 0' }}>
      No coordination signals found for this committee.
    </div>
  );

  return (
    <div style={{ marginBottom: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Connected Committees — {connections.length} shown
        </div>
        <a href={`/connections?committee=${acctNum}`} style={{
          fontSize: '0.6rem', color: 'var(--teal)', textDecoration: 'none', fontFamily: 'var(--font-mono)',
        }}>
          view all →
        </a>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {connections.map((conn) => {
          const isSideA      = conn.entity_a_acct === acctNum;
          const otherName    = toTitle(isSideA ? conn.entity_b : conn.entity_a);
          const otherAcct    = isSideA ? conn.entity_b_acct : conn.entity_a_acct;
          const pct          = conn.donor_overlap_pct ? parseFloat(conn.donor_overlap_pct).toFixed(0) : null;

          // Build human-readable evidence tags
          const tags = [];
          if (conn.shared_treasurer && conn.shared_treasurer_name) {
            tags.push({ label: `Treasurer: ${conn.shared_treasurer_name}`, color: 'var(--orange)' });
          } else if (conn.shared_treasurer) {
            tags.push({ label: 'Shared treasurer', color: 'var(--orange)' });
          }
          if (conn.shared_chair && conn.shared_chair_name) {
            tags.push({ label: `Chair: ${conn.shared_chair_name}`, color: 'var(--teal)' });
          } else if (conn.shared_chair) {
            tags.push({ label: 'Shared chair', color: 'var(--teal)' });
          }
          if (conn.shared_address && conn.shared_address_line) {
            tags.push({ label: conn.shared_address_line, color: 'var(--blue)' });
          } else if (conn.shared_address) {
            tags.push({ label: 'Shared address', color: 'var(--blue)' });
          }
          if (pct && parseInt(pct) > 0) {
            tags.push({ label: `${pct}% donor overlap`, color: 'var(--text-dim)' });
          }

          return (
            <div key={conn.id} style={{
              padding: '0.65rem 0.85rem',
              border: '1px solid rgba(100,140,220,0.1)',
              borderRadius: '3px', background: 'var(--bg)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: tags.length ? '0.4rem' : 0 }}>
                <span style={{
                  fontSize: '0.6rem', padding: '0.05rem 0.35rem',
                  border: '1px solid rgba(100,140,220,0.3)', color: 'var(--text-dim)',
                  borderRadius: '2px', fontFamily: 'var(--font-mono)', fontWeight: 700, flexShrink: 0,
                }}>
                  {conn.connection_score}
                </span>
                <a href={`/committee/${otherAcct}`} style={{
                  color: 'var(--teal)', textDecoration: 'none', fontSize: '0.78rem',
                  flex: 1, minWidth: 0,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {otherName}
                </a>
              </div>
              {tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                  {tags.map((t, i) => (
                    <span key={i} style={{
                      fontSize: '0.6rem', padding: '0.1rem 0.4rem',
                      background: `${t.color}0d`,
                      border: `1px solid ${t.color}33`,
                      color: t.color, borderRadius: '2px',
                      fontFamily: 'var(--font-mono)',
                      maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {t.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
