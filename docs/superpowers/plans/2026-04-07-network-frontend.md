# Network Frontend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/network` page — a satellite-aesthetic force-directed graph (plus Sankey and Radial modes) that visualizes `public/data/network_graph.json` with a persistent detail panel, URL deep-linking, and search.

**Architecture:** Next.js 14 App Router. `app/network/page.js` is a Server Component that reads `network_graph.json` at build time and passes data to `NetworkClient` (a Client Component that owns all interactive state). Sigma.js + Graphology handle force-directed layout; a second HTML Canvas layered above the Sigma canvas draws per-node glow halos via radial gradients. Recharts handles Sankey; a custom SVG layout handles Radial (rendered as JSX, no innerHTML).

**Tech Stack:** Next.js 14, React 18, Sigma.js v3, Graphology, graphology-layout-forceatlas2, Recharts 2, no CSS framework (plain CSS via globals.css and inline styles).

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `package.json` | npm manifest, all deps |
| Create | `next.config.mjs` | Next.js config |
| Create | `jsconfig.json` | Path alias `@/` → project root |
| Create | `jest.config.mjs` | Jest config for ESM |
| Create | `app/layout.js` | Root layout: dark background, nav bar |
| Create | `app/globals.css` | CSS variables, reset, star field, animations |
| Create | `app/page.js` | Simple home page linking to /network |
| Create | `lib/loadNetworkGraph.js` | Read network_graph.json at build time (server-only) |
| Create | `__tests__/loadNetworkGraph.test.js` | Unit test for loader |
| Create | `components/network/VizSwitcher.js` | Force\|Sankey\|Radial tab buttons |
| Create | `components/network/DetailPanel.js` | Right-side node detail panel |
| Create | `components/network/ForceView.js` | Sigma.js force-directed canvas + halo glow layer |
| Create | `components/network/SankeyView.js` | Recharts Sankey view |
| Create | `components/network/RadialView.js` | Custom SVG radial depth-ring layout (pure JSX) |
| Create | `components/network/NetworkClient.js` | Client shell: owns state, wires all components |
| Create | `app/network/page.js` | Server component: loads JSON, renders NetworkClient |

**Reused data shape (from `public/data/network_graph.json`):**
```json
{
  "nodes": [{ "id": "c_2024 rpof", "label": "2024 rpof", "type": "committee",
              "acct_num": "2024 rpof", "total_received": 930646176.28,
              "total_given": 0.0, "depth": 0, "data_pending": false }],
  "edges": [{ "source": "d_FRIENDS_OF_RON_DESANTIS", "target": "c_2024 rpof",
              "total_amount": 115097993.2, "num_contributions": 98 }],
  "meta": { "total_nodes": 26, "total_edges": 25 }
}
```

---

## Task 1: Scaffold Next.js project

**Files:**
- Create: `package.json`
- Create: `next.config.mjs`
- Create: `jsconfig.json`
- Create: `jest.config.mjs`
- Create: `app/layout.js`
- Create: `app/globals.css`
- Create: `app/page.js`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "florida-donor-tracker",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "node --experimental-vm-modules node_modules/.bin/jest"
  },
  "dependencies": {
    "next": "14.2.29",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "graphology": "^0.25.4",
    "graphology-layout-forceatlas2": "^0.10.1",
    "sigma": "^3.0.0",
    "recharts": "^2.12.0"
  },
  "devDependencies": {
    "eslint": "^8",
    "eslint-config-next": "14.2.29",
    "jest": "^29.7.0",
    "jest-environment-node": "^29.7.0"
  }
}
```

- [ ] **Step 2: Create `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

- [ ] **Step 3: Create `jsconfig.json`** (enables `@/` path aliases)

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

- [ ] **Step 4: Create `jest.config.mjs`**

```js
const jestConfig = {
  testEnvironment: 'node',
  transform: {},
  extensionsToTreatAsEsm: ['.js'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
export default jestConfig;
```

