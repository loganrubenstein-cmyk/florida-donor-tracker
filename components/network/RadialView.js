'use client';

import { useMemo } from 'react';

function getNodeColor(type, depth) {
  if (type === 'committee' && depth === 0) return '#ffb060';
  if (type === 'committee')               return '#4dd8f0';
  return '#80ffa0';
}

function getNodeSize(node) {
  const v = Math.max(node.total_given || 0, node.total_received || 0, 1);
  return Math.max(3, Math.log10(v) * 2.5);
}

export default function RadialView({ data, centerNodeId, selectedNode, onNodeSelect }) {
  const W = 900, H = 700, CX = W / 2, CY = H / 2, RING_GAP = 130;

  const { positioned, edgeCoords } = useMemo(() => {
    if (!data) return { positioned: [], edgeCoords: [] };

    let center = data.nodes.find(n => n.id === centerNodeId)
              || data.nodes.find(n => n.depth === 0)
              || data.nodes[0];

    const depthMap = {};
    data.nodes.forEach(n => {
      if (!depthMap[n.depth]) depthMap[n.depth] = [];
      depthMap[n.depth].push(n);
    });

    const positioned = [];
    const posById = {};

    Object.entries(depthMap).forEach(([d, nodes]) => {
      const depth = parseInt(d, 10);
      const r = depth === 0 ? 0 : depth * RING_GAP;
      nodes.forEach((node, i) => {
        const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
        const px = CX + r * Math.cos(angle);
        const py = CY + r * Math.sin(angle);
        positioned.push({ ...node, px, py });
        posById[node.id] = { x: px, y: py };
      });
    });

    const edgeCoords = data.edges
      .map(edge => {
        const s = posById[edge.source];
        const t = posById[edge.target];
        if (!s || !t) return null;
        return { ...edge, x1: s.x, y1: s.y, x2: t.x, y2: t.y };
      })
      .filter(Boolean);

    return { positioned, edgeCoords };
  }, [data, centerNodeId]);

  if (!data) return null;

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', background: 'var(--bg)', position: 'relative' }}>
      <div className="star-field" />
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ display: 'block' }}>
        <defs>
          <filter id="radial-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Edges */}
        {edgeCoords.map((e, i) => {
          const w = Math.max(0.5, Math.log10(Math.max(e.total_amount, 1)) / 5);
          return (
            <line key={i}
              x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
              stroke="rgba(80,160,255,0.2)"
              strokeWidth={w}
            />
          );
        })}

        {/* Nodes */}
        {positioned.map((node) => {
          const col  = getNodeColor(node.type, node.depth);
          const r    = getNodeSize(node);
          const sel  = selectedNode?.id === node.id;
          const label = node.label.length > 20
            ? node.label.slice(0, 18) + '\u2026'
            : node.label;

          return (
            <g
              key={node.id}
              filter="url(#radial-glow)"
              style={{ cursor: 'pointer' }}
              onClick={() => onNodeSelect(node)}
            >
              {sel && (
                <circle
                  cx={node.px} cy={node.py} r={r * 4}
                  fill="none" stroke="#ffd06055"
                  strokeWidth={1.5} strokeDasharray="4 3"
                />
              )}
              {/* Halo */}
              <circle cx={node.px} cy={node.py} r={r * 2.5} fill={col + '22'} />
              {/* Core */}
              <circle cx={node.px} cy={node.py} r={r} fill="white" />
              {/* Label */}
              <text
                x={node.px + r + 5} y={node.py}
                dominantBaseline="middle"
                fill="#8899cc" fontSize={9} fontFamily="Courier New"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
