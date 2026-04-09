'use client';

import { useState, useMemo } from 'react';
import { Sankey, Tooltip, ResponsiveContainer } from 'recharts';
import BackLinks from '@/components/BackLinks';

function fmt(n) {
  if (!n || n === 0) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const TOP_OPTIONS = [20, 30, 50, 100];
const NODE_WIDTH  = 12;
const LABEL_MAX   = 30;

function truncate(s) {
  return s.length > LABEL_MAX ? s.slice(0, LABEL_MAX) + '…' : s;
}

// Rendered as an SVG <g> inside Recharts' Sankey layer
function SankeyNode({ x, y, width, height, payload, typeMap }) {
  if (!payload?.name) return null;
  const info        = typeMap[payload.name] || {};
  const isCommittee = info.type === 'committee';
  const color       = isCommittee ? '#4dd8f0' : '#ffb060';
  const label       = truncate(payload.name);
  const textX       = isCommittee ? x + width + 8 : x - 8;
  const anchor      = isCommittee ? 'start' : 'end';
  const h           = Math.max(height, 2);

  const inner = (
    <>
      <rect x={x} y={y} width={width} height={h} fill={color} fillOpacity={0.88} rx={2} />
      <text
        x={textX}
        y={y + h / 2}
        textAnchor={anchor}
        dominantBaseline="middle"
        fontSize={10}
        fill={color}
        style={{ fontFamily: 'Courier New, monospace' }}
      >
        {label}
      </text>
    </>
  );

  if (isCommittee && info.acct) {
    return (
      <g style={{ cursor: 'pointer' }}>
        <a href={`/committee/${info.acct}`}>{inner}</a>
      </g>
    );
  }
  return <g>{inner}</g>;
}

function FlowTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;

  const isLink = d.source?.name != null;
  return (
    <div style={{
      background: '#080818', border: '1px solid rgba(100,140,220,0.25)',
      padding: '0.5rem 0.75rem', fontSize: '0.7rem', fontFamily: 'Courier New, monospace',
      maxWidth: '280px',
    }}>
      {isLink ? (
        <>
          <div style={{ color: '#c8d8f0', marginBottom: '0.2rem', lineHeight: 1.4 }}>
            {d.source.name} <span style={{ color: '#5a6a88' }}>→</span> {d.target.name}
          </div>
          <div style={{ color: '#ffb060', fontWeight: 700 }}>{fmt(d.value)}</div>
        </>
      ) : (
        <>
          <div style={{ color: '#c8d8f0', marginBottom: '0.2rem' }}>{d.name}</div>
          <div style={{ color: '#ffb060', fontWeight: 700 }}>{fmt(d.value)}</div>
        </>
      )}
    </div>
  );
}

export default function FlowClient({ flows }) {
  const [topN, setTopN] = useState(30);

  const { sankeyData, typeMap, totalFlow } = useMemo(() => {
    const top = flows.slice(0, topN);

    // Build type map: name → {type, acct?}
    const typeMap = {};
    top.forEach(f => {
      typeMap[f.donor]     = { type: 'donor' };
      typeMap[f.committee] = { type: 'committee', acct: f.committee_acct };
    });

    // Donors first, then committees (determines left/right in Sankey)
    const donorNames     = [...new Set(top.map(f => f.donor))];
    const committeeNames = [...new Set(top.map(f => f.committee))];
    const nodes          = [
      ...donorNames.map(name => ({ name })),
      ...committeeNames.map(name => ({ name })),
    ];
    const nodeIdx = Object.fromEntries(nodes.map((n, i) => [n.name, i]));

    const links = top.map(f => ({
      source: nodeIdx[f.donor],
      target: nodeIdx[f.committee],
      value:  f.total_amount,
    }));

    const totalFlow = top.reduce((s, f) => s + f.total_amount, 0);

    return { sankeyData: { nodes, links }, typeMap, totalFlow };
  }, [flows, topN]);

  // Height scales with node count so labels don't overlap
  const nodeCount   = sankeyData.nodes.length;
  const chartHeight = Math.max(520, nodeCount * 24);

  const renderNode = useMemo(
    () => (props) => <SankeyNode {...props} typeMap={typeMap} />,
    [typeMap]
  );

  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 2rem 4rem' }}>

      <BackLinks links={[{ href: '/', label: 'home' }]} />

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ marginBottom: '0.5rem' }}>
          <span style={{
            fontSize: '0.65rem', padding: '0.15rem 0.5rem',
            border: '1px solid var(--orange)', color: 'var(--orange)',
            borderRadius: '2px', fontFamily: 'var(--font-mono)', fontWeight: 'bold',
          }}>
            MONEY FLOW
          </span>
        </div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.5rem, 4vw, 2.4rem)',
          fontWeight: 400, color: '#fff', marginBottom: '0.4rem', lineHeight: 1.1,
        }}>
          Donor → Committee Flow
        </h1>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <span>Top {topN} flows · {sankeyData.nodes.length} entities</span>
          <span style={{ color: 'var(--orange)', fontWeight: 700 }}>{fmt(totalFlow)} shown</span>
          <span>{flows.length} total flows in dataset</span>
        </div>
      </div>

      {/* Controls + legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>Show top:</span>
        {TOP_OPTIONS.map(n => (
          <button
            key={n}
            onClick={() => setTopN(n)}
            style={{
              padding: '0.2rem 0.6rem', fontSize: '0.65rem',
              background: topN === n ? 'var(--orange)' : 'transparent',
              color:      topN === n ? '#000'          : 'var(--text-dim)',
              border:     `1px solid ${topN === n ? 'var(--orange)' : 'rgba(100,140,220,0.25)'}`,
              borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)',
              transition: 'all 0.1s',
            }}
          >
            {n}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '1.25rem', alignItems: 'center' }}>
          {[
            { color: 'var(--orange)', label: 'Donor' },
            { color: 'var(--teal)',   label: 'Committee (click to view)' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div style={{ width: '10px', height: '10px', background: color, borderRadius: '2px' }} />
              <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sankey */}
      <div style={{ width: '100%', height: `${chartHeight}px` }}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <Sankey
            data={sankeyData}
            node={renderNode}
            nodeWidth={NODE_WIDTH}
            nodePadding={10}
            margin={{ top: 10, right: 220, bottom: 10, left: 220 }}
            link={{
              stroke:      'rgba(100,140,220,0.15)',
              fill:        'rgba(100,140,220,0.12)',
              strokeWidth: 0,
            }}
          >
            <Tooltip content={<FlowTooltip />} />
          </Sankey>
        </ResponsiveContainer>
      </div>

      <div style={{
        fontSize: '0.62rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
        borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '2rem',
      }}>
        Direct contributions from donors to political committees · Florida Division of Elections · All data from public records.
      </div>
    </main>
  );
}