- [ ] **Step 5: Create `app/globals.css`**

```css
:root {
  --bg:        #01010d;
  --surface:   #080818;
  --border:    rgba(100, 140, 220, 0.18);
  --text:      #c8d8f0;
  --text-dim:  #5a6a88;
  --orange:    #ffb060;
  --teal:      #4dd8f0;
  --blue:      #a0c0ff;
  --green:     #80ffa0;
  --gold:      #ffd060;
  --font-mono: "Courier New", "Courier", monospace;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-mono);
  min-height: 100vh;
}

/* Star field — static scattered dots via repeating radial-gradient background */
.star-field {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(1px 1px at 12%  8%, rgba(255,255,255,0.55) 0%, transparent 100%),
    radial-gradient(1px 1px at 28% 22%, rgba(255,255,255,0.35) 0%, transparent 100%),
    radial-gradient(1px 1px at 44% 15%, rgba(255,255,255,0.65) 0%, transparent 100%),
    radial-gradient(1px 1px at 60%  5%, rgba(255,255,255,0.45) 0%, transparent 100%),
    radial-gradient(1px 1px at 76% 30%, rgba(255,255,255,0.30) 0%, transparent 100%),
    radial-gradient(1px 1px at 91% 12%, rgba(255,255,255,0.60) 0%, transparent 100%),
    radial-gradient(1px 1px at  5% 45%, rgba(255,255,255,0.40) 0%, transparent 100%),
    radial-gradient(1px 1px at 22% 55%, rgba(255,255,255,0.50) 0%, transparent 100%),
    radial-gradient(1px 1px at 38% 68%, rgba(255,255,255,0.25) 0%, transparent 100%),
    radial-gradient(1px 1px at 55% 80%, rgba(255,255,255,0.55) 0%, transparent 100%),
    radial-gradient(1px 1px at 70% 60%, rgba(255,255,255,0.35) 0%, transparent 100%),
    radial-gradient(1px 1px at 85% 75%, rgba(255,255,255,0.45) 0%, transparent 100%),
    radial-gradient(1px 1px at 15% 88%, rgba(255,255,255,0.30) 0%, transparent 100%),
    radial-gradient(1px 1px at 32% 92%, rgba(255,255,255,0.60) 0%, transparent 100%),
    radial-gradient(1px 1px at 48% 40%, rgba(255,255,255,0.40) 0%, transparent 100%),
    radial-gradient(1px 1px at 65% 50%, rgba(255,255,255,0.20) 0%, transparent 100%),
    radial-gradient(1px 1px at 80% 43%, rgba(255,255,255,0.50) 0%, transparent 100%),
    radial-gradient(2px 2px at 92% 85%, rgba(255,255,255,0.35) 0%, transparent 100%),
    radial-gradient(2px 2px at  8% 70%, rgba(255,255,255,0.25) 0%, transparent 100%),
    radial-gradient(2px 2px at 52% 95%, rgba(255,255,255,0.45) 0%, transparent 100%);
  background-size: 100% 100%;
  pointer-events: none;
}
```

- [ ] **Step 6: Create `app/layout.js`**

```js
import './globals.css';

export const metadata = {
  title: 'Florida Donor Tracker',
  description: 'Follow the money in Florida politics',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <nav style={{
          display: 'flex', alignItems: 'center', gap: '2rem',
          padding: '0.75rem 1.5rem',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(8,8,24,0.95)',
          position: 'sticky', top: 0, zIndex: 100,
        }}>
          <a href="/" style={{ color: 'var(--orange)', textDecoration: 'none', fontWeight: 'bold', letterSpacing: '0.05em' }}>
            FL DONOR TRACKER
          </a>
          <a href="/network" style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: '0.85rem' }}>
            Network
          </a>
        </nav>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Create `app/page.js`**

```js
import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ padding: '4rem 2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ color: 'var(--orange)', fontSize: '2rem', marginBottom: '1rem' }}>
        Florida Donor Tracker
      </h1>
      <p style={{ color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: '2rem' }}>
        Follow the money in Florida politics. Explore $930M+ in campaign contributions.
      </p>
      <Link href="/network" style={{
        display: 'inline-block', padding: '0.75rem 1.5rem',
        background: 'rgba(255,176,96,0.12)', border: '1px solid var(--orange)',
        color: 'var(--orange)', textDecoration: 'none', borderRadius: '4px',
      }}>
        Explore the Network →
      </Link>
    </main>
  );
}
```

- [ ] **Step 8: Install dependencies**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
npm install
```

