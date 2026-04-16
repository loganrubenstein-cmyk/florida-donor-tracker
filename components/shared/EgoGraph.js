'use client';

import { useEffect, useRef, useState } from 'react';

function getNodeColor(type) {
  if (type === 'committee') return '#ffb060';
  if (type === 'candidate') return '#4dd8f0';
  return '#7a8eaa';
}

function getEdgeColor(score) {
  if (score >= 8) return '#2a4a6a';
  if (score >= 4) return '#1e3550';
  return '#141e30';
}

export default function EgoGraph({ acctNum, centerLabel, centerType = 'committee' }) {
  const containerRef = useRef(null);
  const sigmaRef     = useRef(null);
  const [status,  setStatus]  = useState('loading');
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    if (!acctNum || !containerRef.current) return;
    let killed = false;

    Promise.all([
      import('graphology').then(m => m.default),
      import('sigma').then(m => m.default),
      fetch(`/api/ego?acct=${encodeURIComponent(acctNum)}`).then(r => r.json()),
    ]).then(([Graph, Sigma, json]) => {
      if (killed || !containerRef.current) return;

      const neighbors = json.neighbors || [];
      if (!neighbors.length) { setStatus('empty'); return; }

      const graph = new Graph();

      // Center node
      graph.addNode('center', {
        x: 0, y: 0,
        size: 20,
        color: getNodeColor(centerType),
        label: centerLabel,
        href: centerType === 'candidate' ? `/candidate/${acctNum}` : `/committee/${acctNum}`,
        isCenter: true,
        connection_types: [],
      });

      // Neighbors arranged in a circle
      const radius   = 8;
      const angleStep = (2 * Math.PI) / neighbors.length;
      neighbors.forEach((n, i) => {
        const angle  = i * angleStep - Math.PI / 2;
        const nodeId = `n_${i}`;
        const href   = n.type === 'candidate' ? `/candidate/${n.acct_num}`
                     : n.type === 'committee' ? `/committee/${n.acct_num}`
                     : null;

        graph.addNode(nodeId, {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          size: Math.max(5, Math.min(14, (n.connection_score || 0) * 1.2)),
          color: getNodeColor(n.type),
          label: n.name,
          href,
          connection_score: n.connection_score,
          connection_types: n.connection_types,
        });

        graph.addEdge('center', nodeId, {
          size: Math.max(0.5, Math.min(2.5, (n.connection_score || 0) * 0.25)),
          color: getEdgeColor(n.connection_score),
        });
      });

      const sigma = new Sigma(graph, containerRef.current, {
        renderEdgeLabels:  false,
        labelFont:         '"Courier New", monospace',
        labelSize:         10,
        labelColor:        { color: '#c8d8f0' },
        labelDensityThreshold: 0.6,
        defaultEdgeType:   'line',
        allowInvalidContainer: true,
      });

      sigma.on('enterNode', ({ node }) => {
        const attrs = graph.getNodeAttributes(node);
        setHovered({ id: node, ...attrs });
        containerRef.current.style.cursor = attrs.href ? 'pointer' : 'default';
      });
      sigma.on('leaveNode', () => {
        setHovered(null);
        if (containerRef.current) containerRef.current.style.cursor = 'default';
      });
      sigma.on('clickNode', ({ node }) => {
        const attrs = graph.getNodeAttributes(node);
        if (attrs.href) window.location.href = attrs.href;
      });

      sigmaRef.current = sigma;
      setStatus('ready');
    }).catch(() => {
      if (!killed) setStatus('empty');
    });

    return () => {
      killed = true;
      if (sigmaRef.current) {
        try { sigmaRef.current.kill(); } catch (_) {}
        sigmaRef.current = null;
      }
    };
  }, [acctNum, centerLabel, centerType]);

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        style={{
          height: '320px', background: '#010110',
          borderRadius: '3px', border: '1px solid var(--border)',
        }}
      />

      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
          color: 'var(--text-dim)', fontSize: '0.72rem', fontFamily: 'var(--font-mono)',
        }}>
          Loading connections…
        </div>
      )}

      {status === 'empty' && (
        <div style={{
          position: 'absolute', inset: 0,
          padding: '1.5rem', color: 'var(--text-dim)', fontSize: '0.78rem',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px',
          lineHeight: 1.6,
        }}>
          No structural connections found for this entity. Connections are based on shared treasurer,
          address, officers, or donor overlap with other committees.
        </div>
      )}

      {hovered && status === 'ready' && !hovered.isCenter && (
        <div style={{
          position: 'absolute', bottom: '0.75rem', left: '0.75rem',
          background: 'rgba(8,8,24,0.96)', border: '1px solid var(--border)',
          borderRadius: '3px', padding: '0.5rem 0.75rem',
          fontSize: '0.7rem', pointerEvents: 'none', maxWidth: '260px',
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{ color: 'var(--text)', marginBottom: '0.2rem', lineHeight: 1.4 }}>
            {hovered.label}
          </div>
          {hovered.connection_types?.length > 0 && (
            <div style={{ color: 'var(--text-dim)', fontSize: '0.62rem', marginBottom: '0.1rem' }}>
              {hovered.connection_types.join(' · ')}
            </div>
          )}
          {hovered.href && (
            <div style={{ color: 'var(--teal)', fontSize: '0.62rem' }}>click to open →</div>
          )}
        </div>
      )}

      {status === 'ready' && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.62rem', color: 'var(--text-dim)' }}>
          Structural connections — shared treasurer, address, chair, or donor overlap.
          Click any node to open its profile. Node size reflects connection strength.
        </div>
      )}
    </div>
  );
}
