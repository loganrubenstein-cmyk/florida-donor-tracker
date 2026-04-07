'use client';

import { Sankey, Tooltip, Rectangle, Layer } from 'recharts';

function fmt(n) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function getNodeColor(type, depth) {
  if (type === 'committee' && depth === 0) return '#ffb060';
  if (type === 'committee')               return '#4dd8f0';
  return '#80ffa0';
}

function CustomNode({ x, y, width, height, index, payload }) {
  const col = getNodeColor(payload.type, payload.depth);
  return (
    <Layer key={`node-${index}`}>
      <Rectangle x={x} y={y} width={width} height={height} fill={col} fillOpacity={0.85} />
      <text
        x={x + width + 8}
        y={y + height / 2}
        dominantBaseline="middle"
        fill="#c8d8f0"
        fontSize={10}
        fontFamily="Courier New"
      >
        {payload.label.length > 28 ? payload.label.slice(0, 25) + '\u2026' : payload.label}
      </text>
    </Layer>
  );
}

export default function SankeyView({ data, onNodeSelect }) {
  if (!data) return null;

  const nodeIndex = {};
  const nodes = data.nodes.map((n, i) => {
    nodeIndex[n.id] = i;
    return { ...n, name: n.label };
  });

  const links = data.edges
    .filter(e => nodeIndex[e.source] != null && nodeIndex[e.target] != null)
    .map(e => ({
      source: nodeIndex[e.source],
      target: nodeIndex[e.target],
      value:  Math.max(e.total_amount, 1),
    }));

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', padding: '1rem', background: 'var(--bg)', position: 'relative' }}>
      <div className="star-field" />
      <Sankey
        width={900}
        height={Math.max(500, data.nodes.length * 22)}
        data={{ nodes, links }}
        node={<CustomNode />}
        link={{ stroke: '#4dd8f055', fill: '#4dd8f022' }}
        margin={{ top: 20, right: 220, bottom: 20, left: 20 }}
        onClick={(d) => {
          if (d?.name) {
            const node = data.nodes.find(n => n.label === d.name);
            if (node) onNodeSelect(node);
          }
        }}
      >
        <Tooltip
          contentStyle={{ background: '#080818', border: '1px solid #4dd8f044', fontFamily: 'Courier New', fontSize: 11 }}
          formatter={(v) => [fmt(v), 'Amount']}
        />
      </Sankey>
    </div>
  );
}
