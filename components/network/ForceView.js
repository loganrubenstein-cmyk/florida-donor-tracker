'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import Graph from 'graphology';
import Sigma from 'sigma';

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

// Seed nodes shown on the default landing view — add new IDs here as more data is scraped
export const SEED_IDS = [
  'c_4700',                          // Republican Party of Florida
  'd_FRIENDS_OF_RON_DESANTIS',       // DeSantis PAC — #1 donor to RPOF
  'd_FLORIDA_POWER_LIGHT_COMPANY',   // FPL — biggest corporate donor in FL
  'c_61265',                         // AFSCME Florida — largest labor/Dem PAC
  'c_64840',                         // Advancing Florida Agriculture
  'c_80335',                         // Americans for Prosperity Action (Koch network)
];

const TOP_N_SPOKES = 5;

function getNodeColor(node) {
  if (node.data_pending) return '#334455';
  const party = getPartyAffiliation(node);
  if (node.type === 'committee') {
    if (party === 'R') return '#f87171';   // Republican red
    if (party === 'D') return '#60a5fa';   // Democrat blue
    return '#ffb060';                       // Unclassified committee — orange
  }
  if (node.type === 'corporate') return '#94a3b8';  // Slate — neutral industry money
  return '#c4b5fd';                                  // Soft purple — individuals / PACs
}

function getNodeSize(node, isSeed) {
  const v = Math.max(node.total_given || 0, node.total_received || 0, 1);
  const base = Math.max(4, Math.log10(v) * 2.8);
  return isSeed ? base * 1.5 : base;
}

function topNeighbors(nodeId, edges, n) {
  return edges
    .filter(e => e.source === nodeId || e.target === nodeId)
    .sort((a, b) => b.total_amount - a.total_amount)
    .slice(0, n)
    .map(e => (e.source === nodeId ? e.target : e.source));
}

function buildVisible(expandedIds, allNodes, allEdges) {
  const nodeMap = Object.fromEntries(allNodes.map(n => [n.id, n]));
  const visibleIds = new Set(expandedIds);
  for (const id of expandedIds) {
    for (const nbr of topNeighbors(id, allEdges, TOP_N_SPOKES)) visibleIds.add(nbr);
  }
  return {
    nodes: [...visibleIds].map(id => nodeMap[id]).filter(Boolean),
    edges: allEdges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target)),
  };
}

function spokeLayout(visibleNodes, visibleEdges, expandedIds) {
  const positions   = {};
  const expandedSet = new Set(expandedIds);
  const hubs        = visibleNodes.filter(n => expandedSet.has(n.id));
  const spokes      = visibleNodes.filter(n => !expandedSet.has(n.id));

  const HUB_R = Math.max(200, (hubs.length * 50) / (2 * Math.PI));
  hubs.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / hubs.length - Math.PI / 2;
    positions[n.id] = { x: HUB_R * Math.cos(angle), y: HUB_R * Math.sin(angle) };
  });

  const spokeHub = {};
  for (const spoke of spokes) {
    const e = visibleEdges
      .filter(e => e.source === spoke.id || e.target === spoke.id)
      .sort((a, b) => b.total_amount - a.total_amount)[0];
    if (e) spokeHub[spoke.id] = e.source === spoke.id ? e.target : e.source;
  }

  const hubGroups = {};
  for (const spoke of spokes) {
    const hub = spokeHub[spoke.id];
    if (hub && positions[hub]) {
      if (!hubGroups[hub]) hubGroups[hub] = [];
      hubGroups[hub].push(spoke.id);
    } else {
      positions[spoke.id] = { x: (Math.random() - 0.5) * 60, y: (Math.random() - 0.5) * 60 };
    }
  }

  for (const [hubId, ids] of Object.entries(hubGroups)) {
    const hp     = positions[hubId];
    const baseA  = Math.atan2(hp.y, hp.x);
    const spread = Math.min(Math.PI * 0.55, ids.length * 0.18);
    const r      = Math.max(130, (ids.length * 22) / (2 * Math.PI));
    ids.forEach((id, i) => {
      const t     = ids.length === 1 ? 0 : i / (ids.length - 1) - 0.5;
      positions[id] = {
        x: hp.x + r * Math.cos(baseA + spread * t),
        y: hp.y + r * Math.sin(baseA + spread * t),
      };
    });
  }
  return positions;
}