Expected: `node_modules/` created, no errors. May take 1–2 minutes.

- [ ] **Step 9: Start dev server and verify**

```bash
npm run dev
```

Open `http://localhost:3000` — home page renders with nav bar. No errors in terminal. Press Ctrl+C to stop.

---

## Task 2: Static data loader + unit test

**Files:**
- Create: `lib/loadNetworkGraph.js`
- Create: `__tests__/loadNetworkGraph.test.js`

- [ ] **Step 1: Create `lib/loadNetworkGraph.js`**

```js
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Read network_graph.json at build time (server-side only).
 * Returns { nodes, edges, meta }.
 */
export function loadNetworkGraph() {
  const filePath = join(process.cwd(), 'public', 'data', 'network_graph.json');
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}
```

- [ ] **Step 2: Create `__tests__/loadNetworkGraph.test.js`**

```js
import { jest } from '@jest/globals';

const mockData = {
  nodes: [
    { id: 'c_test', label: 'TEST', type: 'committee', acct_num: 'test',
      total_received: 1000.0, total_given: 0.0, depth: 0, data_pending: false }
  ],
  edges: [
    { source: 'd_DONOR', target: 'c_test', total_amount: 500.0, num_contributions: 1 }
  ],
  meta: { total_nodes: 2, total_edges: 1, max_depth: 1 }
};

jest.unstable_mockModule('fs', () => ({
  readFileSync: jest.fn(() => JSON.stringify(mockData)),
}));
jest.unstable_mockModule('path', () => ({
  join: jest.fn((...args) => args.join('/')),
}));

const { loadNetworkGraph } = await import('../lib/loadNetworkGraph.js');

test('returns object with nodes, edges, meta', () => {
  const data = loadNetworkGraph();
  expect(data).toHaveProperty('nodes');
  expect(data).toHaveProperty('edges');
  expect(data).toHaveProperty('meta');
});

test('nodes is a non-empty array', () => {
  const data = loadNetworkGraph();
  expect(Array.isArray(data.nodes)).toBe(true);
  expect(data.nodes.length).toBeGreaterThan(0);
});

test('edges have required fields', () => {
  const data = loadNetworkGraph();
  const edge = data.edges[0];
  expect(edge).toHaveProperty('source');
  expect(edge).toHaveProperty('target');
  expect(edge).toHaveProperty('total_amount');
  expect(edge).toHaveProperty('num_contributions');
});

test('meta has total_nodes and total_edges', () => {
  const data = loadNetworkGraph();
  expect(typeof data.meta.total_nodes).toBe('number');
  expect(typeof data.meta.total_edges).toBe('number');
});
```

- [ ] **Step 3: Run tests**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
npm test
```

Expected: `4 passed, 0 failed`.

---

## Task 3: VizSwitcher component

**Files:**
- Create: `components/network/VizSwitcher.js`

- [ ] **Step 1: Create `components/network/VizSwitcher.js`**

```js
'use client';

const MODES = [
  { id: 'force',  label: 'Force' },
  { id: 'sankey', label: 'Sankey' },
  { id: 'radial', label: 'Radial' },
];

