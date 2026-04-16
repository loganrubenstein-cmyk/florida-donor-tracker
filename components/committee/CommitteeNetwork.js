'use client';
import { useEffect, useRef, useState } from 'react';

const EDGE_COLORS = {
  treasurer: 'rgba(255,176,96,0.7)',
  address:   'rgba(160,192,255,0.6)',
  chair:     'rgba(77,216,240,0.6)',
  money:     'rgba(128,255,160,0.6)',
  donor:     'rgba(90,106,136,0.5)',
};

export default function CommitteeNetwork({ acctNum }) {
  const containerRef = useRef(null);
  const [graphData,  setGraphData]  = useState(null);
  const [error,      setError]      = useState(null);
  const [hovered,    setHovered]    = useState(null);

  useEffect(() => {
    fetch(`/api/committee-network?acct=${encodeURIComponent(acctNum)}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setGraphData(d); })
      .catch(() => setError('Failed to load network'));
  }, [acctNum]);

  useEffect(() => {
    if (!graphData || !containerRef.current) return;
    let renderer;
    (async () => {
      const { default: Graph }   = await import('graphology');
      const { default: Sigma }   = await import('sigma');
      const { circular }         = await import('graphology-layout');

      const graph = new Graph({ multi: false, type: 'undirected' });

      for (const n of graphData.nodes) {
        graph.addNode(n.id, {
          label: n.label,
          size:  n.size,
          color: n.isFocus ? '#ffb060' : '#4dd8f0',
          x: Math.random(), y: Math.random(),
        });
      }
      for (const e of graphData.edges) {
        if (graph.hasNode(e.source) && graph.hasNode(e.target) && !graph.hasEdge(e.source, e.target)) {
          graph.addEdge(e.source, e.target, {
            color: EDGE_COLORS[e.type] || EDGE_COLORS.donor,
            size:  Math.max(1, Math.round(e.score / 20)),
            label: e.type,
          });
        }
      }

      circular.assign(graph);

      renderer = new Sigma(graph, containerRef.current, {
        renderEdgeLabels:  false,
        defaultEdgeColor:  EDGE_COLORS.donor,
        defaultNodeColor:  '#4dd8f0',
        labelColor:        { color: '#5a6a88' },
        labelSize:         11,
        minCameraRatio:    0.3,
        maxCameraRatio:    3,
      });

      renderer.on('enterNode', ({ node }) => setHovered(graphData.nodes.find(n => n.id === node) || null));
      renderer.on('leaveNode', () => setHovered(null));
      renderer.on('clickNode', ({ node }) => { window.location.href = `/committee/${node}`; });
    })();

    return () => { if (renderer) renderer.kill(); };
  }, [graphData]);

  if (error) return <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', padding: '1rem 0' }}>{error}</div>;
  if (!graphData) return <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', padding: '1rem 0' }}>Loading network…</div>;
  if (graphData.nodes.length <= 1) return <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', padding: '1rem 0' }}>No connected committees found.</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap', fontSize: '0.62rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
        {Object.entries(EDGE_COLORS).map(([type, color]) => (
          <span key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ display: 'inline-block', width: '16px', height: '3px', background: color, borderRadius: '1px' }} />
            {type}
          </span>
        ))}
        <span style={{ marginLeft: 'auto' }}>click node to visit · scroll to zoom</span>
      </div>

      <div
        ref={containerRef}
        style={{ width: '100%', height: '420px', background: 'var(--bg)', border: '1px solid rgba(100,140,220,0.1)', borderRadius: '3px', position: 'relative' }}
      />

      {hovered && !hovered.isFocus && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--teal)', fontFamily: 'var(--font-mono)' }}>
          → <a href={`/committee/${hovered.id}`} style={{ color: 'var(--teal)', textDecoration: 'none' }}>{hovered.label}</a>
        </div>
      )}

      <div style={{ marginTop: '0.5rem', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
        {graphData.total_connections} direct connection{graphData.total_connections !== 1 ? 's' : ''} shown (depth 1, top 30 by score)
      </div>
    </div>
  );
}