export default function ForceView({ data, selectedNode, onNodeSelect, centeredNodeId }) {
  const containerRef  = useRef(null);
  const haloCanvasRef = useRef(null);
  const sigmaRef      = useRef(null);
  const graphRef      = useRef(null);

  const [expandedIds, setExpandedIds] = useState(() =>
    SEED_IDS.filter(id => data.nodes.some(n => n.id === id))
  );

  const drawHalos = useCallback((selNode, expIds) => {
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
      const sel = selNode?.id === nodeId;

      // Single soft inner glow — much smaller than before
      const g = ctx.createRadialGradient(vp.x, vp.y, r * 0.6, vp.x, vp.y, r * 1.8);
      g.addColorStop(0,   col + '99');
      g.addColorStop(0.5, col + '33');
      g.addColorStop(1,   col + '00');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(vp.x, vp.y, r * 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Selection ring
      if (sel) {
        ctx.strokeStyle = '#ffd060cc';
        ctx.lineWidth   = 1.8;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(vp.x, vp.y, r * 2.8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Expanded indicator — subtle white ring
      if (expIds && expIds.includes(nodeId) && !sel) {
        ctx.strokeStyle = '#ffffff22';
        ctx.lineWidth   = 1;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.arc(vp.x, vp.y, r * 2.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current || !data) return;
    if (sigmaRef.current) { try { sigmaRef.current.kill(); } catch (_) {} sigmaRef.current = null; }
    // Remove any leftover canvases from previous sigma instance
    containerRef.current.querySelectorAll('canvas').forEach(c => c.remove());

    const { nodes: visNodes, edges: visEdges } = buildVisible(expandedIds, data.nodes, data.edges);
    const nodeMap   = Object.fromEntries(data.nodes.map(n => [n.id, n]));
    const positions = spokeLayout(visNodes, visEdges, expandedIds);

    const graph = new Graph();
    graphRef.current = graph;

    visNodes.forEach(node => {
      const pos    = positions[node.id] || { x: 0, y: 0 };
      const isSeed = SEED_IDS.includes(node.id);
      graph.addNode(node.id, {
        label: node.label,
        x:     pos.x,
        y:     pos.y,
        size:  getNodeSize(node, isSeed),
        color: getNodeColor(node),
      });
    });

    visEdges.forEach(edge => {
      if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) return;
      if (graph.hasEdge(edge.source, edge.target)) return;
      graph.addEdge(edge.source, edge.target, {
        size:  Math.max(0.5, Math.log10(Math.max(edge.total_amount, 1)) / 5),
        color: 'rgba(80,140,230,0.22)',
      });
    });

    // Set halo canvas size before sigma init so it's ready for the first afterRender
    if (haloCanvasRef.current && containerRef.current) {
      haloCanvasRef.current.width  = containerRef.current.clientWidth;
      haloCanvasRef.current.height = containerRef.current.clientHeight;
    }

    const sigma = new Sigma(graph, containerRef.current, {
      renderEdgeLabels:           false,
      labelFont:                  '"Courier New", monospace',
      labelColor:                 { color: '#8fa0cc' },
      labelSize:                  11,
      labelRenderedSizeThreshold: 3,
      defaultEdgeType:            'line',
      minCameraRatio:             0.05,
      maxCameraRatio:             20,
    });

    // Double rAF: wait for the browser to complete layout before refreshing.
    // setTimeout(0) fires before paint; two frames ensures the container has real dimensions.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (sigmaRef.current) sigmaRef.current.refresh();
      });
    });

    sigma.on('clickNode', ({ node }) => {
      const nd = nodeMap[node];
      if (!nd) return;
      onNodeSelect(nd);
      setExpandedIds(prev =>
        prev.includes(node) ? prev.filter(id => id !== node) : [...prev, node]
      );
    });
    sigma.on('clickStage', () => onNodeSelect(null));
    sigma.on('afterRender', () => drawHalos(selectedNode, expandedIds));
    sigmaRef.current = sigma;

    const ro = new ResizeObserver(() => {
      if (!containerRef.current || !haloCanvasRef.current) return;
      haloCanvasRef.current.width  = containerRef.current.clientWidth;
      haloCanvasRef.current.height = containerRef.current.clientHeight;
      if (sigmaRef.current) sigmaRef.current.refresh();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      try { sigma.kill(); } catch (_) {}
      sigmaRef.current = null;
      graphRef.current = null;
    };
  }, [data, expandedIds]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { drawHalos(selectedNode, expandedIds); }, [selectedNode, expandedIds, drawHalos]);

  useEffect(() => {
    if (!centeredNodeId || !sigmaRef.current || !graphRef.current) return;
    if (!graphRef.current.hasNode(centeredNodeId)) return;
    const { x, y } = graphRef.current.getNodeAttributes(centeredNodeId);
    sigmaRef.current.getCamera().animate({ x, y, ratio: 0.5 }, { duration: 600 });
  }, [centeredNodeId]);

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--bg)' }}>
      <div className="star-field" />
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      <canvas
        ref={haloCanvasRef}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'screen' }}
      />
      <div style={{
        position: 'absolute', bottom: '1.2rem', left: '50%', transform: 'translateX(-50%)',
        fontSize: '0.68rem', color: 'var(--text-dim)', letterSpacing: '0.08em',
        pointerEvents: 'none', whiteSpace: 'nowrap',
      }}>
        CLICK ANY NODE TO EXPAND · CLICK AGAIN TO COLLAPSE
      </div>
    </div>
  );
}