export default function VizSwitcher({ activeMode, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '2px' }}>
      {MODES.map(({ id, label }) => {
        const active = activeMode === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            style={{
              padding: '0.35rem 0.85rem',
              background: active ? 'rgba(77,216,240,0.15)' : 'transparent',
              border: active ? '1px solid var(--teal)' : '1px solid var(--border)',
              color: active ? 'var(--teal)' : 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              cursor: 'pointer',
              borderRadius: '3px',
              transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
```

---

## Task 4: DetailPanel component

**Files:**
- Create: `components/network/DetailPanel.js`

- [ ] **Step 1: Create `components/network/DetailPanel.js`**

```js
'use client';

function fmt(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function TypeBadge({ type, dataPending }) {
  const color = dataPending ? 'var(--text-dim)' : ({
    committee: 'var(--teal)',
    corporate: 'var(--green)',
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

  const incomingEdges = (graphData?.edges || [])
    .filter(e => e.target === node.id)
    .sort((a, b) => b.total_amount - a.total_amount)
    .slice(0, 25);

  const committeeNodeIds = new Set(
    (graphData?.nodes || []).filter(n => n.type === 'committee').map(n => n.id)
  );

  return (
    <div style={{
      width: '30%', minWidth: '260px', maxWidth: '380px',
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '1.25rem 1.25rem 0.75rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ marginBottom: '0.5rem' }}>
          <TypeBadge type={node.type} dataPending={node.data_pending} />
        </div>
        <div style={{
          fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text)',
          lineHeight: 1.3, marginBottom: '0.35rem', wordBreak: 'break-word',
        }}>
          {node.label}
        </div>
        {node.acct_num && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Acct #{node.acct_num}</div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'var(--border)', borderBottom: '1px solid var(--border)' }}>
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

      {/* Funded by list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1.25rem' }}>
        {incomingEdges.length > 0 ? (
          <>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>
              Funded By
            </div>
            {incomingEdges.map((edge, i) => {
              const sourceNode = graphData?.nodes?.find(n => n.id === edge.source);
              const isCommittee = committeeNodeIds.has(edge.source);
              return (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  padding: '0.35rem 0',
                  borderBottom: '1px solid rgba(100,140,220,0.06)',
                  fontSize: '0.78rem',
                  color: isCommittee ? 'var(--teal)' : 'var(--text)',
                }}>
                  <span style={{ flex: 1, marginRight: '0.5rem', wordBreak: 'break-word' }}>
                    {sourceNode?.label || edge.source}
                  </span>
                  <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>{fmt(edge.total_amount)}</span>
                </div>
              );
            })}
          </>
        ) : (
          <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
            {node.data_pending ? 'Contribution data not yet downloaded.' : 'No incoming donations recorded.'}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <button
          onClick={() => onRecenter(node)}
          style={{
            padding: '0.5rem', background: 'rgba(77,216,240,0.08)',
            border: '1px solid var(--border)', color: 'var(--teal)',
            fontFamily: 'var(--font-mono)', fontSize: '0.78rem', cursor: 'pointer', borderRadius: '3px',
          }}
        >
          Re-center graph here
        </button>
        {node.type === 'committee' && (
          <a
            href={`/committee/${encodeURIComponent(node.acct_num)}`}
            style={{
              display: 'block', padding: '0.5rem', textAlign: 'center',
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem', textDecoration: 'none', borderRadius: '3px',
            }}
          >
            View full profile →
          </a>
        )}
      </div>
    </div>
  );
}
```

---

## Task 5: ForceView — Sigma.js with satellite glow

**Files:**
- Create: `components/network/ForceView.js`

The glow effect uses a second HTML Canvas (the "halo canvas") layered above Sigma's canvas with `mix-blend-mode: screen`. After each Sigma render, radial gradients are drawn on the halo canvas at each node's viewport position, creating the multi-layer soft glow.

- [ ] **Step 1: Create `components/network/ForceView.js`**

```js
'use client';

import { useEffect, useRef, useCallback } from 'react';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import Sigma from 'sigma';

function getNodeColor(node) {
  if (node.data_pending)                              return '#334455';
  if (node.type === 'committee' && node.depth === 0) return '#ffb060';
  if (node.type === 'committee')                     return '#4dd8f0';
  return '#80ffa0';
}

function getNodeSize(node) {
  const v = Math.max(node.total_given || 0, node.total_received || 0, 1);
  return Math.max(2.5, Math.log10(v) * 2.2);
}

export default function ForceView({ data, selectedNode, onNodeSelect, centeredNodeId }) {
  const containerRef  = useRef(null);
  const haloCanvasRef = useRef(null);
  const sigmaRef      = useRef(null);
  const graphRef      = useRef(null);

  const drawHalos = useCallback(() => {
    const canvas = haloCanvasRef.current;
    const sigma  = sigmaRef.current;
    const graph  = graphRef.current;
    if (!canvas || !sigma || !graph) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    graph.forEachNode((nodeId, attrs) => {
      const vp  = sigma.graphToViewport(attrs);
      const r   = attrs.size;
      const col = attrs.color;
      const sel = selectedNode?.id === nodeId;

      // Inner glow ring
      const g1 = ctx.createRadialGradient(vp.x, vp.y, r * 0.8, vp.x, vp.y, r * 3.5);
      g1.addColorStop(0,   col + 'cc');
      g1.addColorStop(0.4, col + '55');
      g1.addColorStop(1,   col + '00');
      ctx.fillStyle = g1;
      ctx.beginPath();
      ctx.arc(vp.x, vp.y, r * 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Outer soft bloom
      const g2 = ctx.createRadialGradient(vp.x, vp.y, r * 2, vp.x, vp.y, r * 7);
      g2.addColorStop(0, col + '44');
      g2.addColorStop(1, col + '00');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(vp.x, vp.y, r * 7, 0, Math.PI * 2);
      ctx.fill();

      // Selected: gold dashed ring
      if (sel) {
        ctx.strokeStyle = '#ffd060aa';
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(vp.x, vp.y, r * 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  }, [selectedNode]);

  useEffect(() => {
    if (!containerRef.current || !data) return;
    if (sigmaRef.current) { sigmaRef.current.kill(); sigmaRef.current = null; }

    const graph = new Graph();
    graphRef.current = graph;

    data.nodes.forEach(node => {
      graph.addNode(node.id, {
        label:  node.label,
        x:      Math.random() * 200 - 100,
        y:      Math.random() * 200 - 100,
        size:   getNodeSize(node),
        color:  getNodeColor(node),
      });
    });

    data.edges.forEach(edge => {
      if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) return;
      graph.addEdge(edge.source, edge.target, {
        size:  Math.max(0.3, Math.log10(Math.max(edge.total_amount, 1)) / 6),
        color: 'rgba(80,130,220,0.22)',
      });
    });

    forceAtlas2.assign(graph, {
      iterations: 150,
      settings: { ...forceAtlas2.inferSettings(graph), gravity: 1, scalingRatio: 3 },
    });

    const sigma = new Sigma(graph, containerRef.current, {
      renderEdgeLabels:             false,
      labelFont:                    '"Courier New", monospace',
      labelColor:                   { color: '#7a8fbb' },
      labelSize:                    10,
      labelRenderedSizeThreshold:   6,
      defaultEdgeType:              'line',
      minCameraRatio:               0.05,
      maxCameraRatio:               20,
    });

    sigma.on('clickNode',  ({ node }) => {
      const nd = data.nodes.find(n => n.id === node);
      if (nd) onNodeSelect(nd);
    });
    sigma.on('clickStage', () => onNodeSelect(null));
    sigma.on('afterRender', drawHalos);

    sigmaRef.current = sigma;

    // Sync halo canvas dimensions on resize
    const ro = new ResizeObserver(() => {
      if (!containerRef.current || !haloCanvasRef.current) return;
      haloCanvasRef.current.width  = containerRef.current.clientWidth;
      haloCanvasRef.current.height = containerRef.current.clientHeight;
      sigma.refresh();
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); sigma.kill(); };
  }, [data]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { drawHalos(); }, [selectedNode, drawHalos]);

  // Re-center camera on centeredNodeId
  useEffect(() => {
    if (!centeredNodeId || !sigmaRef.current || !graphRef.current) return;
    if (!graphRef.current.hasNode(centeredNodeId)) return;
    const { x, y } = graphRef.current.getNodeAttributes(centeredNodeId);
    sigmaRef.current.getCamera().animate({ x, y, ratio: 0.5 }, { duration: 600 });
  }, [centeredNodeId]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: 'var(--bg)' }}>
      <div className="star-field" />
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      <canvas
        ref={haloCanvasRef}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'screen' }}
      />
    </div>
  );
}
```

---

## Task 6: SankeyView — Recharts Sankey

**Files:**
- Create: `components/network/SankeyView.js`

- [ ] **Step 1: Create `components/network/SankeyView.js`**

```js
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
```

---

## Task 7: RadialView — Custom SVG depth-ring layout

**Files:**
- Create: `components/network/RadialView.js`

Renders nodes as concentric rings by depth using React JSX SVG elements. Click events are handled directly on each `<g>` element. No `dangerouslySetInnerHTML`.

- [ ] **Step 1: Create `components/network/RadialView.js`**

```js
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
```

---

## Task 8: NetworkClient + /network page

**Files:**
- Create: `components/network/NetworkClient.js`
- Create: `app/network/page.js`

- [ ] **Step 1: Create `components/network/NetworkClient.js`**

```js
'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import VizSwitcher from './VizSwitcher';
import DetailPanel from './DetailPanel';
import ForceView from './ForceView';
import SankeyView from './SankeyView';
import RadialView from './RadialView';

function fmtCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}K`;
  return `${n}`;
}

function NetworkClientInner({ data }) {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [mode,           setMode]           = useState(searchParams.get('viz') || 'force');
  const [selectedNode,   setSelectedNode]   = useState(null);
  const [centeredNodeId, setCenteredNodeId] = useState(null);
  const [search,         setSearch]         = useState('');

  // Resolve initial node from URL params on mount
  useEffect(() => {
    const acct  = searchParams.get('acct');
    const donor = searchParams.get('donor');
    if (acct) {
      const n = data.nodes.find(node => node.acct_num === acct);
      if (n) { setSelectedNode(n); setCenteredNodeId(n.id); }
    } else if (donor) {
      const norm = donor.toUpperCase();
      const n = data.nodes.find(node => node.label.toUpperCase() === norm);
      if (n) { setSelectedNode(n); setCenteredNodeId(n.id); }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleModeChange = useCallback((m) => {
    setMode(m);
    const params = new URLSearchParams(searchParams.toString());
    params.set('viz', m);
    router.replace(`/network?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const handleNodeSelect = useCallback((node) => {
    setSelectedNode(node);
    if (node) {
      const params = new URLSearchParams();
      params.set('viz', mode);
      if (node.acct_num) params.set('acct', node.acct_num);
      else params.set('donor', node.label);
      router.replace(`/network?${params.toString()}`, { scroll: false });
    }
  }, [router, mode]);

  const handleRecenter = useCallback((node) => {
    setCenteredNodeId(node.id);
    // Clear after animation completes so future clicks re-trigger
    setTimeout(() => setCenteredNodeId(null), 700);
  }, []);

  const handleSearchSubmit = useCallback((e) => {
    e.preventDefault();
    if (!search.trim()) return;
    const q = search.trim().toUpperCase();
    const match = data.nodes.find(n => n.label.toUpperCase().includes(q));
    if (match) { handleNodeSelect(match); handleRecenter(match); }
  }, [search, data, handleNodeSelect, handleRecenter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 49px)' }}>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
        padding: '0.6rem 1rem',
        borderBottom: '1px solid var(--border)',
        background: 'rgba(8,8,24,0.9)',
        flexShrink: 0,
      }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.4rem' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entities..."
            style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
              color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem',
              padding: '0.3rem 0.6rem', borderRadius: '3px', width: '200px', outline: 'none',
            }}
          />
          <button type="submit" style={{
            padding: '0.3rem 0.7rem', background: 'transparent',
            border: '1px solid var(--border)', color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)', fontSize: '0.78rem', cursor: 'pointer', borderRadius: '3px',
          }}>→</button>
        </form>

        <VizSwitcher activeMode={mode} onChange={handleModeChange} />

        <span style={{
          marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-dim)',
          padding: '0.2rem 0.6rem', border: '1px solid var(--border)', borderRadius: '999px',
        }}>
          {fmtCount(data.meta.total_nodes)} nodes · {fmtCount(data.meta.total_edges)} edges
        </span>
      </div>

      {/* Graph + Panel */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {mode === 'force' && (
            <ForceView
              data={data}
              selectedNode={selectedNode}
              onNodeSelect={handleNodeSelect}
              centeredNodeId={centeredNodeId}
            />
          )}
          {mode === 'sankey' && (
            <SankeyView data={data} onNodeSelect={handleNodeSelect} />
          )}
          {mode === 'radial' && (
            <RadialView
              data={data}
              centerNodeId={centeredNodeId || data.nodes.find(n => n.depth === 0)?.id}
              selectedNode={selectedNode}
              onNodeSelect={handleNodeSelect}
            />
          )}
        </div>

        <DetailPanel node={selectedNode} graphData={data} onRecenter={handleRecenter} />
      </div>
    </div>
  );
}

// Wrap in Suspense because useSearchParams requires it in App Router
export default function NetworkClient({ data }) {
  return (
    <Suspense fallback={
      <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-dim)' }}>
        Loading...
      </div>
    }>
      <NetworkClientInner data={data} />
    </Suspense>
  );
}
```

- [ ] **Step 2: Create `app/network/page.js`**

```js
import { loadNetworkGraph } from '@/lib/loadNetworkGraph';
import NetworkClient from '@/components/network/NetworkClient';

export const metadata = {
  title: 'Political Influence Network | FL Donor Tracker',
};

export default function NetworkPage() {
  const data = loadNetworkGraph();
  return <NetworkClient data={data} />;
}
```

- [ ] **Step 3: Start dev server and do full end-to-end verification**

```bash
cd "/Users/loganrubenstein/Claude Projects/florida-donor-tracker"
npm run dev
```

Check all of these at `http://localhost:3000`:

1. Home page renders, nav bar shows "FL DONOR TRACKER" + "Network" link
2. `/network` → dark background + star field + force-directed graph renders
3. Nodes are colored: orange (RPOF, depth-0 committee), teal (committee donors), green (corporate/individual)
4. Clicking a node → detail panel shows name, type badge, stats, Funded By list
5. "Re-center graph here" button → camera animates to the node
6. Switching to Sankey → Recharts Sankey diagram renders with flows
7. Switching to Radial → concentric rings with glowing nodes
8. `/network?acct=2024+rpof` → RPOF node selected and centered on load
9. `/network?donor=FRIENDS+OF+RON+DESANTIS` → DeSantis node selected
10. `/network?viz=sankey` → opens directly in Sankey mode

- [ ] **Step 4: Run unit tests**

```bash
npm test
```

Expected: `4 passed, 0 failed`.

---

## End-state verification

```bash
# Tests pass
npm test

# Build compiles without errors
npm run build

# Dev server runs
npm run dev
# then open http://localhost:3000/network
```

All 10 verification points from Step 3 above should pass visually.
